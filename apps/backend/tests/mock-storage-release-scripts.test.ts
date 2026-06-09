import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const createScript = join(repoRoot, "apps/backend/scripts/create-mock-storage-release.mjs");
const clearScript = join(repoRoot, "apps/backend/scripts/clear-dev-storage-releases.mjs");

let tempDir: string | undefined;

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sha256File(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

describe("mock storage release scripts", () => {
  afterEach(async () => {
    if (tempDir && existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
    tempDir = undefined;
  });

  test("creates a local dev release overlay without changing the committed baseline", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mock-storage-release-"));
    const mockRoot = join(tempDir, "mock");
    const frontendDir = join(tempDir, "frontend");
    const fixtureDir = join(tempDir, "fixtures");
    const baselineAssetsDir = join(mockRoot, "assets/storage-v0.1.0");
    const baselineApiPath = join(mockRoot, "api/releases.json");
    const localApiPath = join(mockRoot, "api/releases.local.json");
    const devTag = "storage-v0.1.1-dev";
    const devAssetsDir = join(mockRoot, "assets", devTag);

    await mkdir(join(mockRoot, "api"), { recursive: true });
    await mkdir(baselineAssetsDir, { recursive: true });
    await mkdir(frontendDir, { recursive: true });
    await mkdir(fixtureDir, { recursive: true });

    const baseline = [{
      url: "http://mock-server:8080/repos/mock/releases/releases/1",
      html_url: "http://mock-server:8080/releases/tag/storage-v0.1.0",
      id: 1,
      tag_name: "storage-v0.1.0",
      name: "Storage v0.1.0",
      body: "Baseline",
      draft: false,
      prerelease: false,
      immutable: false,
      created_at: "2024-01-15T12:00:00Z",
      published_at: "2024-01-15T12:00:00Z",
      assets: [],
    }];

    await writeFile(baselineApiPath, `${JSON.stringify(baseline, null, 2)}\n`);
    await writeFile(join(frontendDir, "index.html"), "<!doctype html><title>Storage</title>");
    await writeFile(join(fixtureDir, "encrypted-storage.wasm.gz"), "wasm");
    await writeFile(join(fixtureDir, "encrypted-storage.did"), "service : {}");
    await writeFile(join(fixtureDir, "encrypted-storage.most"), "actor {}");

    execFileSync(process.execPath, [
      createScript,
      "--mode", "dev",
      "--mock-root", mockRoot,
      "--frontend-dir", frontendDir,
      "--wasm-path", join(fixtureDir, "encrypted-storage.wasm.gz"),
      "--did-path", join(fixtureDir, "encrypted-storage.did"),
      "--stable-signature-path", join(fixtureDir, "encrypted-storage.most"),
      "--created-at", "2024-01-16T12:00:00.789Z",
      "--max-commits", "1",
    ], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const baselineAfter = await readJson(baselineApiPath);
    const local = await readJson(localApiPath);

    expect(baselineAfter).toEqual(baseline);
    expect(local.map((release: { tag_name: string }) => release.tag_name)).toEqual([
      devTag,
      "storage-v0.1.0",
    ]);

    const devRelease = local[0];
    expect(devRelease.draft).toBe(false);
    expect(devRelease.prerelease).toBe(true);
    expect(devRelease.created_at).toBe("2024-01-16T12:00:00Z");
    expect(devRelease.published_at).toBe("2024-01-16T12:00:00Z");
    expect(devRelease.assets.every((asset: { created_at: string; updated_at: string }) => (
      asset.created_at === "2024-01-16T12:00:00Z"
      && asset.updated_at === "2024-01-16T12:00:00Z"
    ))).toBe(true);
    expect(devRelease.assets.every((asset: { url: string }) => asset.url.includes(`/assets/${devTag}/`))).toBe(true);
    expect(existsSync(join(devAssetsDir, "storage-release.json"))).toBe(true);
    expect(existsSync(join(devAssetsDir, "storage-frontend.tar"))).toBe(true);
    expect(existsSync(join(devAssetsDir, "storage-release.md"))).toBe(false);

    execFileSync(process.execPath, [
      clearScript,
      "--mock-root", mockRoot,
    ], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    expect(existsSync(localApiPath)).toBe(false);
    expect(existsSync(devAssetsDir)).toBe(false);
    expect(existsSync(baselineAssetsDir)).toBe(true);
  });

  test("supports keeping multiple local dev version bumps", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mock-storage-bump-"));
    const mockRoot = join(tempDir, "mock");
    const frontendDir = join(tempDir, "frontend");
    const fixtureDir = join(tempDir, "fixtures");
    const baselineApiPath = join(mockRoot, "api/releases.json");
    const localApiPath = join(mockRoot, "api/releases.local.json");

    await mkdir(join(mockRoot, "api"), { recursive: true });
    await mkdir(frontendDir, { recursive: true });
    await mkdir(fixtureDir, { recursive: true });

    await writeFile(baselineApiPath, `${JSON.stringify([{
      url: "http://mock-server:8080/repos/mock/releases/releases/1",
      html_url: "http://mock-server:8080/releases/tag/storage-v0.1.0",
      id: 1,
      tag_name: "storage-v0.1.0",
      name: "Storage v0.1.0",
      body: "Baseline",
      draft: false,
      prerelease: false,
      immutable: false,
      created_at: "2024-01-15T12:00:00Z",
      published_at: "2024-01-15T12:00:00Z",
      assets: [],
    }], null, 2)}\n`);
    await writeFile(join(frontendDir, "index.html"), "<!doctype html><title>Storage</title>");
    await writeFile(join(fixtureDir, "encrypted-storage.wasm.gz"), "wasm");
    await writeFile(join(fixtureDir, "encrypted-storage.did"), "service : {}");
    await writeFile(join(fixtureDir, "encrypted-storage.most"), "actor {}");

    execFileSync(process.execPath, [
      createScript,
      "--mode", "dev",
      "--mock-root", mockRoot,
      "--frontend-dir", frontendDir,
      "--wasm-path", join(fixtureDir, "encrypted-storage.wasm.gz"),
      "--did-path", join(fixtureDir, "encrypted-storage.did"),
      "--stable-signature-path", join(fixtureDir, "encrypted-storage.most"),
      "--created-at", "2024-01-16T12:00:00Z",
      "--max-commits", "1",
    ], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    execFileSync(process.execPath, [
      createScript,
      "--mode", "dev",
      "--mock-root", mockRoot,
      "--frontend-dir", frontendDir,
      "--wasm-path", join(fixtureDir, "encrypted-storage.wasm.gz"),
      "--did-path", join(fixtureDir, "encrypted-storage.did"),
      "--stable-signature-path", join(fixtureDir, "encrypted-storage.most"),
      "--bump", "minor",
      "--keep-previous-dev",
      "--created-at", "2024-01-17T12:00:00Z",
      "--max-commits", "1",
    ], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const local = await readJson(localApiPath);
    const manifest = await readJson(join(mockRoot, "assets/storage-v0.2.0-dev/storage-release.json"));

    expect(local.map((release: { tag_name: string }) => release.tag_name)).toEqual([
      "storage-v0.2.0-dev",
      "storage-v0.1.1-dev",
      "storage-v0.1.0",
    ]);
    expect(manifest.version).toBe("0.2.0-dev");
    expect(manifest.upgrade.compatibleFrom).toEqual(["0.1.0"]);
  });

  test("does not inherit compatibleFrom while rewriting the baseline", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mock-storage-baseline-"));
    const mockRoot = join(tempDir, "mock");
    const frontendDir = join(tempDir, "frontend");
    const fixtureDir = join(tempDir, "fixtures");
    const baselineApiPath = join(mockRoot, "api/releases.json");
    const baselineAssetsDir = join(mockRoot, "assets/storage-v0.1.0");

    await mkdir(join(mockRoot, "api"), { recursive: true });
    await mkdir(frontendDir, { recursive: true });
    await mkdir(fixtureDir, { recursive: true });

    await writeFile(baselineApiPath, `${JSON.stringify([{
      url: "http://mock-server:8080/repos/mock/releases/releases/9",
      html_url: "http://mock-server:8080/releases/tag/storage-v0.1.9",
      id: 9,
      tag_name: "storage-v0.1.9",
      name: "Storage v0.1.9",
      body: "Old baseline",
      draft: false,
      prerelease: false,
      immutable: false,
      created_at: "2024-01-15T12:00:00Z",
      published_at: "2024-01-15T12:00:00Z",
      assets: [],
    }], null, 2)}\n`);
    await writeFile(join(frontendDir, "index.html"), "<!doctype html><title>Storage</title>");
    await writeFile(join(fixtureDir, "encrypted-storage.wasm.gz"), "wasm");
    await writeFile(join(fixtureDir, "encrypted-storage.did"), "service : {}");
    await writeFile(join(fixtureDir, "encrypted-storage.most"), "actor {}");

    execFileSync(process.execPath, [
      createScript,
      "--mode", "baseline",
      "--mock-root", mockRoot,
      "--frontend-dir", frontendDir,
      "--wasm-path", join(fixtureDir, "encrypted-storage.wasm.gz"),
      "--did-path", join(fixtureDir, "encrypted-storage.did"),
      "--stable-signature-path", join(fixtureDir, "encrypted-storage.most"),
      "--version", "0.1.0",
      "--created-at", "2024-01-16T12:00:00.789Z",
      "--max-commits", "1",
    ], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const baselineAfter = await readJson(baselineApiPath);
    const manifest = await readJson(join(baselineAssetsDir, "storage-release.json"));

    expect(baselineAfter.map((release: { tag_name: string }) => release.tag_name)).toEqual([
      "storage-v0.1.0",
    ]);
    expect(baselineAfter[0].created_at).toBe("2024-01-16T12:00:00Z");
    expect(manifest.upgrade.compatibleFrom).toEqual([]);
  });

  test("keeps committed mock release asset digests in sync with files", async () => {
    const mockRoot = join(repoRoot, "apps/backend/mock");
    const releases = await readJson(join(mockRoot, "api/releases.json"));

    for (const release of releases) {
      const tagName = release.tag_name;
      const releaseAssetsDir = join(mockRoot, "assets", tagName);

      for (const asset of release.assets) {
        const expectedDigest = String(asset.digest ?? "").replace(/^sha256:/, "");
        const assetPath = join(releaseAssetsDir, asset.name);
        const actualDigest = await sha256File(assetPath);
        const actualSize = (await stat(assetPath)).size;

        expect(actualDigest, `${tagName}/${asset.name}`).toBe(expectedDigest);
        expect(actualSize, `${tagName}/${asset.name} size`).toBe(asset.size);
      }

      const manifest = await readJson(join(releaseAssetsDir, "storage-release.json"));
      for (const [kind, artifact] of Object.entries(manifest.artifacts)) {
        const metadata = artifact as { name: string; sha256: string; size: number };
        const artifactPath = join(releaseAssetsDir, metadata.name);
        const actualDigest = await sha256File(artifactPath);
        const actualSize = (await stat(artifactPath)).size;

        expect(actualDigest, `${tagName}/manifest.artifacts.${kind}`).toBe(metadata.sha256);
        expect(actualSize, `${tagName}/manifest.artifacts.${kind} size`).toBe(metadata.size);
      }
    }
  });
});
