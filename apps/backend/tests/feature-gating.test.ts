import { type Actor, type CanisterFixture } from "@dfinity/pic";
import { toNullable } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type {
  EncryptedStorageActorService,
  EncryptionMode,
  RabbitholeActorService,
} from "@rabbithole/declarations";
import {
  encryptedStorageIdlFactory,
  initEncryptedStorage,
} from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager.ts";
import { STORAGE_WASM_PATH } from "./setup/constants.ts";
import { runHttpDownloaderQueueProcessor } from "./setup/github-outcalls.ts";
import { userAlice } from "./setup/helpers.ts";

const FILE = { File: null } as const;
const DIRECTORY = { Directory: null } as const;
const CREATE_NEW = { CreateNew: null } as const;
const ENCRYPTED : EncryptionMode = { Encrypted: null } as const;
const PLAINTEXT : EncryptionMode = { Plaintext: null } as const;

type BackendFixture = CanisterFixture<RabbitholeActorService>;
type StorageFixture = CanisterFixture<EncryptedStorageActorService>;

function encodeStorageInitArg(
  owner: import("@icp-sdk/core/principal").Principal,
  backendId: import("@icp-sdk/core/principal").Principal,
): Uint8Array {
  const [InitArgsIDL] = initEncryptedStorage({ IDL });
  return new Uint8Array(
    IDL.encode([InitArgsIDL], [
      { owner, vetKeyName: ["dfx_test_key"], backendId: [backendId], storageBackendType: [{OnChain: null}] },
    ]),
  );
}

