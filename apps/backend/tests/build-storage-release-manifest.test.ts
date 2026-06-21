import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const scriptPath = join(repoRoot, "apps/backend/scripts/build-storage-release-manifest.mjs");

let tempDir: string | undefined;

function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

function updateCanonical(hash: ReturnType<typeof createHash>, value: string) {
  hash.update(`${value.length}:${value}`);
}

function expectedFrontendAssetTreeHash(files: Array<{
  key: string;
  content: string;
  contentType: string;
  contentEncoding: string;
}>) {
  const hash = createHash("sha256");
  hash.update("rabbithole-storage-frontend-assets-v1\n");

  for (const file of files.sort((a, b) => a.key.localeCompare(b.key))) {
    updateCanonical(hash, file.key);
    updateCanonical(hash, file.contentType);
    updateCanonical(hash, file.contentEncoding);
    updateCanonical(hash, String(Buffer.byteLength(file.content)));
    updateCanonical(hash, sha256(file.content));
  }

  return hash.digest("hex");
}

async function writeReleaseInputs(root: string) {
  const artifactsDir = join(root, "artifacts");
  const frontendDir = join(root, "frontend");

  await mkdir(artifactsDir, { recursive: true });
  await mkdir(frontendDir, { recursive: true });
  await writeFile(join(artifactsDir, "encrypted-storage.wasm.gz"), "wasm-bytes");
  await writeFile(join(artifactsDir, "storage-frontend.tar"), "archive-bytes");
  await writeFile(join(artifactsDir, "encrypted-storage.most"), "actor {}");
  await writeFile(join(frontendDir, "index.html"), "<!doctype html><title>Storage</title>");

  return {
    artifactsDir,
    frontendDir,
    outputPath: join(artifactsDir, "storage-release.json"),
    bodyPath: join(root, "release-body.md"),
  };
}

function git(cwd: string, args: string[]) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
  });
}

function runManifest(cwd: string, args: string[]) {
  execFileSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: {
      ...process.env,
      GITHUB_REF_NAME: "",
      STORAGE_RELEASE_VERSION: "",
      STORAGE_RELEASE_PREVIOUS_TAG: "",
    },
    stdio: "pipe",
  });
}

