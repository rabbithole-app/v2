import type { CanisterFixture } from "@dfinity/pic";
import { fromDefinedNullable, uint8ArrayToHexString } from "@dfinity/utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { ExtractionStatus, RabbitholeActorService } from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager";
import { frontendV2Content, runHttpDownloaderQueueProcessor } from "./setup/github-outcalls";

/**
 * Helper to format asset download status for logging
 */
function formatDownloadStatus(downloadStatus: { Completed: { size: bigint } } | { Downloading: { chunksCompleted: bigint; chunksError: bigint; chunksTotal: bigint } } | { Error: string } | { NotStarted: null }): string {
  if ("Completed" in downloadStatus) {
    return `Completed (${downloadStatus.Completed.size} bytes)`;
  }
  if ("Downloading" in downloadStatus) {
    return `Downloading (${downloadStatus.Downloading.chunksCompleted}/${downloadStatus.Downloading.chunksTotal})`;
  }
  if ("Error" in downloadStatus) {
    return `Error: ${downloadStatus.Error}`;
  }
  return "NotStarted";
}

/**
 * Helper to format extraction status for logging
 */
function formatExtractionStatus(extractionStatus: [] | [ExtractionStatus]): string {
  if (extractionStatus.length === 0) {
    return "N/A";
  }
  const status = extractionStatus[0];
  if ("Complete" in status) {
    return `Complete (${status.Complete.length} files)`;
  }
  if ("Decoding" in status) {
    const percent = status.Decoding.total > 0n
      ? Number((status.Decoding.processed * 100n) / status.Decoding.total)
      : 0;
    return `Decoding (${status.Decoding.processed}/${status.Decoding.total}, ${percent}%)`;
  }
  return "Idle";
}

