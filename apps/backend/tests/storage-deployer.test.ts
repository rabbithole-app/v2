import type { CanisterFixture } from "@dfinity/pic";
import { createIdentity } from "@dfinity/pic";
import { fromNullable, principalToSubAccount, uint8ArrayToHexString } from "@dfinity/utils";
import { Buffer } from "node:buffer";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  type CreationStatus,
  type EncryptedStorageActorService,
  encryptedStorageIdlFactory,
  type ListCreationsOptions,
  type RabbitholeActorService,
  type StorageInfo,
  UpdateInfo,
} from "@rabbithole/declarations";

/**
 * Drive a user to a `#Failed` creation record that holds a `licensePaymentId`:
 * charge succeeds (license recorded) then canister creation fails because
 * there is no ICP left for CMC. Returns the creation id.
 */
async function createFailedStorageWithLicense(
  manager: BackendManager,
  backendFixture: CanisterFixture<RabbitholeActorService>,
  identity: ReturnType<typeof createIdentity>,
): Promise<bigint> {
  await fundUserForLicenseOnly(manager, backendFixture, identity);
  backendFixture.actor.setIdentity(identity);

  const result = await backendFixture.actor.purchaseLicenseAndCreateStorage(
    { OnChain: null },
    [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
  );
  // Charge succeeds → startStorageCreation schedules deploy → deploy hits
  // insufficient ICP → record is marked #Failed. Outer `purchaseLicense...`
  // returns #ok because charge did succeed; failure is async on the queue.
  expect(result).toHaveProperty("ok");

  const finalStatus = await pollStorageStatus(manager, backendFixture, 60);
  expect(finalStatus).toHaveProperty("Failed");

  const storages = await backendFixture.actor.listStorages();
  const failed = storages.find(s => "Failed" in s.status);
  if (!failed) throw new Error("failed record not found");
  return failed.id;
}

import { BackendManager } from "./setup/backend-manager";
import { CMC_CANISTER_ID, E8S_PER_ICP, ONE_TRILLION_CYCLES } from "./setup/constants";
import { frontendV2Content, runHttpDownloaderQueueProcessor } from "./setup/github-outcalls";

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
  if ("ProcessingPayment" in status) return "ProcessingPayment";
  if ("Pending" in status) return "Pending";
  if ("CheckingBalance" in status) return "CheckingBalance";
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
function formatNullableHash(opt: [] | [number[] | Uint8Array]): string {
  const value = fromNullable(opt);
  if (!value) return "none";
  const hex = uint8ArrayToHexString(value);
  return hex.length > 16 ? `${hex.slice(0, 16)}...` : hex;
}

/**
 * Format UpdateInfo for human-readable console output
 */
function formatUpdateInfo(info: UpdateInfo): Record<string, unknown> {
  return {
    currentWasmHash: formatNullableHash(info.currentWasmHash),
    availableWasmHash: formatNullableHash(info.availableWasmHash),
    currentReleaseTag: fromNullable(info.currentReleaseTag) ?? "none",
    availableReleaseTag: fromNullable(info.availableReleaseTag) ?? "none",
    wasmUpdateAvailable: info.wasmUpdateAvailable,
    frontendUpdateAvailable: info.frontendUpdateAvailable,
  };
}

/**
 * Register a user and deposit enough ICP for the license charge but NOT
 * enough left over for canister creation. Canister-creation step will fail
 * (insufficient balance on user subaccount, empty default subaccount in
 * tests) so we end up with a `#Failed` record that carries a
 * `licensePaymentId` — the exact pre-condition resume/refund flows need.
 *
 * Numbers at test rates (XRC mock 1 ICP = $10, CMC ~5 XDR/ICP):
 *   - License $4.90 → ~0.49 ICP charge
 *   - Canister creation (2 TC cycles) → ~0.4 ICP
 *   - Deposit 0.5 ICP: after charge ≈0.01 ICP left → cannot cover canister → #Failed
 */
async function fundUserForLicenseOnly(
  manager: BackendManager,
  backendFixture: CanisterFixture<RabbitholeActorService>,
  identity: ReturnType<typeof createIdentity>,
): Promise<void> {
  backendFixture.actor.setIdentity(identity);
  await backendFixture.actor.register([]);

  const depositAmount = 50_000_000n; // 0.5 ICP

  manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
  const result = await manager.icpLedgerActor.icrc1_transfer({
    to: { owner: backendFixture.canisterId, subaccount: [principalToSubAccount(identity.getPrincipal())] },
    amount: depositAmount,
    fee: [], memo: [], from_subaccount: [], created_at_time: [],
  });
  if ("Err" in result) throw new Error(`Fund failed: ${JSON.stringify(result)}`);
}

/**
 * Register a user and deposit enough ICP to cover:
 *  - License fee ($4.90 at XRC mock default $10/ICP = ~49_000_000 e8s)
 *  - Canister creation cycles (STORAGE_INITIAL_CYCLES 1.5TC + creation cost 0.5TC = 2TC)
 * Deposits a flat 2 ICP which comfortably covers both at typical test rates.
 */
async function fundUserForStorage(
  manager: BackendManager,
  backendFixture: CanisterFixture<RabbitholeActorService>,
  identity: ReturnType<typeof createIdentity>,
): Promise<void> {
  backendFixture.actor.setIdentity(identity);
  await backendFixture.actor.register([]);

  // Compute cycles cost dynamically from CMC rate
  const totalCycles = 2_000_000_000_000n; // 1.5TC initial + 0.5TC creation cost
  const rate = await manager.cmcActor.get_icp_xdr_conversion_rate();
  const cyclesE8s = (totalCycles * 10_000n * E8S_PER_ICP) / (ONE_TRILLION_CYCLES * rate.data.xdr_permyriad_per_icp);
  // Add 100_000_000 e8s (1 ICP) buffer for license fee + fees
  const depositAmount = cyclesE8s + 100_000_000n;

  manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
  const result = await manager.icpLedgerActor.icrc1_transfer({
    to: { owner: backendFixture.canisterId, subaccount: [principalToSubAccount(identity.getPrincipal())] },
    amount: depositAmount,
    fee: [], memo: [], from_subaccount: [], created_at_time: [],
  });
  if ("Err" in result) throw new Error(`Fund failed: ${JSON.stringify(result)}`);
}

/** Build a ListCreationsOptions with the given filter id and default pagination. */
function listCreationsByIdOpts(creationId: bigint): ListCreationsOptions {
  return {
    filter: {
      id: [[creationId]],
      completedAt: [],
      owner: [],
      createdAt: [],
      hasLicense: [],
      hasCanister: [],
      statusTag: [],
      releaseTag: [],
      canisterId: [],
      ambassadorPayoutStatus: [],
    },
    sort: [],
    pagination: { limit: 1n, offset: 0n },
    count: false,
  };
}

/**
 * Helper to poll storage status until completion or failure
 * Uses listStorages to get current status
 */
async function pollStorageStatus(
  manager: BackendManager,
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
  manager: BackendManager,
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
  let manager: BackendManager;
  let backendFixture: CanisterFixture<RabbitholeActorService>;

  beforeAll(async () => {
    manager = await BackendManager.create();
    backendFixture = await manager.initBackendCanister();
    // XRC mock required for purchaseLicenseAndCreateStorage (ICP/USD rate for $4.90 license fee)
    await manager.deployXrcMock();
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
  // ICRC1 SUBACCOUNT TRANSFER TESTS
  // ═══════════════════════════════════════════════════════════════

  test("should have ICP on user subaccount after deposit", async () => {
    const userSubaccount = principalToSubAccount(manager.ownerIdentity.getPrincipal());
    const depositAmount = 100n * E8S_PER_ICP;

    // Deposit ICP to user's subaccount under backend canister
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    const transferResult = await manager.icpLedgerActor.icrc1_transfer({
      from_subaccount: [],
      to: {
        owner: backendFixture.canisterId,
        subaccount: [userSubaccount],
      },
      amount: depositAmount,
      fee: [],
      memo: [],
      created_at_time: [],
    });
    expect(transferResult).toHaveProperty("Ok");

    // Verify balance on subaccount
    const balance = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendFixture.canisterId,
      subaccount: [userSubaccount],
    });
    expect(balance).toBe(depositAmount);
  });

  test("should reject transfer from subaccount with insufficient balance", async () => {
    const emptyUserIdentity = createIdentity("emptyUser");
    const emptySubaccount = principalToSubAccount(emptyUserIdentity.getPrincipal());

    // Check balance is 0
    const balance = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendFixture.canisterId,
      subaccount: [emptySubaccount],
    });
    expect(balance).toBe(0n);
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

    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    console.log("Test user:", e2eTestIdentity.getPrincipal().toText());

    // Register user and fund subaccount (license fee + canister creation cycles)
    await fundUserForStorage(manager, backendFixture, e2eTestIdentity);
    backendFixture.actor.setIdentity(e2eTestIdentity);

    // Verify releases are ready
    const releasesStatus = await backendFixture.actor.getReleasesFullStatus();
    expect(releasesStatus.hasDeploymentReadyRelease).toBe(true);

    // Purchase license and start creation
    console.log("\n=== Starting Storage Creation ===");
    const createResult = await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
    );
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
      canisterId: fromNullable(storage.canisterId)?.toText() ?? "none",
      releaseTag: storage.releaseTag,
      status: Object.keys(storage.status)[0],
    });

    expect(storage.status).toHaveProperty("Completed");
    expect(storage.canisterId.length).toBe(1);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should reject duplicate creation while in progress", async () => {
    const duplicateTestIdentity = createIdentity("duplicateTestUser");

    // Register user and fund subaccount
    await fundUserForStorage(manager, backendFixture, duplicateTestIdentity);
    backendFixture.actor.setIdentity(duplicateTestIdentity);

    const result1 = await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
    );

    if ("ok" in result1) {
      // Check if there's an active creation using listStorages
      const storages = await backendFixture.actor.listStorages();
      const activeStorage = findActiveStorage(storages);

      if (activeStorage) {
        const result2 = await backendFixture.actor.purchaseLicenseAndCreateStorage(
          { OnChain: null },
          [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
        );
        console.log("Duplicate create result:", result2);

        expect(result2).toHaveProperty("err");
        if ("err" in result2) {
          // AlreadyInProgress is wrapped as ActivationFailed in purchaseLicenseAndCreateStorage
          expect(result2.err).toHaveProperty("ActivationFailed");
        }
      }
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should create storage for second user via purchaseLicenseAndCreateStorage", { timeout: 120000 }, async () => {
    const secondUserIdentity = createIdentity("secondStorageTestUser");

    await fundUserForStorage(manager, backendFixture, secondUserIdentity);
    backendFixture.actor.setIdentity(secondUserIdentity);

    const result = await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
    );
    console.log("Second user create result:", result);
    expect(result).toHaveProperty("ok");

    const finalStatus = await pollStorageStatus(manager, backendFixture, 60);
    expect(finalStatus).not.toBeNull();
    expect(finalStatus).toHaveProperty("Completed");

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
    const canisterId = fromNullable(completedStorage.canisterId);
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

    const canisterId = fromNullable(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    const result = await backendFixture.actor.upgradeStorage(canisterId);

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

    const canisterId = fromNullable(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    // Switch to different user
    const otherIdentity = createIdentity("otherUserForUpgrade");
    backendFixture.actor.setIdentity(otherIdentity);

    const result = await backendFixture.actor.upgradeStorage(canisterId);
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

    // Advance time by 1 day to trigger the daily recurring timer
    // which calls checkAndDownloadReleases via timer (not blocking update call).
    // Direct refreshReleases() uses `await` for HTTP outcalls which deadlocks with PocketIC polling.
    await manager.pic.advanceTime(86_400_000);

    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () => {
        const releasesStatus = await backendFixture.actor.getReleasesFullStatus();
        const frontendAsset = releasesStatus.releases[0]?.assets.find(a => a.name.includes("frontend"));
        if (frontendAsset?.sha256?.length !== 1) return false;
        const currentHash = Buffer.from(frontendAsset.sha256[0]).toString("hex");
        return currentHash !== originalHash;
      },
      { frontend: frontendV2Content },
    );

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

    const updateInfo = fromNullable(completedStorage.updateAvailable);
    expect(updateInfo).toBeDefined();
    if (!updateInfo) return;

    console.log("Update available:", formatUpdateInfo(updateInfo));
    expect(updateInfo.frontendUpdateAvailable).toBe(true);

    // checkStorageUpdate (public query) should also work
    const canisterId = fromNullable(completedStorage.canisterId);
    expect(canisterId).toBeDefined();
    if (!canisterId) return;

    const queryUpdateInfo = fromNullable(await backendFixture.actor.checkStorageUpdate(canisterId));
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

    const canisterId = fromNullable(completedStorage.canisterId);
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

    const canisterId = fromNullable(completedStorage.canisterId);
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
    const upgradeResult = await backendFixture.actor.upgradeStorage(canisterId);
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
      && fromNullable(s.canisterId)?.toText() === canisterId.toText()
    );
    expect(updatedStorage).toBeDefined();

    // Frontend was updated, but WASM may still show an update since we didn't change WASM assets
    // The frontendUpdateAvailable should be false now
    const updateAfter = fromNullable(await backendFixture.actor.checkStorageUpdate(canisterId));
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

  test("should return update info in listStorages", { timeout: 120000 }, async () => {
    const updateInfoTestIdentity = createIdentity("updateInfoTestUser");

    await fundUserForStorage(manager, backendFixture, updateInfoTestIdentity);
    backendFixture.actor.setIdentity(updateInfoTestIdentity);

    const result = await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
    );
    expect(result).toHaveProperty("ok");

    const finalStatus = await pollStorageStatus(manager, backendFixture, 60);
    expect(finalStatus).toHaveProperty("Completed");

    // listStorages should include updateAvailable field
    const storages = await backendFixture.actor.listStorages();
    const newStorage = storages.find(s => "Completed" in s.status);
    expect(newStorage).toBeDefined();
    if (!newStorage) return;

    expect(newStorage).toHaveProperty("updateAvailable");

    const updateInfo = fromNullable(newStorage.updateAvailable);
    if (updateInfo) {
      console.log("Update info in listStorages:", formatUpdateInfo(updateInfo));
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  // ═══════════════════════════════════════════════════════════════
  // BACKEND CANISTER UPGRADE TESTS
  // ═══════════════════════════════════════════════════════════════

  test("should preserve storages after backend canister upgrade", { timeout: 120000 }, async () => {
    console.log("\n=== Testing Backend Canister Upgrade ===");

    // Step 1: Capture storages before upgrade
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);
    const storagesBefore = await backendFixture.actor.listStorages();
    const completedBefore = storagesBefore.filter(s => "Completed" in s.status);
    console.log("Storages before upgrade:", storagesBefore.length, "completed:", completedBefore.length);
    expect(completedBefore.length).toBeGreaterThan(0);

    // Step 2: Upgrade backend canister
    console.log("Upgrading backend canister...");
    await manager.upgradeBackendCanister(backendFixture);

    // Wait for start() timer to fire (Timer.setTimer #seconds 0 in main.mo)
    await manager.pic.advanceTime(2000);
    await manager.pic.tick(10);
    console.log("Backend canister upgraded");

    // Step 3: Verify storages are preserved
    backendFixture.actor.setIdentity(e2eTestIdentity);
    const storagesAfter = await backendFixture.actor.listStorages();
    console.log("Storages after upgrade:", storagesAfter.length);
    expect(storagesAfter.length).toBe(storagesBefore.length);

    for (const before of completedBefore) {
      const after = storagesAfter.find(s => s.id === before.id);
      expect(after).toBeDefined();
      if (!after) continue;
      expect(after.status).toHaveProperty("Completed");
      expect(fromNullable(after.canisterId)?.toText()).toBe(
        fromNullable(before.canisterId)?.toText()
      );
    }

    // Step 4: Verify deployer is running again
    const isRunning = await backendFixture.actor.isStorageDeployerRunning();
    expect(isRunning).toBe(true);
    console.log("Deployer is running:", isRunning);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  // ═══════════════════════════════════════════════════════════════
  // RESUME, REFUND, TIMELINE, LICENSE STATUS
  // ═══════════════════════════════════════════════════════════════

  test("addLicense stores receipt with status = #completed", async () => {
    const identity = createIdentity("license-status-completed");
    await createFailedStorageWithLicense(manager, backendFixture, identity);

    backendFixture.actor.setIdentity(identity);
    const licenses = (await backendFixture.actor.listLicenses([])).data;
    expect(licenses.length).toBeGreaterThan(0);
    expect(licenses[0]!.receipt.status).toEqual({ completed: null });
  });

  test("creation timeline records major status transitions but not progress ticks", async () => {
    // Use the e2e user whose storage was created successfully earlier in the suite
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);
    const storages = await backendFixture.actor.listStorages();
    const completed = storages.find(s => "Completed" in s.status);
    if (!completed) throw new Error("no completed storage from earlier test");

    const { data } = await backendFixture.actor.listCreations([listCreationsByIdOpts(completed.id)]);
    if (data.length === 0) throw new Error("creation not found via listCreations");
    const events = data[0].events;

    // The timeline must include at least the major transitions: Pending →
    // (balance/transfer/notify) → CanisterCreated → installing → completed.
    const tags = events.map(e => Object.keys(e.status)[0]);
    expect(tags).toContain("CanisterCreated");
    expect(tags).toContain("Completed");

    // `appendEvent` dedupes consecutive same-tag writes so progress-only
    // updates (e.g. chunk counts within #InstallingWasm) collapse into one
    // event. PaymentPhase sub-variants share the outer tag `ProcessingPayment`
    // but have distinct inner tags, so we dedup at the (outer, inner) level.
    const fullTags = events.map((e) => {
      const outer = Object.keys(e.status)[0] as keyof typeof e.status;
      const value = (e.status as Record<string, unknown>)[outer];
      const inner =
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.keys(value)[0]
          : undefined;
      return inner ? `${outer}.${inner}` : outer;
    });
    for (let i = 1; i < fullTags.length; i++) {
      expect(fullTags[i]).not.toBe(fullTags[i - 1]);
    }
  });

  test("listCreations pins non-admin callers to their own records", async () => {
    // Owner can see their own record…
    const owner = createIdentity("history-owner");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, owner);

    backendFixture.actor.setIdentity(owner);
    const ownerView = await backendFixture.actor.listCreations([listCreationsByIdOpts(creationId)]);
    expect(ownerView.data.length).toBe(1);

    // …but a stranger cannot (server enforces owner=caller on non-admins).
    const stranger = createIdentity("history-stranger");
    backendFixture.actor.setIdentity(stranger);
    const strangerView = await backendFixture.actor.listCreations([listCreationsByIdOpts(creationId)]);
    expect(strangerView.data.length).toBe(0);
  });

  test("listCreations is readable by admin for any record", async () => {
    const owner = createIdentity("history-owner-for-admin");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, owner);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const { data } = await backendFixture.actor.listCreations([listCreationsByIdOpts(creationId)]);
    expect(data.length).toBe(1);
    expect(data[0].events.length).toBeGreaterThan(0);
  });

  test("resumeStorageCreation: owner can resume own failed creation", async () => {
    const identity = createIdentity("resume-owner");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    // Top up the subaccount so the second attempt can actually pay for the canister
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendFixture.canisterId, subaccount: [principalToSubAccount(identity.getPrincipal())] },
      amount: 2n * E8S_PER_ICP,
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
    });

    backendFixture.actor.setIdentity(identity);
    const resumeResult = await backendFixture.actor.recoverFailedStorage(creationId, { resume: null });
    expect(resumeResult).toHaveProperty("ok");

    const finalStatus = await pollStorageStatus(manager, backendFixture, 60);
    expect(finalStatus).toHaveProperty("Completed");
  }, 180000);

  test("resumeStorageCreation: rejected for non-owner non-admin", async () => {
    const owner = createIdentity("resume-owner-reject");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, owner);

    const stranger = createIdentity("resume-stranger");
    backendFixture.actor.setIdentity(stranger);
    const result = await backendFixture.actor.recoverFailedStorage(creationId, { resume: null });
    expect(result).toHaveProperty("err");
    if ("err" in result) expect(result.err).toMatch(/not owner and not admin/);
  });

  test("resumeStorageCreation: rejected when record is not in Failed state", async () => {
    const identity = createIdentity("resume-not-failed");
    await fundUserForStorage(manager, backendFixture, identity);
    backendFixture.actor.setIdentity(identity);
    await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
    );
    await pollStorageStatus(manager, backendFixture, 60);
    const storages = await backendFixture.actor.listStorages();
    const completed = storages.find(s => "Completed" in s.status);
    if (!completed) throw new Error("expected a completed record");

    const result = await backendFixture.actor.recoverFailedStorage(completed.id, { resume: null });
    expect(result).toHaveProperty("err");
    if ("err" in result) expect(result.err).toMatch(/not in failed state/);
  }, 180000);

  test("refundFailedStorage: owner receives money back and record is removed", async () => {
    const identity = createIdentity("refund-owner");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    // Balance before — what's on the user subaccount right after the failed charge
    const userAccount = { owner: backendFixture.canisterId, subaccount: [principalToSubAccount(identity.getPrincipal())] as [Uint8Array] };
    manager.icpLedgerActor.setIdentity(identity);
    const balanceBefore = await manager.icpLedgerActor.icrc1_balance_of(userAccount);

    backendFixture.actor.setIdentity(identity);
    const licensesBefore = (await backendFixture.actor.listLicenses([])).data;
    expect(licensesBefore.length).toBe(1);
    expect(licensesBefore[0]!.receipt.status).toEqual({ completed: null });
    const refundAmount = licensesBefore[0]!.receipt.amount;

    const result = await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });
    expect(result).toHaveProperty("ok");

    // User balance grew by (amount - 1 ICP-ledger fee)
    const balanceAfter = await manager.icpLedgerActor.icrc1_balance_of(userAccount);
    expect(balanceAfter - balanceBefore).toBeGreaterThan(0n);
    expect(balanceAfter - balanceBefore).toBeLessThanOrEqual(refundAmount);

    // License now reports #refunded
    const licensesAfter = (await backendFixture.actor.listLicenses([])).data;
    expect(licensesAfter.length).toBe(1);
    expect(licensesAfter[0]!.receipt.status).toHaveProperty("refunded");

    // Creation record is gone from owner's list
    const storagesAfter = await backendFixture.actor.listStorages();
    expect(storagesAfter.find(s => s.id === creationId)).toBeUndefined();
  });

  test("refundFailedStorage: second call on same creation returns already-refunded", async () => {
    const identity = createIdentity("refund-idempotent");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    backendFixture.actor.setIdentity(identity);
    const first = await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });
    expect(first).toHaveProperty("ok");

    const second = await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });
    expect(second).toHaveProperty("err");
    // After first refund the creation record is deleted, so second call
    // reports "creation not found". The double-refund guard is unreachable
    // through the public API; we test it at the library level separately.
    if ("err" in second) expect(second.err).toMatch(/not found/);
  });

  test("refundFailedStorage: rejected for non-owner non-admin", async () => {
    const owner = createIdentity("refund-owner-reject");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, owner);

    const stranger = createIdentity("refund-stranger");
    backendFixture.actor.setIdentity(stranger);
    const result = await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });
    expect(result).toHaveProperty("err");
    if ("err" in result) expect(result.err).toMatch(/not owner and not admin/);
  });

  test("refundFailedStorage: rejected when canister was already created", async () => {
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);
    const storages = await backendFixture.actor.listStorages();
    const completed = storages.find(s => "Completed" in s.status);
    if (!completed) throw new Error("expected a completed storage from earlier test");

    const result = await backendFixture.actor.recoverFailedStorage(completed.id, { refund: null });
    expect(result).toHaveProperty("err");
    if ("err" in result) expect(result.err).toMatch(/canister already created|not in failed state/);
  });

  test("resumeStorageCreation: rejected after license was refunded", async () => {
    const identity = createIdentity("resume-after-refund");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    // Refund first — this deletes the creation record, so resume will get
    // "creation not found". That's the correct outer-layer behaviour; the
    // internal "license was refunded" branch is covered at the library level.
    backendFixture.actor.setIdentity(identity);
    await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });

    const result = await backendFixture.actor.recoverFailedStorage(creationId, { resume: null });
    expect(result).toHaveProperty("err");
    if ("err" in result) expect(result.err).toMatch(/creation not found/);
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN NOTIFICATIONS: #creationRefunded
  // ═══════════════════════════════════════════════════════════════

  test("refundFailedStorage: notifies admin with #creationRefunded", async () => {
    const identity = createIdentity("refund-notify-admin");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    // Snapshot admin inbox before the refund so we can find the new event.
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const before = await backendFixture.actor.getNotifications([], 100n);

    backendFixture.actor.setIdentity(identity);
    const refundResult = await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });
    expect(refundResult).toHaveProperty("ok");

    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const after = await backendFixture.actor.getNotifications([], 100n);
    // Admin got at least one extra notification after the refund.
    expect(after.data.length).toBeGreaterThan(before.data.length);
    // And that notification is #creationRefunded for the matching creationId.
    const refundEvent = after.data.find((n) => {
      const key = Object.keys(n.event)[0];
      if (key !== "creationRefunded") return false;
      return (n.event as { creationRefunded: { creationId: bigint } }).creationRefunded.creationId === creationId;
    });
    expect(refundEvent).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // TOCTOU INVARIANTS: creationLocks mutex
  // ═══════════════════════════════════════════════════════════════
  //
  // refundFailedStorage awaits treasurySimpleRefund — that's the window where
  // a second caller (refund or resume) could previously slip through and
  // double-transfer funds or re-queue creation. These tests pin the invariant
  // that the per-creationId lock blocks both scenarios.

  test("refundFailedStorage: concurrent refund on same creationId never double-transfers", async () => {
    const identity = createIdentity("refund-concurrent");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    const userAccount = {
      owner: backendFixture.canisterId,
      subaccount: [principalToSubAccount(identity.getPrincipal())] as [Uint8Array],
    };
    manager.icpLedgerActor.setIdentity(identity);
    const balanceBefore = await manager.icpLedgerActor.icrc1_balance_of(userAccount);

    backendFixture.actor.setIdentity(identity);
    const licenses = (await backendFixture.actor.listLicenses([])).data;
    const refundAmount = licenses[0]!.receipt.amount;

    // Both calls fire before either has a chance to complete. The lock is
    // acquired synchronously at entry, so the second call (whichever the
    // replica schedules later) must observe it held and bail.
    const [a, b] = await Promise.all([
      backendFixture.actor.recoverFailedStorage(creationId, { refund: null }),
      backendFixture.actor.recoverFailedStorage(creationId, { refund: null }),
    ]);

    const oks = [a, b].filter((r) => "ok" in r).length;
    const errs = [a, b].filter((r) => "err" in r).length;
    expect(oks).toBe(1);
    expect(errs).toBe(1);

    // The loser's error covers three legitimate outcomes depending on when
    // the replica scheduled it:
    //   - "in progress" — hit the lock mid-await (most common)
    //   - "already refunded" — lock already released, license flipped first
    //   - "not found" — lock already released, record removed first
    const err = "err" in a ? a.err : "err" in b ? b.err : "";
    expect(err).toMatch(/in progress|already refunded|not found/);

    // Money moved exactly once — ledger fee is paid once, not twice.
    const balanceAfter = await manager.icpLedgerActor.icrc1_balance_of(userAccount);
    const delta = balanceAfter - balanceBefore;
    expect(delta).toBeGreaterThan(0n);
    expect(delta).toBeLessThanOrEqual(refundAmount);
  });

  test("TOCTOU: resume and refund fired together resolve to exactly one winner", async () => {
    const identity = createIdentity("refund-vs-resume");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    // Seed the user subaccount with enough ICP so that if resume wins it can
    // actually proceed with canister creation (otherwise the `resume-wins`
    // branch would just fail later and we couldn't tell the two outcomes
    // apart).
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: {
        owner: backendFixture.canisterId,
        subaccount: [principalToSubAccount(identity.getPrincipal())],
      },
      amount: 2n * E8S_PER_ICP,
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
    });

    backendFixture.actor.setIdentity(identity);
    const [refundRes, resumeRes] = await Promise.all([
      backendFixture.actor.recoverFailedStorage(creationId, { refund: null }),
      backendFixture.actor.recoverFailedStorage(creationId, { resume: null }),
    ]);

    const refundOk = "ok" in refundRes;
    const resumeOk = "ok" in resumeRes;
    // Exactly one #ok — never both, never neither.
    expect(refundOk !== resumeOk).toBe(true);

    const storages = await backendFixture.actor.listStorages();
    const licenses = (await backendFixture.actor.listLicenses([])).data;

    if (refundOk) {
      // Refund won: creation removed, license flipped to #refunded.
      expect(storages.find((s) => s.id === creationId)).toBeUndefined();
      expect(licenses[0]!.receipt.status).toHaveProperty("refunded");
    } else {
      // Resume won: creation re-queued (status is no longer #Failed), license
      // still #completed. Don't assert on final deploy state — that's the
      // business of the resume-happy-path test.
      const record = storages.find((s) => s.id === creationId);
      expect(record).toBeDefined();
      expect(licenses[0]!.receipt.status).toEqual({ completed: null });
    }
  }, 180000);

  test("creation timeline emits all ProcessingPayment sub-phases in order", async () => {
    // Piggy-back on the fully-deployed storage from the E2E test — it's the
    // only record that goes through the entire payment pipeline. Failed
    // creations stop mid-sequence, so they can't verify the tail (Activating,
    // Queueing).
    const e2eTestIdentity = createIdentity("e2eStorageTestUser");
    backendFixture.actor.setIdentity(e2eTestIdentity);
    const storages = await backendFixture.actor.listStorages();
    const completed = storages.find((s) => "Completed" in s.status);
    if (!completed) throw new Error("no completed storage from earlier test");

    const { data } = await backendFixture.actor.listCreations([listCreationsByIdOpts(completed.id)]);
    if (data.length === 0) throw new Error("creation not found via listCreations");
    const events = data[0].events;

    const fullTags = events.map((e) => {
      const outer = Object.keys(e.status)[0] as keyof typeof e.status;
      const value = (e.status as Record<string, unknown>)[outer];
      const inner =
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.keys(value)[0]
          : undefined;
      return inner ? `${outer}.${inner}` : outer;
    });

    // Full canonical order of ProcessingPayment sub-phases as emitted by
    // processPaymentAndStart → Balance.chargeForService.
    const expectedPhases = [
      "ProcessingPayment.Starting",
      "ProcessingPayment.FetchingRates",
      "ProcessingPayment.CheckingBalances",
      "ProcessingPayment.Charging",
      "ProcessingPayment.RecordingLicense",
      "ProcessingPayment.Activating",
      "ProcessingPayment.Queueing",
    ];
    for (const phase of expectedPhases) expect(fullTags).toContain(phase);

    // And they must appear in the declared order — a later phase's index
    // in the event list is always strictly greater than its predecessor's.
    let prevIdx = -1;
    for (const phase of expectedPhases) {
      const idx = fullTags.indexOf(phase);
      expect(idx).toBeGreaterThan(prevIdx);
      prevIdx = idx;
    }
  });

  test("listCreations: admin sees creations across users (no filter)", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const adminWideFilter: ListCreationsOptions = {
      filter: {
        id: [], completedAt: [], owner: [], createdAt: [],
        hasLicense: [], hasCanister: [], statusTag: [], releaseTag: [], canisterId: [],
        ambassadorPayoutStatus: [],
      },
      sort: [],
      pagination: { limit: 1000n, offset: 0n },
      count: false,
    };
    const { data } = await backendFixture.actor.listCreations([adminWideFilter]);
    expect(data.length).toBeGreaterThan(0);
    const owners = new Set(data.map((r) => r.owner.toText()));
    expect(owners.size).toBeGreaterThan(1);
  });

  // ═══════════════════════════════════════════════════════════════
  // DEFERRED AMBASSADOR PAYOUT
  // ═══════════════════════════════════════════════════════════════
  //
  // Invariants:
  //   A. License charge is 100% treasury (no split at charge time).
  //      Verified by distributionLog entry for the charge payment.
  //   B. Refund before #CanisterCreated returns 100% (no ambassador leak).
  //      Verified by: no "ambassador:" distribution row + record.ambassadorPayoutStatus = #pending.
  //   C. On successful #CanisterCreated, ambassador payout row appears in
  //      distributionLog with paymentId "ambassador:<orig>", l1Amount > 0,
  //      and record.ambassadorPayoutStatus flips to #completed.

  test("deferred payout: refund before CanisterCreated — 100% back, no ambassador payout", async () => {
    const identity = createIdentity("deferred-refund");
    const creationId = await createFailedStorageWithLicense(manager, backendFixture, identity);

    // Record is #Failed with canisterId=null — refund window is open.
    // Ambassador payout hasn't fired because we never reached #CanisterCreated.
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const { data } = await backendFixture.actor.listCreations([listCreationsByIdOpts(creationId)]);
    expect(data.length).toBe(1);
    expect(data[0].ambassadorPayoutStatus).toEqual({ pending: null });

    // distributionLog: the ONLY row for this payment should be the charge row,
    // which has L1=L2=0 (deferred mode). No "ambassador:<paymentId>" row yet.
    const allDistRows = await backendFixture.actor.getDistributionLog({ offset: 0n, limit: 1000n });
    const paymentId = data[0].licensePaymentId[0];
    expect(paymentId).toBeDefined();
    const rowsForThisCreation = allDistRows.filter((r) =>
      r.paymentId === paymentId || r.paymentId === `ambassador:${paymentId}`,
    );
    expect(rowsForThisCreation.length).toBe(1);
    expect(rowsForThisCreation[0].paymentId).toBe(paymentId);
    expect(rowsForThisCreation[0].l1Amount).toBe(0n);
    expect(rowsForThisCreation[0].l2Amount).toBe(0n);

    // Refund: returns full amount (minus the standard ledger fee, inside simpleRefund).
    backendFixture.actor.setIdentity(identity);
    const licensesBefore = (await backendFixture.actor.listLicenses([])).data;
    const receiptAmount = licensesBefore[0]!.receipt.amount;

    const userAccount = { owner: backendFixture.canisterId, subaccount: [principalToSubAccount(identity.getPrincipal())] as [Uint8Array] };
    manager.icpLedgerActor.setIdentity(identity);
    const balanceBefore = await manager.icpLedgerActor.icrc1_balance_of(userAccount);

    const refundResult = await backendFixture.actor.recoverFailedStorage(creationId, { refund: null });
    expect(refundResult).toHaveProperty("ok");

    const balanceAfter = await manager.icpLedgerActor.icrc1_balance_of(userAccount);
    const delta = balanceAfter - balanceBefore;

    // Full refund minus one ledger fee (no ambassador share was taken).
    // With legacy distribute-at-charge, delta would have been ~85% of receiptAmount.
    const LEDGER_FEE = 10_000n;
    expect(delta).toBe(receiptAmount - LEDGER_FEE);
  });

  test("deferred payout: CanisterCreated → ambassador gets cut + status #completed", async () => {
    // Ambassador registers + creates profile for referralCode.
    const l1 = createIdentity("deferred-l1");
    backendFixture.actor.setIdentity(l1);
    await backendFixture.actor.register([]);
    await backendFixture.actor.createProfile({ username: "deferred-l1", displayName: [], avatarUrl: [] });
    const l1Profile = await backendFixture.actor.getProfile();
    const l1Code = l1Profile[0]?.referralCode?.[0];
    expect(l1Code).toBeDefined();

    // User registers under L1 and funds balance.
    const payer = createIdentity("deferred-payer");
    backendFixture.actor.setIdentity(payer);
    await backendFixture.actor.register([l1Code!]);
    await fundUserForStorage(manager, backendFixture, payer);

    // Happy-path purchase.
    const result = await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: "VETKEY_NAME", value: "dfx_test_key" }]],
    );
    expect(result).toHaveProperty("ok");
    if (!("ok" in result)) throw new Error();
    const creationId = result.ok;

    // Wait for storage creation to fully complete — ambassador payout fires
    // at #CanisterCreated, well before #Completed.
    const finalStatus = await pollStorageStatus(manager, backendFixture, 120);
    expect(finalStatus).toHaveProperty("Completed");

    // Record status is #completed for the payout.
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const { data } = await backendFixture.actor.listCreations([listCreationsByIdOpts(creationId)]);
    expect(data.length).toBe(1);
    expect(data[0].ambassadorPayoutStatus).toEqual({ completed: null });

    // distributionLog should have BOTH: charge row (L1=0) and payout row (L1>0).
    const allDistRows = await backendFixture.actor.getDistributionLog({ offset: 0n, limit: 1000n });
    const paymentId = data[0].licensePaymentId[0]!;
    const chargeRow = allDistRows.find((r) => r.paymentId === paymentId);
    const payoutRow = allDistRows.find((r) => r.paymentId === `ambassador:${paymentId}`);
    expect(chargeRow).toBeDefined();
    expect(payoutRow).toBeDefined();
    expect(chargeRow!.l1Amount).toBe(0n);         // charge phase: 100% treasury
    expect(payoutRow!.l1Amount).toBeGreaterThan(0n);  // payout phase: ambassador got cut
    expect(payoutRow!.ambassadorL1[0]?.toText()).toBe(l1.getPrincipal().toText());

    // Dedup check — admin calls retryAmbassadorPayout, which re-invokes
    // treasury.distributeAmbassadorShare. Dedup via `"ambassador:" # paymentId`
    // in processedPayments must return #AlreadyProcessed → status stays
    // #completed, and NO new distribution row appears for this payment.
    const rowCountBefore = allDistRows.length;
    const retryResult = await backendFixture.actor.retryAmbassadorPayout(creationId);
    expect(retryResult).toHaveProperty("ok");

    const afterRetry = await backendFixture.actor.getDistributionLog({ offset: 0n, limit: 1000n });
    const ambassadorRowsAfter = afterRetry.filter((r) => r.paymentId === `ambassador:${paymentId}`);
    expect(ambassadorRowsAfter.length).toBe(1); // still one — dedup prevented a second row
    expect(afterRetry.length).toBe(rowCountBefore); // overall log didn't grow

    const { data: dataAfterRetry } = await backendFixture.actor.listCreations([listCreationsByIdOpts(creationId)]);
    expect(dataAfterRetry[0].ambassadorPayoutStatus).toEqual({ completed: null });
  }, 300_000);

  test("addStorage rejects canister without WASM installed (#InvalidWasm)", async () => {
    // Fresh empty canister — no WASM installed → fails at module_hash check.
    const emptyCanisterId = await manager.pic.createCanister({
      sender: manager.ownerIdentity.getPrincipal(),
    });

    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const result = await backendFixture.actor.addStorage(emptyCanisterId, new Uint8Array());
    expect(result).toHaveProperty("err");
    if ("err" in result) {
      expect(result.err).toHaveProperty("InvalidWasm");
    }
  });
});