describe("build-storage-release-manifest", () => {
  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
    tempDir = undefined;
  });

  test("computes frontend asset tree hash from the frontend directory", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const artifactsDir = join(repoDir, "artifacts");
    const frontendDir = join(repoDir, "frontend");
    const nestedAssetsDir = join(frontendDir, "assets");
    const outputPath = join(artifactsDir, "storage-release.json");
    const bodyPath = join(tempDir, "release-body.md");

    await mkdir(artifactsDir, { recursive: true });
    await mkdir(nestedAssetsDir, { recursive: true });

    await writeFile(join(artifactsDir, "encrypted-storage.wasm.gz"), "wasm-bytes");
    await writeFile(join(artifactsDir, "storage-frontend.tar"), "archive-bytes-not-used-for-tree-hash");
    await writeFile(join(artifactsDir, "encrypted-storage.most"), "actor {}");

    const indexHtml = "<!doctype html><title>Storage</title>";
    const appJs = "console.log('storage');";
    const brotliJs = "compressed";

    await writeFile(join(frontendDir, "index.html"), indexHtml);
    await writeFile(join(nestedAssetsDir, "app.js"), appJs);
    await writeFile(join(nestedAssetsDir, "app.js.br"), brotliJs);
    await writeFile(join(frontendDir, "._index.html"), "ignored");
    await writeFile(join(nestedAssetsDir, "._app.js"), "ignored");

    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "chore(storage): prepare storage release fixture"]);

    runManifest(repoDir, [
      "--version", "9.9.9",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--compatible-from", "0.0.1",
      "--max-commits", "1",
    ]);

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));
    const releaseBody = await readFile(bodyPath, "utf8");
    const expectedHash = expectedFrontendAssetTreeHash([
      {
        key: "/assets/app.js",
        content: appJs,
        contentType: "text/javascript",
        contentEncoding: "identity",
      },
      {
        key: "/assets/app.js.br",
        content: brotliJs,
        contentType: "application/brotli",
        contentEncoding: "br",
      },
      {
        key: "/index.html",
        content: indexHtml,
        contentType: "text/html",
        contentEncoding: "identity",
      },
    ]);

    expect(manifest.frontendAssetTreeHash).toBe(expectedHash);
    expect(manifest.artifacts.frontend.sha256).toBe(sha256("archive-bytes-not-used-for-tree-hash"));
    expect(manifest.artifacts.stableSignature.name).toBe("encrypted-storage.most");
    expect(manifest.upgrade.compatibleFrom).toEqual(["0.0.1"]);
    expect(manifest.releaseNotes.source).toBe("generated");
    expect(manifest.releaseNotes.summary).toBe("Storage maintenance release.");
    expect(manifest.changelog).toBeUndefined();
    expect(releaseBody).toContain(`Frontend asset tree: \`sha256:${expectedHash}\``);
    expect(releaseBody).toContain("## Artifacts");
    expect(releaseBody).toContain("## Wasm Verification");
    expect(releaseBody).not.toContain("Technical changelog");
  });

  test("uses manual release notes when a release notes file is provided", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const artifactsDir = join(tempDir, "artifacts");
    const frontendDir = join(tempDir, "frontend");
    const outputPath = join(artifactsDir, "storage-release.json");
    const bodyPath = join(tempDir, "release-body.md");
    const notesPath = join(tempDir, "release-notes.json");

    await mkdir(artifactsDir, { recursive: true });
    await mkdir(frontendDir, { recursive: true });

    await writeFile(join(artifactsDir, "encrypted-storage.wasm.gz"), "wasm-bytes");
    await writeFile(join(artifactsDir, "storage-frontend.tar"), "archive-bytes");
    await writeFile(join(artifactsDir, "encrypted-storage.most"), "actor {}");
    await writeFile(join(frontendDir, "index.html"), "<!doctype html><title>Storage</title>");
    await writeFile(notesPath, JSON.stringify({
      summary: "This update makes storage upgrades clearer and safer.",
      sections: [
        {
          title: "Highlights",
          items: [
            "The upgrade dialog now explains what will change before installation.",
          ],
        },
      ],
    }));

    execFileSync(process.execPath, [
      scriptPath,
      "--version", "0.1.1",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--release-notes", notesPath,
      "--compatible-from", "0.1.0",
      "--max-commits", "1",
    ], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));
    const releaseBody = await readFile(bodyPath, "utf8");

    expect(manifest.releaseNotes).toEqual({
      source: "manual",
      summary: "This update makes storage upgrades clearer and safer.",
      sections: [
        {
          title: "Highlights",
          items: [
            "The upgrade dialog now explains what will change before installation.",
          ],
        },
      ],
    });
    expect(releaseBody).toContain("This update makes storage upgrades clearer and safer.");
    expect(releaseBody).toContain("- The upgrade dialog now explains what will change before installation.");
  });

  test("uses tag-specific markdown release notes file when it exists", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const { artifactsDir, frontendDir, outputPath, bodyPath } = await writeReleaseInputs(repoDir);
    const releaseNotesDir = join(repoDir, "apps/backend/release-notes");

    await mkdir(releaseNotesDir, { recursive: true });
    await writeFile(join(releaseNotesDir, "storage-v0.1.2.md"), [
      "Storage upgrades now show a clearer release review.",
      "",
      "## Highlights",
      "",
      "- Users can review compatible storage updates before installing.",
      "",
    ].join("\n"));
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "fix(storage): improve storage release dialog"]);

    runManifest(repoDir, [
      "--version", "0.1.2",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--max-commits", "5",
    ]);

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));
    const releaseBody = await readFile(bodyPath, "utf8");

    expect(manifest.releaseNotes).toEqual({
      source: "manual",
      summary: "Storage upgrades now show a clearer release review.",
      sections: [
        {
          title: "Highlights",
          items: [
            "Users can review compatible storage updates before installing.",
          ],
        },
      ],
    });
    expect(releaseBody).toContain("Storage upgrades now show a clearer release review.");
  });

  test("infers compatible versions from previous stable type signatures", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const { artifactsDir, frontendDir, outputPath, bodyPath } = await writeReleaseInputs(repoDir);
    const historyDir = join(tempDir, "history");

    await mkdir(join(repoDir, "apps/storage"), { recursive: true });
    await mkdir(join(historyDir, "storage-v0.1.0"), { recursive: true });
    await mkdir(join(historyDir, "storage-v0.1.1"), { recursive: true });
    await mkdir(join(historyDir, "storage-v0.2.0"), { recursive: true });
    await mkdir(join(historyDir, "storage-v1.0.0"), { recursive: true });
    await writeFile(join(historyDir, "storage-v0.1.0", "encrypted-storage.most"), "actor {}\n");
    await writeFile(join(historyDir, "storage-v0.1.1", "encrypted-storage.most"), "actor {}\n");
    await writeFile(join(historyDir, "storage-v0.2.0", "encrypted-storage.most"), "actor {}\n");
    await writeFile(join(historyDir, "storage-v1.0.0", "encrypted-storage.most"), "actor {}\n");
    await writeFile(join(repoDir, "apps/storage/app.ts"), "export const version = 1;\n");
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "feat(storage): first storage release"]);
    git(repoDir, ["tag", "storage-v0.1.0"]);
    git(repoDir, ["tag", "storage-v0.1.1"]);
    git(repoDir, ["tag", "storage-v0.2.0"]);
    git(repoDir, ["tag", "storage-v1.0.0"]);

    runManifest(repoDir, [
      "--version", "0.2.1",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--stable-signature-history-dir", historyDir,
      "--max-commits", "5",
    ]);

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));

    expect(manifest.upgrade.compatibleFrom).toEqual(["0.1.0", "0.1.1", "0.2.0"]);
  });

  test("allows a compatible major release when stable signatures are compatible", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const { artifactsDir, frontendDir, outputPath, bodyPath } = await writeReleaseInputs(repoDir);
    const historyDir = join(tempDir, "history");

    await mkdir(join(repoDir, "apps/storage"), { recursive: true });
    await mkdir(join(historyDir, "storage-v0.2.0"), { recursive: true });
    await writeFile(join(historyDir, "storage-v0.2.0", "encrypted-storage.most"), "actor {}\n");
    await writeFile(join(repoDir, "apps/storage/app.ts"), "export const version = 1;\n");
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "feat(storage)!: release storage v1"]);
    git(repoDir, ["tag", "storage-v0.2.0"]);

    runManifest(repoDir, [
      "--version", "1.0.0",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--stable-signature-history-dir", historyDir,
      "--max-commits", "5",
    ]);

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));

    expect(manifest.upgrade.compatibleFrom).toEqual(["0.2.0"]);
  });

  test("excludes releases with incompatible stable signatures", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const { artifactsDir, frontendDir, outputPath, bodyPath } = await writeReleaseInputs(repoDir);
    const historyDir = join(tempDir, "history");

    await mkdir(join(repoDir, "apps/storage"), { recursive: true });
    await mkdir(join(historyDir, "storage-v0.1.0"), { recursive: true });
    await writeFile(join(historyDir, "storage-v0.1.0", "encrypted-storage.most"), "actor {\n  stable var x : Nat\n}\n");
    await writeFile(join(artifactsDir, "encrypted-storage.most"), "actor {\n  stable var x : Text\n}\n");
    await writeFile(join(repoDir, "apps/storage/app.ts"), "export const version = 1;\n");
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "fix(storage): incompatible stable state"]);
    git(repoDir, ["tag", "storage-v0.1.0"]);

    runManifest(repoDir, [
      "--version", "0.1.1",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--stable-signature-history-dir", historyDir,
      "--max-commits", "5",
    ]);

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));

    expect(manifest.upgrade.compatibleFrom).toEqual([]);
  });

  test("adds the next rc prerelease suffix when requested", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const { artifactsDir, frontendDir, outputPath, bodyPath } = await writeReleaseInputs(repoDir);
    const historyDir = join(tempDir, "history");

    await mkdir(join(repoDir, "apps/storage"), { recursive: true });
    await mkdir(join(historyDir, "storage-v0.1.0-rc.1"), { recursive: true });
    await writeFile(join(historyDir, "storage-v0.1.0-rc.1", "encrypted-storage.most"), "actor {}\n");
    await writeFile(join(repoDir, "apps/storage/app.ts"), "export const version = 1;\n");
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "feat(storage): first storage rc"]);
    git(repoDir, ["tag", "storage-v0.1.0-rc.1"]);

    runManifest(repoDir, [
      "--version", "0.1.0",
      "--prerelease", "rc",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--stable-signature-history-dir", historyDir,
      "--max-commits", "5",
    ]);

    const manifest = JSON.parse(await readFile(outputPath, "utf8"));

    expect(manifest.version).toBe("0.1.0-rc.2");
    expect(manifest.tagName).toBe("storage-v0.1.0-rc.2");
    expect(manifest.upgrade.compatibleFrom).toEqual(["0.1.0-rc.1"]);
  });

  test("starts auto-versioned storage releases at 0.1.0 before the first storage tag", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-release-manifest-"));
    const repoDir = join(tempDir, "repo");
    const { artifactsDir, frontendDir, outputPath, bodyPath } = await writeReleaseInputs(repoDir);

    await mkdir(join(repoDir, "apps/storage"), { recursive: true });
    await writeFile(join(repoDir, "apps/storage/app.ts"), "export const version = 1;\n");
    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "test@example.com"]);
    git(repoDir, ["config", "user.name", "Storage Release Test"]);
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "feat(storage)!: make first public storage release"]);

    runManifest(repoDir, [
      "--auto-version",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--max-commits", "5",
      "--repo-url", "https://github.com/rabbithole-app/v2",
    ]);

    const initialManifest = JSON.parse(await readFile(outputPath, "utf8"));
    const initialReleaseBody = await readFile(bodyPath, "utf8");
    expect(initialManifest.version).toBe("0.1.0");
    expect(initialManifest.tagName).toBe("storage-v0.1.0");
    expect(initialManifest.changelog).toBeUndefined();
    expect(initialManifest.releaseNotes.summary).toBe("Storage release with 1 breaking change.");
    expect(initialReleaseBody).not.toContain("Full Changelog");

    git(repoDir, ["tag", "storage-v0.1.0"]);
    await writeFile(join(repoDir, "apps/storage/app.ts"), "export const version = 2;\n");
    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "fix(storage): patch storage release"]);

    runManifest(repoDir, [
      "--auto-version",
      "--artifacts-dir", artifactsDir,
      "--frontend-dir", frontendDir,
      "--output", outputPath,
      "--release-body", bodyPath,
      "--max-commits", "5",
      "--repo-url", "https://github.com/rabbithole-app/v2",
    ]);

    const patchManifest = JSON.parse(await readFile(outputPath, "utf8"));
    const patchReleaseBody = await readFile(bodyPath, "utf8");
    expect(patchManifest.version).toBe("0.1.1");
    expect(patchManifest.tagName).toBe("storage-v0.1.1");
    expect(patchManifest.changelog).toBeUndefined();
    expect(patchManifest.releaseNotes.summary).toBe("Storage release with 1 fix.");
    expect(patchReleaseBody).toContain("**Full Changelog**: https://github.com/rabbithole-app/v2/compare/storage-v0.1.0...storage-v0.1.1");
  });
});