describe("Feature Gating", () => {
  let manager: BackendManager;
  let backend: BackendFixture;
  let storage: StorageFixture;
  let backendActor: Actor<RabbitholeActorService>;
  let storageActor: Actor<EncryptedStorageActorService>;

  beforeAll(async () => {
    // Full backend setup with NNS, ledger, CMC
    manager = await BackendManager.create();
    backend = await manager.initBackendCanister();
    backendActor = backend.actor;
    backendActor.setIdentity(manager.ownerIdentity);

    // Wait for GitHub releases to download (mocked HTTP outcalls)
    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () =>
        (await backendActor.getReleasesFullStatus()).hasDownloadedRelease,
    );
    await manager.pic.tick();

    // Wait for extraction to complete
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      await manager.pic.tick(20);
      ready = (await backendActor.getReleasesFullStatus())
        .hasDeploymentReadyRelease;
    }
    expect(ready).toBe(true);

    // Deploy storage canister directly via PocketIC
    const initArg = encodeStorageInitArg(
      manager.ownerIdentity.getPrincipal(),
      backend.canisterId,
    );
    storage = await manager.pic.setupCanister<EncryptedStorageActorService>(
      {
        wasm: STORAGE_WASM_PATH,
        sender: manager.ownerIdentity.getPrincipal(),
        idlFactory:
          encryptedStorageIdlFactory as unknown as IDL.InterfaceFactory,
        arg: initArg,
      },
    );
    await manager.pic.tick();

    storageActor = storage.actor;
    storageActor.setIdentity(manager.ownerIdentity);

    // WASM hash should be auto-registered via onDownloadComplete callback
    const knownHashes = await backendActor.listKnownWasmHashes();
    expect(knownHashes.length).toBeGreaterThan(0);

    // Register storage in backend via addStorage (verifies WASM hash via canister_info)
    const addResult = await backendActor.addStorage(
      storage.canisterId,
      initArg,
    );
    if ("err" in addResult) {
      console.error("addStorage error:", JSON.stringify(addResult.err, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
    }
    expect(addResult).toHaveProperty("ok");
  }, 360_000);

  afterAll(async () => {
    await manager?.pic?.tearDown();
  });

  // ===================== StableStore v2 + backendId =====================

  describe("Storage Status and Backend Connection", () => {
    test("getStatus returns backendId from initArgs", async () => {
      const status = await storageActor.getStatus();
      expect(status.backendId).toHaveLength(1);
      expect(status.backendId[0]!.toText()).toBe(
        backend.canisterId.toText(),
      );
    });

    test("getStatus returns initial values for new canister", async () => {
      const status = await storageActor.getStatus();
      expect(status.encryptedBytesUsed).toBe(0n);
      expect(status.cycleBalance).toBeGreaterThan(0n);
    });

    test("getCycleBalance returns positive value", async () => {
      const balance = await storageActor.getCycleBalance();
      expect(balance).toBeGreaterThan(0n);
    });

    test("plaintext operations work without subscription", async () => {
      const result = await storageActor.create({
        entry: [DIRECTORY, "Documents"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable<EncryptionMode>(),
      });
      expect(result.name).toBe("Documents");
    });
  });

  // ===================== checkSubscription =====================

  describe("Subscription Check and Cache", () => {
    test("refreshSubscription rejects non-owner caller", async () => {
      storageActor.setIdentity(userAlice);
      await expect(storageActor.refreshSubscription()).rejects.toThrow();
    });

    test("refreshSubscription populates cache with #free", async () => {
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();
      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus).toHaveLength(1);
      expect(status.subscriptionStatus[0]).toEqual({ free: null });
    });

    test("refreshSubscription returns #trial after activateTrial", async () => {
      backendActor.setIdentity(manager.ownerIdentity);
      // Register user first (required for activateTrial)
      await backendActor.register([]);
      await backendActor.activateTrial();

      // Advance time to expire cache from previous test (24h TTL)
      await manager.pic.advanceTime(25 * 60 * 60 * 1000);
      await manager.pic.tick();

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();
      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus).toHaveLength(1);
      expect(status.subscriptionStatus[0]).toHaveProperty("trial");
    });

    test("cache returns consistent status on repeated calls", async () => {
      const status1 = await storageActor.getStatus();
      const status2 = await storageActor.getStatus();
      expect(status1.subscriptionStatus).toEqual(
        status2.subscriptionStatus,
      );
    });
  });

  // ===================== Feature Gates =====================

  describe("Permission and Encryption Gates", () => {
    test("#trial — grantPermission works", async () => {
      // Ensure trial is active and cache is fresh
      await storageActor.refreshSubscription();
      const s = await storageActor.getStatus();
      expect(s.subscriptionStatus[0]).toHaveProperty("trial");

      await storageActor.create({
        entry: [DIRECTORY, "TrialShared"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      await storageActor.grantStoragePermission({
        entry: [[DIRECTORY, "TrialShared"]],
        user: userAlice.getPrincipal(),
        permission: { Read: null },
      });
    });

    test("grantPermission blocked when subscription expired", async () => {
      // Expire trial: advance 15 days past 14-day trial
      await manager.pic.advanceTime(15 * 24 * 60 * 60 * 1000);
      await manager.pic.tick(10);
      await storageActor.refreshSubscription();

      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus[0]).toEqual({ expired: null });

      await storageActor.create({
        entry: [DIRECTORY, "Blocked"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      await expect(
        storageActor.grantStoragePermission({
          entry: [[DIRECTORY, "Blocked"]],
          user: manager.ownerIdentity.getPrincipal(),
          permission: { Read: null },
        }),
      ).rejects.toThrow(/expired/i);
    });

    test("plaintext create works with expired subscription", async () => {
      const result = await storageActor.create({
        entry: [FILE, "expired-ok.txt"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable(PLAINTEXT),
      });
      expect(result.name).toBe("expired-ok.txt");
    });

    test("plaintext move/rename work with expired subscription", async () => {
      await storageActor.create({
        entry: [DIRECTORY, "TempDir"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await storageActor.rename({
        entry: [DIRECTORY, "TempDir"],
        newName: "RenamedDir",
      });
      const tree = await storageActor.showTree([]);
      expect(tree).toContain("RenamedDir");
    });

    test("#active (Pro) — grantPermission works after reactivation", async () => {
      // Trial already expired from previous test (15 days advance)
      backendActor.setIdentity(manager.ownerIdentity);
      const proTimeMs = await manager.pic.getTime();
      const proNow = BigInt(proTimeMs) * 1_000_000n;
      const twoDays = 2n * 24n * 60n * 60n * 1_000_000_000n;
      await backendActor.activateSubscription(
        manager.ownerIdentity.getPrincipal(),
        { Pro: null },
        [proNow + twoDays],
      );

      // Expire subscription cache (24h TTL) then refresh
      await manager.pic.advanceTime(25 * 60 * 60 * 1000);
      await manager.pic.tick(10);
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus[0]).toEqual({
        active: { plan: { Pro: null } },
      });

      await storageActor.create({
        entry: [DIRECTORY, "ProShared"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      // Grant to alice (not owner — owner can't change own rights)
      await storageActor.grantStoragePermission({
        entry: [[DIRECTORY, "ProShared"]],
        user: userAlice.getPrincipal(),
        permission: { Read: null },
      });
    });
  });

  // ===================== Trial Limit =====================

  describe("Trial Storage Limit", () => {
    test("plaintext createBatch works regardless of subscription", async () => {
      // Pro is active from B3 — plaintext should always work
      await storageActor.create({
        entry: [FILE, "plain-large.bin"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable(PLAINTEXT),
      });

      const batch = await storageActor.createStorageBatch({
        entry: [FILE, "plain-large.bin"],
        totalSize: 500_000_000n,
      });
      expect(batch.batchId).toBeDefined();
    });

    test("encrypted createBatch works with Pro (no size limit)", async () => {
      // Pro is active from B3
      await storageActor.refreshSubscription();

      await storageActor.create({
        entry: [FILE, "pro-huge.dat"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable(ENCRYPTED),
      });

      const batch = await storageActor.createStorageBatch({
        entry: [FILE, "pro-huge.dat"],
        totalSize: 500_000_000n,
      });
      expect(batch.batchId).toBeDefined();
    });

    test("encrypted createBatch rejects file exceeding trial limit", async () => {
      // Advance time so Pro (1h expiry) is expired and subscription cache (24h TTL) is stale
      await manager.pic.advanceTime(25 * 60 * 60 * 1000); // 25 hours
      await manager.pic.tick(10);

      // Re-activate as Trial via admin
      backendActor.setIdentity(manager.ownerIdentity);
      const picTimeMs = await manager.pic.getTime();
      const now = BigInt(picTimeMs) * 1_000_000n;
      const fourteenDays = 14n * 24n * 60n * 60n * 1_000_000_000n;
      await backendActor.activateSubscription(
        manager.ownerIdentity.getPrincipal(),
        { Trial: null },
        [now + fourteenDays],
      );
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus[0]).toHaveProperty("trial");

      await storageActor.create({
        entry: [FILE, "too-big.dat"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable(ENCRYPTED),
      });

      // 150MB exceeds 100MB trial limit
      await expect(
        storageActor.createStorageBatch({
          entry: [FILE, "too-big.dat"],
          totalSize: 150_000_000n,
        }),
      ).rejects.toThrow(/exceeds/i);
    });

    test("encrypted createBatch works within trial limit", async () => {
      // Trial still active from previous test
      await storageActor.create({
        entry: [FILE, "small-secret.dat"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable(ENCRYPTED),
      });

      const batch = await storageActor.createStorageBatch({
        entry: [FILE, "small-secret.dat"],
        totalSize: 1_000n,
      });
      expect(batch.batchId).toBeDefined();
    });

    test("encryptedBytesUsed starts at zero", async () => {
      const status = await storageActor.getStatus();
      expect(status.encryptedBytesUsed).toBe(0n);
    });
  });

  // ===================== Cycle Monitoring =====================

  describe("Cycle Balance Monitoring", () => {
    test("getCycleBalance returns bigint > 0", async () => {
      const balance = await storageActor.getCycleBalance();
      expect(typeof balance).toBe("bigint");
      expect(balance).toBeGreaterThan(0n);
    });

    test("getStatus includes all expected fields", async () => {
      const status = await storageActor.getStatus();
      expect(status).toHaveProperty("cycleBalance");
      expect(status).toHaveProperty("encryptedBytesUsed");
      expect(status).toHaveProperty("subscriptionStatus");
      expect(status).toHaveProperty("backendId");
    });

    test("mutations do not crash with cycle monitoring", async () => {
      for (let i = 0; i < 3; i++) {
        await storageActor.create({
          entry: [DIRECTORY, `cycle-test-${i}`],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
      }
      await storageActor.delete({
        entry: [DIRECTORY, "cycle-test-0"],
        recursive: true,
      });
      const balance = await storageActor.getCycleBalance();
      expect(balance).toBeGreaterThan(0n);
    });

    test("cycle balance decreases after operations", async () => {
      const balanceBefore = await storageActor.getCycleBalance();
      for (let i = 0; i < 5; i++) {
        await storageActor.create({
          entry: [DIRECTORY, `burn-${i}`],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
      }
      const balanceAfter = await storageActor.getCycleBalance();
      expect(balanceAfter).toBeLessThan(balanceBefore);
    });
  });

  // ===================== addStorage =====================

  describe("addStorage", () => {
    test("storage is registered in backend listStorages", async () => {
      backendActor.setIdentity(manager.ownerIdentity);
      const storages = await backendActor.listStorages();
      const found = storages.find(
        (s) =>
          s.canisterId.length === 1 &&
          s.canisterId[0]!.toText() === storage.canisterId.toText(),
      );
      expect(found).toBeDefined();
    });

    test("addStorage prevents duplicate registration", async () => {
      const result = await backendActor.addStorage(
        storage.canisterId,
        new Uint8Array(),
      );
      expect(result).toHaveProperty("err");
    });

    test("checkSubscription resolves correctly after addStorage", async () => {
      await storageActor.refreshSubscription();
      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus).toHaveLength(1);
      // Should not be unknownCanister — canister is registered
      expect(status.subscriptionStatus[0]).not.toEqual({
        unknownCanister: null,
      });
    });
  });

  // ===================== checkSubscription variants =====================

  describe("checkSubscription direct variants", () => {
    const CheckResultIDL = IDL.Variant({
      active: IDL.Record({ plan: IDL.Variant({ Free: IDL.Null, Trial: IDL.Null, Pro: IDL.Null }) }),
      trial: IDL.Record({ remainingBytes: IDL.Nat }),
      expired: IDL.Null,
      free: IDL.Null,
      invalidWasm: IDL.Null,
      unknownCanister: IDL.Null,
    });

    test("checkSubscription returns #invalidWasm for unrecognized wasm hash", async () => {
      // Call checkSubscription from the storage canister with a fake wasm hash
      const fakeHash = new Uint8Array(32).fill(0xff);
      const response = await manager.pic.updateCall({
        canisterId: backend.canisterId,
        sender: storage.canisterId,
        method: "checkSubscription",
        arg: IDL.encode([IDL.Vec(IDL.Nat8)], [fakeHash]),
      });
      const [result] = IDL.decode([CheckResultIDL], response);
      expect(result).toEqual({ invalidWasm: null });
    });
  });

  // ===================== reportTrialBytes positive =====================

  describe("reportTrialBytes positive case", () => {
    test("reportTrialBytes records bytes and reduces remaining trial bytes", async () => {
      // Ensure trial is active (from earlier "Subscription Check and Cache" tests)
      // Expire cache and refresh to get current trial state
      await manager.pic.advanceTime(25 * 60 * 60 * 1000);
      await manager.pic.tick(10);

      // Re-activate trial if needed (previous tests may have changed state)
      backendActor.setIdentity(manager.ownerIdentity);
      const sub = await backendActor.getSubscription();
      const currentPlan = sub.length > 0 ? sub[0] : null;

      // If not on trial, activate one via admin
      if (!currentPlan || !("Trial" in currentPlan.plan) || "Expired" in currentPlan.status) {
        const picTimeMs = await manager.pic.getTime();
        const now = BigInt(picTimeMs) * 1_000_000n;
        const fourteenDays = 14n * 24n * 60n * 60n * 1_000_000_000n;
        await backendActor.activateSubscription(
          manager.ownerIdentity.getPrincipal(),
          { Trial: null },
          [now + fourteenDays],
        );
      }

      // Refresh subscription cache on storage
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      const statusBefore = await storageActor.getStatus();
      expect(statusBefore.subscriptionStatus[0]).toHaveProperty("trial");
      const remainingBefore = (statusBefore.subscriptionStatus[0] as any).trial.remainingBytes;

      // Report 10MB of trial bytes from the storage canister
      const reportedBytes = 10_000_000n;
      await manager.pic.updateCall({
        canisterId: backend.canisterId,
        sender: storage.canisterId,
        method: "reportTrialBytes",
        arg: IDL.encode([IDL.Nat], [reportedBytes]),
      });
      await manager.pic.tick();

      // Expire cache and refresh to pick up updated bytes
      await manager.pic.advanceTime(25 * 60 * 60 * 1000);
      await manager.pic.tick();
      await storageActor.refreshSubscription();

      const statusAfter = await storageActor.getStatus();
      expect(statusAfter.subscriptionStatus[0]).toHaveProperty("trial");
      const remainingAfter = (statusAfter.subscriptionStatus[0] as any).trial.remainingBytes;

      expect(remainingAfter).toBe(remainingBefore - reportedBytes);
    });
  });
});
