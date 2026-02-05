import type { CanisterFixture } from "@dfinity/pic";
import { uint8ArrayToHexString } from "@dfinity/utils";
import { sha256 } from "@noble/hashes/sha2";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "tar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import { STORAGE_FRONTEND_ARCHIVE_PATH } from "./setup/constants";
import { runHttpDownloaderQueueProcessor } from "./setup/github-outcalls";
import { Manager } from "./setup/manager";

const normalizeKey = (key: string) => key
  .split('/')
  .filter(v => !['', '.'].includes(v))
  .reduce((acc, v) => `${acc}/${v}`, '');

// Check if file is a macOS resource fork (AppleDouble format)
const isMacOSResourceFork = (path: string) => {
  const filename = path.split('/').pop() || '';
  return filename.startsWith('._');
};

type ExtractionResult = {
  files?: FileMetadata[];
  filesCount: bigint;
  progress?: { processed: bigint; total: bigint };
  status: "Complete" | "Decoding" | "Idle";
};

/**
 * Get extraction status for frontend asset from unified status
 */
type FileMetadata = { contentType: string; key: string; sha256: Uint8Array; size: bigint; };
// Function to extract tar.gz and calculate file hashes
async function extractAndCalculateHashes(
  tarFilePath: string,
): Promise<Map<string, string>> {
  // Create temporary directory for extraction
  const tempDir = await mkdtemp(join(tmpdir(), "tar-extractor-"));

  try {
    // Extract tar.gz (tar automatically detects gzip by extension)
    await extract({
      file: tarFilePath,
      cwd: tempDir,
    });

    // Create Map to store hashes: normalized path -> hex hash
    const hashMap = new Map<string, string>();

    // Recursively process all files
    async function processDirectory(dirPath: string, relativePath = "") {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativeFilePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          await processDirectory(fullPath, relativeFilePath);
        } else if (entry.isFile()) {
          // Skip macOS resource fork files
          if (isMacOSResourceFork(entry.name)) {
            continue;
          }

          // Read file and calculate SHA256
          const fileContent = await readFile(fullPath);
          const fileHash = uint8ArrayToHexString(sha256(fileContent));

          // Normalize path: remove ./ and add / at the beginning
          const normalizedPath = normalizeKey(relativeFilePath);

          hashMap.set(normalizedPath, fileHash);
        }
      }
    }

    await processDirectory(tempDir);

    return hashMap;
  } finally {
    // Remove temporary directory
    await rm(tempDir, { recursive: true, force: true });
  }
}

function getExtractionStatusFromFullStatus(
  status: Awaited<ReturnType<RabbitholeActorService["getReleasesFullStatus"]>>,
): ExtractionResult {
  // Find the first release with a .tar asset (plain or gzipped)
  for (const release of status.releases) {
    for (const asset of release.assets) {
      if ((asset.name.endsWith(".tar") || asset.name.endsWith(".tar.gz")) && asset.extractionStatus.length > 0) {
        const extractionStatus = asset.extractionStatus[0];

        if ("Complete" in extractionStatus) {
          const files = extractionStatus.Complete as FileMetadata[];
          return { status: "Complete", filesCount: BigInt(files.length), files };
        }
        if ("Decoding" in extractionStatus) {
          return {
            status: "Decoding",
            progress: extractionStatus.Decoding,
            filesCount: 0n,
          };
        }
        return { status: "Idle", filesCount: 0n };
      }
    }
  }
  return { status: "Idle", filesCount: 0n };
}

