import type { CanisterFixture } from "@dfinity/pic";
import { createIdentity } from "@dfinity/pic";
import { principalToSubAccount, toNullable, uint8ArrayToHexString } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  type Account,
  type CreateStorageOptions,
  type CreationStatus,
  type EncryptedStorageActorService,
  encryptedStorageIdlFactory,
  initEncryptedStorage,
  type RabbitholeActorService,
  type StorageInfo,
  UpdateInfo,
} from "@rabbithole/declarations";

import { CMC_CANISTER_ID, E8S_PER_ICP, ONE_TRILLION } from "./setup/constants";
import { frontendV2Content, runHttpDownloaderQueueProcessor } from "./setup/github-outcalls";
import { Manager } from "./setup/manager";

/**
 * Helper to find active (in-progress) storage from list
 */
function findActiveStorage(storages: StorageInfo[]): StorageInfo | null {
  for (const storage of storages) {
    const status = storage.status;
    if (!("Completed" in status) && !("Failed" in status)) {
      return storage;
    }
  }
  return null;
}

/**
 * Helper to format creation status for logging
 */
function formatCreationStatus(status: CreationStatus): string {
  if ("Pending" in status) return "Pending";
  if ("CheckingAllowance" in status) return "CheckingAllowance";
  if ("TransferringICP" in status) return `TransferringICP (${status.TransferringICP.amount} e8s)`;
  if ("NotifyingCMC" in status) return `NotifyingCMC (block ${status.NotifyingCMC.blockIndex})`;
  if ("CanisterCreated" in status) return `CanisterCreated (${status.CanisterCreated.canisterId.toText()})`;
  if ("InstallingWasm" in status) {
    const { processed, total } = status.InstallingWasm.progress;
    return `InstallingWasm (${processed}/${total})`;
  }
  if ("UploadingFrontend" in status) {
    const { processed, total } = status.UploadingFrontend.progress;
    return `UploadingFrontend (${processed}/${total})`;
  }
  if ("UpdatingControllers" in status) return `UpdatingControllers (${status.UpdatingControllers.canisterId.toText()})`;
  if ("UpgradingWasm" in status) {
    const { processed, total } = status.UpgradingWasm.progress;
    return `UpgradingWasm (${processed}/${total})`;
  }
  if ("UpgradingFrontend" in status) {
    const { processed, total } = status.UpgradingFrontend.progress;
    return `UpgradingFrontend (${processed}/${total})`;
  }
  if ("Completed" in status) return `Completed (${status.Completed.canisterId.toText()})`;
  if ("Failed" in status) return `Failed: ${status.Failed}`;
  return "Unknown";
}

/**
 * Format a Candid optional hash (Uint8Array) as hex string or "none"
 */
function formatOptionalHash(opt: [] | [number[] | Uint8Array]): string {
  const value = fromOptional(opt);
  if (!value) return "none";
  const hex = uint8ArrayToHexString(value);
  return hex.length > 16 ? `${hex.slice(0, 16)}...` : hex;
}

/**
 * Format UpdateInfo for human-readable console output
 */
function formatUpdateInfo(info: UpdateInfo): Record<string, unknown> {
  return {
    currentWasmHash: formatOptionalHash(info.currentWasmHash),
    availableWasmHash: formatOptionalHash(info.availableWasmHash),
    currentReleaseTag: fromOptional(info.currentReleaseTag) ?? "none",
    availableReleaseTag: fromOptional(info.availableReleaseTag) ?? "none",
    wasmUpdateAvailable: info.wasmUpdateAvailable,
    frontendUpdateAvailable: info.frontendUpdateAvailable,
  };
}

/**
 * Unwrap Candid optional: [] → undefined, [value] → value
 */
function fromOptional<T>(opt: [] | [T]): T | undefined {
  return opt.length > 0 ? opt[0] : undefined;
}

/**
 * Helper to poll storage status until completion or failure
 * Uses listStorages to get current status
 */