describe("GitHub Releases", () => {
  let manager: BackendManager;
  let backendFixture: CanisterFixture<RabbitholeActorService>;

  beforeAll(async () => {
    manager = await BackendManager.create();
    backendFixture = await manager.initBackendCanister();
  });

  afterAll(async () => {
    await manager.afterAll();
  });

  test("should have releases full status available", async () => {
    // Check initial releases status using unified API
    const status = await backendFixture.actor.getReleasesFullStatus();
    console.log("Initial releases full status:");
    console.log("  Releases count:", status.releasesCount);
    console.log("  Pending downloads:", status.pendingDownloads);
    console.log("  Completed downloads:", status.completedDownloads);
    console.log("  Has downloaded release:", status.hasDownloadedRelease);
    console.log("  Has deployment ready release:", status.hasDeploymentReadyRelease);
    console.log("  Default version key:", status.defaultVersionKey);

    // Initially should have no releases
    expect(status.releasesCount).toBe(0n);
    expect(status.pendingDownloads).toBe(0n);
    expect(status.completedDownloads).toBe(0n);
    expect(status.hasDownloadedRelease).toBe(false);
    expect(status.hasDeploymentReadyRelease).toBe(false);
  });

  test("should download releases via mocked HTTP outcalls", async () => {
    console.log("\n=== Downloading GitHub Releases ===");

    // Run the HTTP downloader queue processor with mocked responses
    // Use unified API to check readiness
    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () => (await backendFixture.actor.getReleasesFullStatus()).hasDownloadedRelease,
    );
    await manager.pic.tick();

    // Check status after download using unified API
    const status = await backendFixture.actor.getReleasesFullStatus();
    console.log("\n=== Final Releases Full Status ===");
    console.log("Releases count:", status.releasesCount);
    console.log("Pending downloads:", status.pendingDownloads);
    console.log("Completed downloads:", status.completedDownloads);
    console.log("Has downloaded release:", status.hasDownloadedRelease);
    console.log("Has deployment ready release:", status.hasDeploymentReadyRelease);

    for (const release of status.releases) {
      console.log(`\nRelease: ${release.tagName} (${release.name})`);
      console.log(`  Draft: ${release.draft}, Prerelease: ${release.prerelease}`);
      console.log(`  Is Downloaded: ${release.isDownloaded}`);
      console.log(`  Is Deployment Ready: ${release.isDeploymentReady}`);

      for (const asset of release.assets) {
        const downloadStr = formatDownloadStatus(asset.downloadStatus);
        const extractionStr = formatExtractionStatus(asset.extractionStatus);
        console.log(`  Asset: ${asset.name}`);
        console.log(`    Download: ${downloadStr}`);
        console.log(`    Extraction: ${extractionStr}`);
      }
    }

    // Verify releases were downloaded
    expect(status.releasesCount).toBeGreaterThan(0n);
  });

  test("should have downloaded release after download", async () => {
    const status = await backendFixture.actor.getReleasesFullStatus();
    console.log("Has downloaded release:", status.hasDownloadedRelease);
    console.log("Has deployment ready release:", status.hasDeploymentReadyRelease);

    // If downloads completed, should have a downloaded release
    if (status.completedDownloads > 0n) {
      expect(status.hasDownloadedRelease).toBe(true);
    }
  });

  test("should check individual release readiness via unified API", async () => {
    const status = await backendFixture.actor.getReleasesFullStatus();

    // Find the first release and check its status flags
    if (status.releases.length > 0) {
      const firstRelease = status.releases[0];
      console.log(`Release ${firstRelease.tagName} isDownloaded:`, firstRelease.isDownloaded);
      console.log(`Release ${firstRelease.tagName} isDeploymentReady:`, firstRelease.isDeploymentReady);

      // Check if all assets are downloaded
      const allDownloaded = firstRelease.assets.every(
        asset => "Completed" in asset.downloadStatus,
      );
      // Check if all .tar/.tar.gz assets are extracted
      const allExtracted = firstRelease.assets.every(asset => {
        // If no extraction status, it's not a tar asset
        if (asset.extractionStatus.length === 0) return true;
        const status = asset.extractionStatus[0];
        return "Complete" in status;
      });

      console.log(`  All downloaded: ${allDownloaded}`);
      console.log(`  All extracted: ${allExtracted}`);

      // isDownloaded should be true if all assets are downloaded
      if (allDownloaded) {
        expect(firstRelease.isDownloaded).toBe(true);
      }

      // isDeploymentReady should be true only if both downloaded AND extracted
      if (allDownloaded && allExtracted) {
        expect(firstRelease.isDeploymentReady).toBe(true);
      }
    }
  });

  test("should invalidate and re-download assets when hash changes", async () => {
    console.log("\n=== Testing Asset Invalidation ===");

    // Get status before invalidation
    const statusBefore = await backendFixture.actor.getReleasesFullStatus();
    expect(statusBefore.hasDownloadedRelease).toBe(true);

    const releaseBefore = statusBefore.releases[0];
    const frontendAssetBefore = releaseBefore?.assets.find(a => a.name.includes("frontend"));
    // const hashBefore = frontendAssetBefore?.sha256 ?? [];

    console.log("Status before invalidation:");
    console.log("  Has downloaded release:", statusBefore.hasDownloadedRelease);
    console.log("  Completed downloads:", statusBefore.completedDownloads);
    const hashBefore = frontendAssetBefore?.sha256 ? uint8ArrayToHexString(fromDefinedNullable(frontendAssetBefore?.sha256)) : undefined;
    console.log("  Frontend hash before:", hashBefore);
    console.log("  Frontend extraction:", formatExtractionStatus(frontendAssetBefore?.extractionStatus ?? []));

    // Verify we have a hash before invalidation
    expect(hashBefore).toBeDefined();

    console.log("\nTriggering refreshReleases with v2 frontend (different content)...");

    // Call refreshReleases and process HTTP outcalls concurrently
    // refreshReleases internally awaits HTTP outcalls, so we need to mock them in parallel
    const refreshPromise = backendFixture.actor.refreshReleases();

    // Process pending HTTP outcalls with v2 frontend asset
    // This simulates GitHub API reporting a new hash and serving new content
    // We wait until the hash CHANGES from the original (not just exists)
    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () => {
        const status = await backendFixture.actor.getReleasesFullStatus();
        const release = status.releases[0];
        const frontendAsset = release?.assets.find(a => a.name.includes("frontend"));
        // Check if hash changed from original (invalidation + re-download completed)
        if (frontendAsset?.sha256?.length !== 1) return false;
        const currentHash = uint8ArrayToHexString(fromDefinedNullable(frontendAsset.sha256));
        return currentHash !== hashBefore;
      },
      { frontend: frontendV2Content },
    );

    // Wait for refreshReleases to complete
    await refreshPromise;
    await manager.pic.tick();

    // Get status after invalidation and re-download
    const statusAfter = await backendFixture.actor.getReleasesFullStatus();
    const releaseAfter = statusAfter.releases[0];
    const frontendAssetAfter = releaseAfter?.assets.find(a => a.name.includes("frontend"));
    const hashAfter = frontendAssetAfter?.sha256 ? uint8ArrayToHexString(fromDefinedNullable(frontendAssetAfter?.sha256)) : undefined;

    console.log("\nStatus after invalidation:");
    console.log("  Has downloaded release:", statusAfter.hasDownloadedRelease);
    console.log("  Completed downloads:", statusAfter.completedDownloads);
    console.log("  Frontend hash after:", hashAfter);
    console.log("  Frontend extraction:", formatExtractionStatus(frontendAssetAfter?.extractionStatus ?? []));

    // Verify the release is still downloaded
    expect(statusAfter.hasDownloadedRelease).toBe(true);

    // Verify we have a new hash after re-download
    expect(hashAfter).toBeDefined();

    // The hash should be DIFFERENT because we downloaded v2 content
    console.log("\nHash comparison:");
    console.log("  Original hash (v1):", hashBefore);
    console.log("  New hash (v2):     ", hashAfter);

    // Verify the hash changed - this proves invalidation and re-download happened
    expect(hashAfter).not.toBe(hashBefore);

    console.log("\n=== Asset Invalidation Test Complete ===");
  });
});