describe("Tar Extractor", () => {
  let manager: Manager;
  let backendFixture: CanisterFixture<RabbitholeActorService>;

  beforeAll(async () => {
    manager = await Manager.create();
    backendFixture = await manager.initBackendCanister();
  });

  afterAll(async () => {
    await manager.afterAll();
  });

  test("should download releases first", async () => {
    console.log("\n=== Downloading GitHub Releases ===");

    // Measure cycles before download
    const cyclesBefore = await manager.pic.getCyclesBalance(backendFixture.canisterId);
    console.log(`Cycles before download: ${cyclesBefore.toLocaleString()}`);

    // Run the HTTP downloader queue processor with mocked responses
    // Use unified API to check when downloads complete
    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () => {
        const { hasDownloadedRelease } = await backendFixture.actor.getReleasesFullStatus();
        return hasDownloadedRelease;
      }
    );
    await manager.pic.tick();

    // Measure cycles after download
    const cyclesAfter = await manager.pic.getCyclesBalance(backendFixture.canisterId);
    const cyclesUsed = cyclesBefore - cyclesAfter;
    console.log(`Cycles after download: ${cyclesAfter.toLocaleString()}`);
    console.log(`Cycles used for download: ${cyclesUsed.toLocaleString()}`);

    // Verify releases were downloaded using unified API
    const status = await backendFixture.actor.getReleasesFullStatus();
    expect(status.hasDownloadedRelease).toBe(true);
    console.log("GitHub releases downloaded successfully");
  });

  test("should have extraction status available via unified API", async () => {
    // Get full status and extract extraction info
    const fullStatus = await backendFixture.actor.getReleasesFullStatus();
    console.log("Default version key:", fullStatus.defaultVersionKey);

    const extractionInfo = getExtractionStatusFromFullStatus(fullStatus);
    console.log("Initial extraction status:", extractionInfo.status);

    // Status should exist (either Idle, Decoding, or Complete)
    expect(["Idle", "Decoding", "Complete"]).toContain(extractionInfo.status);
  });

  test("should wait for extraction to complete", { timeout: 360000 }, async () => {
    console.log("\n=== Waiting for Tar Extraction ===");

    // Measure cycles before extraction
    const cyclesBefore = await manager.pic.getCyclesBalance(backendFixture.canisterId);
    console.log(`Cycles before extraction: ${cyclesBefore.toLocaleString()}`);

    let attempts = 0;
    const maxAttempts = 50;

    // For a 3.7MB file with 256KB chunks, we need ~15 chunks
    // Each chunk schedules the next timer with #milliseconds 0
    // tick(N) processes N rounds in one call - much more efficient
    const ticksPerIteration = 20;

    while (attempts < maxAttempts) {
      // Process multiple rounds in a single tick() call
      await manager.pic.tick(ticksPerIteration);

      const fullStatus = await backendFixture.actor.getReleasesFullStatus();
      const extractionInfo = getExtractionStatusFromFullStatus(fullStatus);

      if (extractionInfo.status === "Complete") {
        // Measure cycles after extraction completed
        const cyclesAfter = await manager.pic.getCyclesBalance(backendFixture.canisterId);
        const cyclesUsed = cyclesBefore - cyclesAfter;
        console.log(`Cycles after extraction: ${cyclesAfter.toLocaleString()}`);
        console.log(`Cycles used for extraction: ${cyclesUsed.toLocaleString()}`);
        console.log(`Extracted files count: ${extractionInfo.filesCount}`);
        console.log("Extraction completed!");
        break;
      } else if (extractionInfo.status === "Decoding" && extractionInfo.progress) {
        const { processed, total } = extractionInfo.progress;
        const percent = total > 0n
          ? Number((processed * 100n) / total)
          : 0;
        // Periodically show cycles consumption during decoding
        const currentCycles = await manager.pic.getCyclesBalance(backendFixture.canisterId);
        const cyclesUsedSoFar = cyclesBefore - currentCycles;
        console.log(`Decoding progress: ${processed}/${total} (${percent}%) - Cycles used: ${cyclesUsedSoFar.toLocaleString()}`);
      } else if (extractionInfo.status === "Idle") {
        console.log("Status is Idle, waiting for extraction to start...");
      }

      attempts++;
    }

    // Verify extraction completed using unified API
    const finalStatus = await backendFixture.actor.getReleasesFullStatus();
    const finalExtraction = getExtractionStatusFromFullStatus(finalStatus);
    expect(finalExtraction.status).toBe("Complete");
  });

  test("should have extracted files count in unified status", async () => {
    const fullStatus = await backendFixture.actor.getReleasesFullStatus();
    const extractionInfo = getExtractionStatusFromFullStatus(fullStatus);

    console.log(`\n=== Extracted Files ===`);
    console.log(`Total files (from unified status): ${extractionInfo.filesCount}`);

    // Should have at least some files
    expect(extractionInfo.filesCount).toBeGreaterThan(0n);

    // Files metadata should be available in Complete status
    expect(extractionInfo.files).toBeDefined();
    const files = extractionInfo.files ?? [];
    console.log(`Total files (from Complete status): ${files.length}`);

    // Both should match
    expect(BigInt(files.length)).toBe(extractionInfo.filesCount);

    // Log first 10 files
    const sampleFiles = files.slice(0, 10);
    for (const file of sampleFiles) {
      console.log(`  ${file.key} (${file.size} bytes, ${file.contentType})`);
    }
    if (files.length > 10) {
      console.log(`  ... and ${files.length - 10} more files`);
    }
  });

  test("should verify extracted files match local archive hashes", { timeout: 60000 }, async () => {
    console.log("\n=== Verifying File Hashes ===");

    // Calculate hashes from local archive
    const localHashes = await extractAndCalculateHashes(STORAGE_FRONTEND_ARCHIVE_PATH);
    console.log(`Local archive contains ${localHashes.size} files`);

    // Get extracted files metadata from unified status (Complete contains file metadata)
    const fullStatus = await backendFixture.actor.getReleasesFullStatus();
    const extractionInfo = getExtractionStatusFromFullStatus(fullStatus);
    expect(extractionInfo.status).toBe("Complete");
    expect(extractionInfo.files).toBeDefined();
    const canisterFiles = extractionInfo.files ?? [];

    // Create Map from canister files: normalized path -> hex hash
    // Skip macOS resource fork files
    const canisterHashes = new Map<string, string>();
    for (const file of canisterFiles) {
      if (isMacOSResourceFork(file.key)) {
        continue;
      }
      const hashHex = uint8ArrayToHexString(new Uint8Array(file.sha256));
      const normalizedKey = normalizeKey(file.key);
      canisterHashes.set(normalizedKey, hashHex);
    }
    console.log(`Canister contains ${canisterHashes.size} files`);

    // Compare hashes
    const mismatches: string[] = [];
    const missing: string[] = [];
    const extra: string[] = [];

    // Check all local files
    for (const [localPath, localHash] of localHashes.entries()) {
      const canisterHash = canisterHashes.get(localPath);

      if (!canisterHash) {
        missing.push(localPath);
      } else if (canisterHash !== localHash) {
        mismatches.push(localPath);
      }
    }

    // Check files that exist in canister but not locally
    for (const [canisterPath] of canisterHashes.entries()) {
      if (!localHashes.has(canisterPath)) {
        extra.push(canisterPath);
      }
    }

    // Build error details only if there are errors
    const matchingCount = localHashes.size - mismatches.length - missing.length;
    const errorDetails =
      mismatches.length > 0 || missing.length > 0 || extra.length > 0
        ? `\nHash comparison failed:\n` +
          `  Total files: ${localHashes.size}\n` +
          `  Matching: ${matchingCount}\n` +
          `  Mismatches (${mismatches.length}): ${mismatches.slice(0, 10).join(", ")}${mismatches.length > 10 ? "..." : ""}\n` +
          `  Missing (${missing.length}): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}\n` +
          `  Extra (${extra.length}): ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? "..." : ""}`
        : "";

    console.log(`Matching files: ${matchingCount}/${localHashes.size}`);
    if (mismatches.length > 0) {
      console.log(`Mismatched files: ${mismatches.length}`);
    }
    if (missing.length > 0) {
      console.log(`Missing files: ${missing.length}`);
    }
    if (extra.length > 0) {
      console.log(`Extra files: ${extra.length}`);
    }

    // Verify that all hashes match
    expect(
      mismatches.length,
      errorDetails || `All ${localHashes.size} file hashes match`,
    ).toBe(0);
    expect(
      missing.length,
      errorDetails || "All files present in canister",
    ).toBe(0);

    console.log("\n✓ All file hashes verified successfully!");
  });

  test("should report release as deployment ready when extraction complete", async () => {
    const fullStatus = await backendFixture.actor.getReleasesFullStatus();
    console.log("Has downloaded release:", fullStatus.hasDownloadedRelease);
    console.log("Has deployment ready release:", fullStatus.hasDeploymentReadyRelease);

    // Find the release and check its status flags
    if (fullStatus.releases.length > 0) {
      const release = fullStatus.releases[0];
      console.log(`Release ${release.tagName} isDownloaded:`, release.isDownloaded);
      console.log(`Release ${release.tagName} isDeploymentReady:`, release.isDeploymentReady);

      // After extraction completes, the release should be deployment ready
      expect(release.isDownloaded).toBe(true);
      expect(release.isDeploymentReady).toBe(true);
    }

    expect(fullStatus.hasDownloadedRelease).toBe(true);
    expect(fullStatus.hasDeploymentReadyRelease).toBe(true);
  });
});