async function pollStorageStatus(
  manager: Manager,
  backendFixture: CanisterFixture<RabbitholeActorService>,
  maxAttempts = 120,
): Promise<CreationStatus | null> {
  let attempts = 0;
  let finalStatus: CreationStatus | null = null;

  while (attempts < maxAttempts) {
    await manager.pic.advanceTime(100);
    await manager.pic.tick(5);

    const storages = await backendFixture.actor.listStorages();
    const activeStorage = findActiveStorage(storages);

    if (!activeStorage) {
      // No active storage, check if we have any completed/failed
      if (storages.length > 0) {
        const latestStorage = storages[storages.length - 1];
        const status = latestStorage.status;
        if ("Completed" in status || "Failed" in status) {
          finalStatus = status;
          console.log(`  Status: ${formatCreationStatus(status)}`);
          break;
        }
      }
      attempts++;
      continue;
    }

    const status = activeStorage.status;

    if (attempts % 10 === 0 || "Completed" in status || "Failed" in status) {
      console.log(`  Status: ${formatCreationStatus(status)}`);
    }

    if ("Completed" in status || "Failed" in status) {
      finalStatus = status;
      break;
    }

    attempts++;
  }

  return finalStatus;
}

/**
 * Helper to wait for releases to be downloaded and ready for deployment
 */
async function waitForReleasesReady(
  manager: Manager,
  backendFixture: CanisterFixture<RabbitholeActorService>,
): Promise<void> {
  console.log("\n=== Waiting for GitHub Releases Download ===");

  // Use unified HTTP mocking from github-outcalls.ts
  await runHttpDownloaderQueueProcessor(
    manager.pic,
    async () => (await backendFixture.actor.getReleasesFullStatus()).hasDownloadedRelease,
  );
  await manager.pic.tick();

  // Wait for extraction to complete
  console.log("\n=== Waiting for Frontend Extraction ===");
  let extractionAttempts = 0;
  const maxExtractionAttempts = 50;
  const ticksPerIteration = 20;

  while (extractionAttempts < maxExtractionAttempts) {
    await manager.pic.tick(ticksPerIteration);

    const status = await backendFixture.actor.getReleasesFullStatus();
    if (status.hasDeploymentReadyRelease) {
      console.log("✓ Release is deployment ready");
      break;
    }

    // Log extraction progress
    for (const release of status.releases) {
      for (const asset of release.assets) {
        if (asset.extractionStatus.length > 0) {
          const extractionStatus = asset.extractionStatus[0];
          if ("Decoding" in extractionStatus) {
            const { processed, total } = extractionStatus.Decoding;
            const percent = total > 0n ? Number((processed * 100n) / total) : 0;
            if (extractionAttempts % 5 === 0) {
              console.log(`  Extraction: ${processed}/${total} (${percent}%)`);
            }
          }
        }
      }
    }

    extractionAttempts++;
  }

  // Verify deployment readiness
  const finalStatus = await backendFixture.actor.getReleasesFullStatus();
  expect(finalStatus.hasDeploymentReadyRelease).toBe(true);
  console.log("✓ Releases downloaded and extracted successfully");
}

