import type { CanisterFixture } from "@dfinity/pic";
import { createIdentity } from "@dfinity/pic";
import { principalToSubAccount, toNullable } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type {
  Account,
  CreateStorageOptions,
  CreationStatus,
  RabbitholeActorService,
  StorageCreationRecord
} from "@rabbithole/declarations";

import { CMC_CANISTER_ID, E8S_PER_ICP, ONE_TRILLION } from "./setup/constants";
import { runHttpDownloaderQueueProcessor } from "./setup/github-outcalls";
import { Manager } from "./setup/manager";

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
  if ("Completed" in status) return `Completed (${status.Completed.canisterId.toText()})`;
  if ("Failed" in status) return `Failed: ${status.Failed}`;
  return "Unknown";
}

/**
 * Helper to poll creation status until completion or failure
 */
async function pollCreationStatus(
  manager: Manager,
  backendFixture: CanisterFixture<RabbitholeActorService>,
  maxAttempts = 120,
): Promise<CreationStatus | null> {
  let attempts = 0;
  let finalStatus: CreationStatus | null = null;

  while (attempts < maxAttempts) {
    await manager.pic.advanceTime(100);
    await manager.pic.tick(5);

    const statusResult = await backendFixture.actor.getStorageCreationStatus();

    if (statusResult.length === 0) {
      attempts++;
      continue;
    }

    const status = statusResult[0] as CreationStatus;

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

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should return null creation status initially for new user", async () => {
    const newIdentity = createIdentity("newUserForStatusTest");
    backendFixture.actor.setIdentity(newIdentity);

    const status = await backendFixture.actor.getStorageCreationStatus();
    expect(status.length).toBe(0);

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
      initArg: IDL.encode([], []),
    };

    const createResult = await backendFixture.actor.createStorage(options);
    console.log("Create result:", createResult);
    expect(createResult).toHaveProperty("ok");

    // Poll for completion
    console.log("\n=== Polling Creation Status ===");
    const finalStatus = await pollCreationStatus(manager, backendFixture);

    expect(finalStatus).not.toBeNull();
    expect(finalStatus).toHaveProperty("Completed");

    if (finalStatus && "Completed" in finalStatus) {
      console.log("\n✓ E2E Storage Creation Completed!");
      const canisterId = finalStatus.Completed.canisterId;
      console.log("  Canister ID:", canisterId.toText());
      // const storageActor = manager.pic.createActor<EncryptedStorageActorService>(encryptedStorageIdlFactory, canisterId);
      // const tree = await storageActor.list({});
      // console.log(tree);
    }

    // Verify storage is listed
    const storages = await backendFixture.actor.listStorages();
    console.log("\n=== Storage List ===");
    console.log("Number of storages:", storages.length);
    expect(storages.length).toBeGreaterThan(0);

    const storage = storages[0] as StorageCreationRecord;
    console.log("Storage record:", {
      owner: storage.owner.toText(),
      canisterId: storage.canisterId.length > 0 ? storage.canisterId[0].toText() : "none",
      releaseTag: storage.releaseTag,
      status: Object.keys(storage.status)[0],
      wasmHash: storage.wasmHash.length > 0 ? "present" : "none",
      frontendHash: storage.frontendHash.length > 0 ? "present" : "none",
    });

    expect(storage.status).toHaveProperty("Completed");
    expect(storage.canisterId.length).toBe(1);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should reject duplicate creation while in progress", async () => {
    const duplicateTestIdentity = createIdentity("duplicateTestUser");
    backendFixture.actor.setIdentity(duplicateTestIdentity);

    const options: CreateStorageOptions = {
      target: {
        Create: {
          initialCycles: ONE_TRILLION,
          subnetId: [manager.applicationSubnetId],
        },
      },
      releaseSelector: { LatestDraft: null },
      initArg: IDL.encode([], []),
    };

    const result1 = await backendFixture.actor.createStorage(options);

    if ("ok" in result1) {
      const status = await backendFixture.actor.getStorageCreationStatus();
      if (status.length > 0) {
        const statusKey = Object.keys(status[0])[0];

        if (!["Completed", "Failed"].includes(statusKey)) {
          const result2 = await backendFixture.actor.createStorage(options);
          console.log("Duplicate create result:", result2);

          expect(result2).toHaveProperty("err");
          if ("err" in result2) {
            expect(result2.err).toHaveProperty("AlreadyInProgress");
          }
        }
      }
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });

  test("should allow creation with pre-existing canister (link mode)", { timeout: 120000 }, async () => {
    console.log("\n=== Testing Link Mode ===");

    const preCreatedCanisterId = await manager.createCanister({
      controllers: [backendFixture.canisterId]
    });
    console.log("Pre-created canister:", preCreatedCanisterId.toText());

    const linkTestIdentity = createIdentity("linkModeTestUser");
    backendFixture.actor.setIdentity(linkTestIdentity);


    const options: CreateStorageOptions = {
      target: {
        Existing: preCreatedCanisterId,
      },
      releaseSelector: { LatestDraft: null },
      initArg: IDL.encode([], []),
    };

    const result = await backendFixture.actor.createStorage(options);
    console.log("Link mode result:", result);
    expect(result).toHaveProperty("ok");

    // Poll for completion
    const finalStatus = await pollCreationStatus(manager, backendFixture, 60);

    console.log("Link mode final status:", finalStatus ? formatCreationStatus(finalStatus) : "null");

    expect(finalStatus).not.toBeNull();
    expect(finalStatus).toHaveProperty("Completed");

    if (finalStatus && "Completed" in finalStatus) {
      expect(finalStatus.Completed.canisterId.toText()).toBe(preCreatedCanisterId.toText());
    }

    backendFixture.actor.setIdentity(manager.ownerIdentity);
  });
});