describe("StorageDeployer", () => {
  let manager: Manager;
  let backendFixture: CanisterFixture<RabbitholeActorService>;

  beforeAll(async () => {
    manager = await Manager.create();
    backendFixture = await manager.initBackendCanister();
  });

  afterAll(async () => {
    await manager.afterAll();
  });

  // ═══════════════════════════════════════════════════════════════
  // LEDGER & CMC TESTS
  // ═══════════════════════════════════════════════════════════════

  test("should get ICP/XDR conversion rate from CMC", async () => {
    const rate = await manager.cmcActor.get_icp_xdr_conversion_rate();
    console.log("XDR per 10k ICP:", rate.data.xdr_permyriad_per_icp);
    expect(rate.data.xdr_permyriad_per_icp).toBeGreaterThan(0n);
  });

  test("should get ICP ledger balance", async () => {
    const balance = await manager.getMyBalances();
    console.log("Owner balance:", balance, "e8s");
    expect(balance).toBe(BigInt(1_000_000) * E8S_PER_ICP);
  });

  // ═══════════════════════════════════════════════════════════════
  // ICRC2 TRANSFER TESTS
  // ═══════════════════════════════════════════════════════════════

  test("should allow transfer ICP with sufficient allowance", async () => {
    const spender: Account = {
      owner: backendFixture.canisterId,
      subaccount: [principalToSubAccount(manager.ownerIdentity.getPrincipal())],
    };

    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);

    const initialCycles = ONE_TRILLION;
    const totalCycles = initialCycles + 500_000_000_000n;

    const rate = await manager.cmcActor.get_icp_xdr_conversion_rate();
    const requiredE8s = (totalCycles * 10_000n * E8S_PER_ICP) / (ONE_TRILLION * rate.data.xdr_permyriad_per_icp);
    const totalRequired = requiredE8s + 10_000n;

    // Approve spender
    const allowanceResult = await manager.icpLedgerActor.icrc2_approve({
      spender,
      amount: totalRequired,
      created_at_time: [],
      expected_allowance: [],
      expires_at: [],
      fee: [10_000n],
      from_subaccount: [],
      memo: [],
    });
    expect(allowanceResult).toHaveProperty("Ok");

    // Verify allowance
    const allowance = await manager.icpLedgerActor.icrc2_allowance({
      account: {
        owner: manager.ownerIdentity.getPrincipal(),
        subaccount: [],
      },
      spender,
    });
    expect(allowance.allowance).toBeGreaterThanOrEqual(totalRequired);

    // Transfer using icrc2_transfer_from (simulating what backend does)
    manager.icpLedgerActor.setPrincipal(backendFixture.canisterId);
    const transferResult = await manager.icpLedgerActor.icrc2_transfer_from({
      to: {
        owner: CMC_CANISTER_ID,
        subaccount: toNullable(principalToSubAccount(backendFixture.canisterId)),
      },
      fee: [10_000n],
      spender_subaccount: [principalToSubAccount(manager.ownerIdentity.getPrincipal())],
      from: {
        owner: manager.ownerIdentity.getPrincipal(),
        subaccount: [],
      },
      memo: [],
      created_at_time: [],
      amount: requiredE8s,
    });

    expect(transferResult).toHaveProperty("Ok");
  });

  test("should reject transfer with insufficient allowance", async () => {
    const transferTestIdentity = createIdentity("transferTestUser");

    // Mint some ICP for the test identity
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      from_subaccount: [],
      to: {
        owner: transferTestIdentity.getPrincipal(),
        subaccount: [],
      } as unknown as Account,
      amount: BigInt(1000) * E8S_PER_ICP,
      fee: [],
      memo: [],
      created_at_time: [],
    });

    const spender: Account = {
      owner: backendFixture.canisterId,
      subaccount: [principalToSubAccount(transferTestIdentity.getPrincipal())],
    };

    manager.icpLedgerActor.setIdentity(transferTestIdentity);

    const insufficientAmount = 100_000n;
    const transferAmount = ONE_TRILLION; // Much larger than allowance

    // Approve only a small amount
    await manager.icpLedgerActor.icrc2_approve({
      spender,
      amount: insufficientAmount,
      created_at_time: [],
      expected_allowance: [],
      expires_at: [],
      fee: [10_000n],
      from_subaccount: [],
      memo: [],
    });

    // Try to transfer more than allowed
    const transferResult = await manager.icpLedgerActor.icrc2_transfer_from({
      to: {
        owner: backendFixture.canisterId,
        subaccount: [],
      },
      fee: [10_000n],
      spender_subaccount: [principalToSubAccount(transferTestIdentity.getPrincipal())],
      from: {
        owner: transferTestIdentity.getPrincipal(),
        subaccount: [],
      },
      memo: [],
      created_at_time: [],
      amount: transferAmount,
    });

    expect(transferResult).toHaveProperty("Err");
    if ("Err" in transferResult) {
      expect(transferResult.Err).toHaveProperty("InsufficientAllowance");
    }

    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
  });

  // ═══════════════════════════════════════════════════════════════
  // STORAGE DEPLOYER ORCHESTRATOR TESTS
  // ═══════════════════════════════════════════════════════════════

  test("should check if storage deployer is running", async () => {
    const isRunning = await backendFixture.actor.isStorageDeployerRunning();
    console.log("Storage deployer running:", isRunning);
    expect(isRunning).toBe(true);
  });

  test("should return empty list of storages initially for new user", async () => {
    const newIdentity = createIdentity("newUserForStorageTest");
    backendFixture.actor.setIdentity(newIdentity);

    const storages = await backendFixture.actor.listStorages();
    expect(Array.isArray(storages)).toBe(true);
    expect(storages.length).toBe(0);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  // ═══════════════════════════════════════════════════════════════
  // E2E TESTS — FULL DEPLOYMENT FLOW
  // ═══════════════════════════════════════════════════════════════

  test("should have releases downloaded and deployment ready", { timeout: 360000 }, async () => {
    await waitForReleasesReady(manager, backendFixture);

    const status = await backendFixture.actor.getReleasesFullStatus();
    console.log("\n=== Releases Status ===");
    console.log("Releases count:", status.releasesCount);
    console.log("Has downloaded release:", status.hasDownloadedRelease);
    console.log("Has deployment ready release:", status.hasDeploymentReadyRelease);

    expect(status.hasDownloadedRelease).toBe(true);
    expect(status.hasDeploymentReadyRelease).toBe(true);
  });

  test("should complete full storage creation E2E flow", { timeout: 360000 }, async () => {
    console.log("\n=== E2E Storage Creation Test ===");

    // Use a fresh identity
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    // Mint ICP for this identity
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      from_subaccount: [],
      to: {
        owner: e2eTestIdentity.getPrincipal(),
        subaccount: [],
      } as unknown as Account,
      amount: BigInt(100_000) * E8S_PER_ICP,
      fee: [],
      memo: [],
      created_at_time: [],
    });

    // Setup allowance
    const spender: Account = {
      owner: backendFixture.canisterId,
      subaccount: [principalToSubAccount(e2eTestIdentity.getPrincipal())],
    };

    manager.icpLedgerActor.setIdentity(e2eTestIdentity);
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const initialCycles = ONE_TRILLION;
    const totalCycles = initialCycles + 500_000_000_000n;

    const rate = await manager.cmcActor.get_icp_xdr_conversion_rate();
    const requiredE8s = (totalCycles * 10_000n * E8S_PER_ICP) / (ONE_TRILLION * rate.data.xdr_permyriad_per_icp);
    const totalRequired = requiredE8s + 10_000n;

    console.log("Test user:", e2eTestIdentity.getPrincipal().toText());
    console.log("Required ICP e8s:", totalRequired);

    const allowanceResult = await manager.icpLedgerActor.icrc2_approve({
      spender,
      amount: totalRequired,
      created_at_time: [],
      expected_allowance: [],
      expires_at: [],
      fee: [10_000n],
      from_subaccount: [],
      memo: [],
    });
    expect(allowanceResult).toHaveProperty("Ok");

    // Verify releases are ready
    const releasesStatus = await backendFixture.actor.getReleasesFullStatus();
    expect(releasesStatus.hasDeploymentReadyRelease).toBe(true);

    // Start creation
    console.log("\n=== Starting Storage Creation ===");
    const options: CreateStorageOptions = {
      target: {
        Create: {
          initialCycles,
          subnetId: [manager.applicationSubnetId],
        },
      },
      releaseSelector: { LatestDraft: null },
      initArg: IDL.encode(initEncryptedStorage({ IDL }), [{
        owner: e2eTestIdentity.getPrincipal(),
        vetKeyName: 'dfx_test_key'
      }]),
    };

    const createResult = await backendFixture.actor.createStorage(options);
    console.log("Create result:", createResult);
    expect(createResult).toHaveProperty("ok");

    // Poll for completion using listStorages
    console.log("\n=== Polling Creation Status ===");
    const finalStatus = await pollStorageStatus(manager, backendFixture);

    expect(finalStatus).not.toBeNull();
    expect(finalStatus).toHaveProperty("Completed");

    if (finalStatus && "Completed" in finalStatus) {
      console.log("\n✓ E2E Storage Creation Completed!");
      const canisterId = finalStatus.Completed.canisterId;
      console.log("  Canister ID:", canisterId.toText());
    }

    // Verify storage is listed
    const storages = await backendFixture.actor.listStorages();
    console.log("\n=== Storage List ===");
    console.log("Number of storages:", storages.length);
    expect(storages.length).toBeGreaterThan(0);

    const storage = storages[0] as StorageInfo;
    console.log("Storage info:", {
      id: storage.id,
      canisterId: fromOptional(storage.canisterId)?.toText() ?? "none",
      releaseTag: storage.releaseTag,
      status: Object.keys(storage.status)[0],
    });

    expect(storage.status).toHaveProperty("Completed");
    expect(storage.canisterId.length).toBe(1);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should reject duplicate creation while in progress", async () => {
    const duplicateTestIdentity = createIdentity("duplicateTestUser");
    backendFixture.actor.setIdentity(duplicateTestIdentity);

    const duplicateOptions: CreateStorageOptions = {
      target: {
        Create: {
          initialCycles: ONE_TRILLION,
          subnetId: [manager.applicationSubnetId],
        },
      },
      releaseSelector: { LatestDraft: null },
      initArg: IDL.encode(initEncryptedStorage({ IDL }), [{
        owner: duplicateTestIdentity.getPrincipal(),
        vetKeyName: 'dfx_test_key'
      }]),
    };

    const result1 = await backendFixture.actor.createStorage(duplicateOptions);

    if ("ok" in result1) {
      // Check if there's an active creation using listStorages
      const storages = await backendFixture.actor.listStorages();
      const activeStorage = findActiveStorage(storages);

      if (activeStorage) {
        const result2 = await backendFixture.actor.createStorage(duplicateOptions);
        console.log("Duplicate create result:", result2);

        expect(result2).toHaveProperty("err");
        if ("err" in result2) {
          expect(result2.err).toHaveProperty("AlreadyInProgress");
        }
      }
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should allow creation with pre-existing canister (link mode)", { timeout: 120000 }, async () => {
    console.log("\n=== Testing Link Mode ===");

    const linkTestIdentity = createIdentity("linkModeTestUser");
    const preCreatedCanisterId = await manager.createCanister({
      controllers: [backendFixture.canisterId, linkTestIdentity.getPrincipal()]
    });
    console.log("Pre-created canister:", preCreatedCanisterId.toText());

    backendFixture.actor.setIdentity(linkTestIdentity);

    const linkOptions: CreateStorageOptions = {
      target: {
        Existing: preCreatedCanisterId,
      },
      releaseSelector: { LatestDraft: null },
      initArg: IDL.encode(initEncryptedStorage({ IDL }), [{
        owner: linkTestIdentity.getPrincipal(),
        vetKeyName: 'dfx_test_key'
      }]),
    };

    const result = await backendFixture.actor.createStorage(linkOptions);
    console.log("Link mode result:", result);
    expect(result).toHaveProperty("ok");

    // Poll for completion using listStorages
    const finalStatus = await pollStorageStatus(manager, backendFixture, 60);

    console.log("Link mode final status:", finalStatus ? formatCreationStatus(finalStatus) : "null");

    expect(finalStatus).not.toBeNull();
    expect(finalStatus).toHaveProperty("Completed");

    if (finalStatus && "Completed" in finalStatus) {
      expect(finalStatus.Completed.canisterId.toText()).toBe(preCreatedCanisterId.toText());
    }

    // Verify storage is listed
    const storages = await backendFixture.actor.listStorages();
    expect(storages.length).toBeGreaterThan(0);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  // ═══════════════════════════════════════════════════════════════
  // STORAGE UPGRADE TESTS
  // ═══════════════════════════════════════════════════════════════

  test("should report no update available when assets haven't changed", async () => {
    // Use e2e identity that already has a completed storage
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const storages = await backendFixture.actor.listStorages();
    expect(storages.length).toBeGreaterThan(0);

    const completedStorage = storages.find(s => "Completed" in s.status);
    expect(completedStorage).toBeDefined();
    if (!completedStorage) return;

    // updateAvailable should be empty since assets haven't changed
    expect(completedStorage.updateAvailable).toEqual([]);

    // checkStorageUpdate should also return empty
    const canisterId = fromOptional(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    const updateInfo = await backendFixture.actor.checkStorageUpdate(canisterId);
    expect(updateInfo).toEqual([]);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should reject upgrade when no update available", async () => {
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const storages = await backendFixture.actor.listStorages();
    const completedStorage = storages.find(s => "Completed" in s.status);
    expect(completedStorage).toBeDefined();
    if (!completedStorage) return;

    const canisterId = fromOptional(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    const result = await backendFixture.actor.upgradeStorage(canisterId, { All: null });

    expect(result).toHaveProperty("err");
    if ("err" in result) {
      expect(result.err).toHaveProperty("NoUpdateAvailable");
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should reject upgrade from non-owner", async () => {
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const storages = await backendFixture.actor.listStorages();
    const completedStorage = storages.find(s => "Completed" in s.status);
    expect(completedStorage).toBeDefined();
    if (!completedStorage) return;

    const canisterId = fromOptional(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    // Switch to different user
    const otherIdentity = createIdentity("otherUserForUpgrade");
    backendFixture.actor.setIdentity(otherIdentity);

    const result = await backendFixture.actor.upgradeStorage(canisterId, { All: null });
    expect(result).toHaveProperty("err");
    if ("err" in result) {
      expect(result.err).toHaveProperty("NotFound");
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should detect update available after assets change", { timeout: 360000 }, async () => {
    console.log("\n=== Testing Update Detection ===");
    backendFixture.actor.setIdentity(manager.ownerIdentity);

    // Remember original frontend hash before refresh
    const statusBefore = await backendFixture.actor.getReleasesFullStatus();
    const frontendAssetBefore = statusBefore.releases[0]?.assets.find(a => a.name.includes("frontend"));
    const originalHash = frontendAssetBefore?.sha256?.length === 1
      ? Buffer.from(frontendAssetBefore.sha256[0]).toString("hex")
      : "";
    console.log("Original frontend hash:", originalHash.slice(0, 16) + "...");

    // Call refreshReleases and mock HTTP outcalls concurrently
    // (same pattern as github-releases.test.ts)
    const refreshPromise = backendFixture.actor.refreshReleases();

    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () => {
        const status = await backendFixture.actor.getReleasesFullStatus();
        const frontendAsset = status.releases[0]?.assets.find(a => a.name.includes("frontend"));
        if (frontendAsset?.sha256?.length !== 1) return false;
        const currentHash = Buffer.from(frontendAsset.sha256[0]).toString("hex");
        return currentHash !== originalHash;
      },
      { frontend: frontendV2Content },
    );

    await refreshPromise;
    await manager.pic.tick();

    // Wait for frontend extraction
    let extractionAttempts = 0;
    while (extractionAttempts < 50) {
      await manager.pic.tick(20);
      const status = await backendFixture.actor.getReleasesFullStatus();
      if (status.hasDeploymentReadyRelease) break;
      extractionAttempts++;
    }

    const statusAfter = await backendFixture.actor.getReleasesFullStatus();
    console.log("Deployment ready:", statusAfter.hasDeploymentReadyRelease);

    // Now check update availability
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const storages = await backendFixture.actor.listStorages();
    const completedStorage = storages.find(s => "Completed" in s.status);
    expect(completedStorage).toBeDefined();
    if (!completedStorage) return;

    // Should have update available (at least frontend changed)
    expect(completedStorage.updateAvailable.length).toBe(1);

    const updateInfo = fromOptional(completedStorage.updateAvailable);
    expect(updateInfo).toBeDefined();
    if (!updateInfo) return;

    console.log("Update available:", formatUpdateInfo(updateInfo));
    expect(updateInfo.frontendUpdateAvailable).toBe(true);

    // checkStorageUpdate (public query) should also work
    const canisterId = fromOptional(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    const queryUpdateInfo = fromOptional(await backendFixture.actor.checkStorageUpdate(canisterId));
    expect(queryUpdateInfo).toBeDefined();
    if (!queryUpdateInfo) return;

    expect(queryUpdateInfo.frontendUpdateAvailable).toBe(true);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should allow checkStorageUpdate from any caller (public query)", async () => {
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const storages = await backendFixture.actor.listStorages();
    const completedStorage = storages.find(s => "Completed" in s.status);
    expect(completedStorage).toBeDefined();
    if (!completedStorage) return;

    const canisterId = fromOptional(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    // Call from anonymous/other user
    const anonymousIdentity = createIdentity("anonymousUpgradeChecker");
    backendFixture.actor.setIdentity(anonymousIdentity);

    const updateInfo = await backendFixture.actor.checkStorageUpdate(canisterId);
    // Should still return update info (public query)
    expect(updateInfo.length).toBe(1);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should upgrade storage frontend only", { timeout: 360000 }, async () => {
    console.log("\n=== Testing Frontend-Only Upgrade ===");

    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);

    const storages = await backendFixture.actor.listStorages();
    const completedStorage = storages.find(s => "Completed" in s.status);
    expect(completedStorage).toBeDefined();
    if (!completedStorage) return;

    const canisterId = fromOptional(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    // Step 1: Add backend as controller (simulates what frontend does)
    await manager.pic.updateCanisterSettings({
      canisterId,
      sender: e2eTestIdentity.getPrincipal(),
      controllers: [e2eTestIdentity.getPrincipal(), backendFixture.canisterId],
    });

    // Step 2: Grant backend Commit permission on assets
    const storageActor = manager.pic.createActor<EncryptedStorageActorService>(
      encryptedStorageIdlFactory,
      canisterId,
    );
    storageActor.setIdentity(e2eTestIdentity);
    await storageActor.grant_permission({
      to_principal: backendFixture.canisterId,
      permission: { Commit: null },
    });

    // Step 3: Call upgradeStorage
    backendFixture.actor.setIdentity(e2eTestIdentity);
    const upgradeResult = await backendFixture.actor.upgradeStorage(canisterId, { FrontendOnly: null });
    console.log("Upgrade result:", upgradeResult);
    expect(upgradeResult).toHaveProperty("ok");

    // Step 4: Poll for completion
    const finalStatus = await pollStorageStatus(manager, backendFixture);
    console.log("Final status:", finalStatus ? formatCreationStatus(finalStatus) : "null");

    expect(finalStatus).not.toBeNull();
    expect(finalStatus).toHaveProperty("Completed");

    // Step 5: Verify no more update available
    const storagesAfter = await backendFixture.actor.listStorages();
    const updatedStorage = storagesAfter.find(s =>
      "Completed" in s.status
      && fromOptional(s.canisterId)?.toText() === canisterId.toText()
    );
    expect(updatedStorage).toBeDefined();

    // Frontend was updated, but WASM may still show an update since we didn't change WASM assets
    // The frontendUpdateAvailable should be false now
    const updateAfter = fromOptional(await backendFixture.actor.checkStorageUpdate(canisterId));
    if (updateAfter) {
      console.log("Update after upgrade:", formatUpdateInfo(updateAfter));
      expect(updateAfter.frontendUpdateAvailable).toBe(false);
    }

    // Step 6: Verify controllers — backend should have removed itself
    const controllers = await manager.pic.getControllers(canisterId);
    console.log("Controllers after upgrade:", controllers.map(c => c.toText()));
    expect(controllers.map(c => c.toText())).toContain(e2eTestIdentity.getPrincipal().toText());
    expect(controllers.map(c => c.toText())).not.toContain(backendFixture.canisterId.toText());

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should return update info in listStorages", async () => {
    // Create a new storage for this test using link mode
    const updateInfoTestIdentity = createIdentity("updateInfoTestUser");
    const preCreatedCanisterId = await manager.createCanister({
      controllers: [backendFixture.canisterId, updateInfoTestIdentity.getPrincipal()]
    });

    backendFixture.actor.setIdentity(updateInfoTestIdentity);

    const linkOptions: CreateStorageOptions = {
      target: { Existing: preCreatedCanisterId },
      releaseSelector: { LatestDraft: null },
      initArg: IDL.encode(initEncryptedStorage({ IDL }), [{
        owner: updateInfoTestIdentity.getPrincipal(),
        vetKeyName: 'dfx_test_key'
      }]),
    };

    const result = await backendFixture.actor.createStorage(linkOptions);
    expect(result).toHaveProperty("ok");

    // Poll for completion
    const finalStatus = await pollStorageStatus(manager, backendFixture, 60);
    expect(finalStatus).toHaveProperty("Completed");

    // listStorages should include updateAvailable field
    const storages = await backendFixture.actor.listStorages();
    const newStorage = storages.find(s =>
      fromOptional(s.canisterId)?.toText() === preCreatedCanisterId.toText()
    );
    expect(newStorage).toBeDefined();
    if (!newStorage) return;

    // Since this was just created with current assets, there may or may not be an update
    // (depends on whether the v2 frontend is still the "latest" from the refresh above)
    // The important thing is that the field exists
    expect(newStorage).toHaveProperty("updateAvailable");

    const updateInfo = fromOptional(newStorage.updateAvailable);
    if (updateInfo) {
      console.log("Update info in listStorages:", formatUpdateInfo(updateInfo));
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });
});
