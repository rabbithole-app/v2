import { type Actor, type CanisterFixture, createIdentity } from "@dfinity/pic";
import { toNullable } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { createHash } from "node:crypto";
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
import {
  buildStorageEnvironmentVariables,
  STORAGE_WASM_PATH,
} from "./setup/constants.ts";
import { runHttpDownloaderQueueProcessor } from "./setup/github-outcalls.ts";
import { userAlice, userBob, userCharlie } from "./setup/helpers.ts";
import {
  II_BACKEND_CANISTER_ID,
  IdentityAttributesSyncResult,
  updateCallWithSenderInfo,
} from "./setup/internet-identity.ts";

const FILE = { File: null } as const;
const DIRECTORY = { Directory: null } as const;
const CREATE_NEW = { CreateNew: null } as const;
const ENCRYPTED : EncryptionMode = { Encrypted: null } as const;
const PLAINTEXT : EncryptionMode = { Plaintext: null } as const;

const Icrc3Value = IDL.Rec();
const AttributeMap = IDL.Vec(IDL.Tuple(IDL.Text, Icrc3Value));
Icrc3Value.fill(IDL.Variant({
  Array: IDL.Vec(Icrc3Value),
  Blob: IDL.Vec(IDL.Nat8),
  Bool: IDL.Bool,
  Int: IDL.Int,
  Map: AttributeMap,
  Nat: IDL.Nat,
  Text: IDL.Text,
}));

type BackendFixture = CanisterFixture<RabbitholeActorService>;
type StorageFixture = CanisterFixture<EncryptedStorageActorService>;

function encodeStorageInitArg(
  owner: import("@icp-sdk/core/principal").Principal,
): Uint8Array {
  const [InitArgsIDL] = initEncryptedStorage({ IDL });
  return new Uint8Array(
    IDL.encode([InitArgsIDL], [
      { owner, storageBackendType: [{OnChain: null}] },
    ]),
  );
}

function emailCommitment(canisterId: Principal, email: string): Uint8Array {
  return createHash("sha256")
    .update("rabbithole:storage-access:v1")
    .update(canisterId.toUint8Array())
    .update(email.trim().toLowerCase())
    .digest();
}

function encodeVerifiedEmailCallerInfo({
  email,
  issuedAtNs,
  nonce,
  origin,
}: {
  email: string;
  issuedAtNs: bigint;
  nonce: Uint8Array;
  origin: string;
}): Uint8Array {
  return IDL.encode([Icrc3Value], [{
    Map: [
      ["implicit:nonce", { Blob: nonce }],
      ["implicit:origin", { Text: origin }],
      ["implicit:issued_at_timestamp_ns", { Nat: issuedAtNs }],
      ["openid:https://accounts.google.com:email", { Text: email }],
      ["openid:https://accounts.google.com:email_verified", { Bool: true }],
    ],
  }]);
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
    const initArg = encodeStorageInitArg(manager.ownerIdentity.getPrincipal());
    storage = await manager.pic.setupCanister<EncryptedStorageActorService>(
      {
        wasm: STORAGE_WASM_PATH,
        sender: manager.ownerIdentity.getPrincipal(),
        idlFactory:
          encryptedStorageIdlFactory as unknown as IDL.InterfaceFactory,
        environmentVariables: buildStorageEnvironmentVariables(backend.canisterId),
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

  async function processStorageAccessCallbacks(): Promise<void> {
    await manager.pic.advanceTime(1000);
    await manager.pic.tick(5);
  }

  async function waitForBackendNotification(
    identity: Parameters<Actor<RabbitholeActorService>["setIdentity"]>[0],
    predicate: (
      page: Awaited<ReturnType<RabbitholeActorService["listNotifications"]>>,
    ) => boolean,
  ): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      backendActor.setIdentity(identity);
      const page = await backendActor.listNotifications({ afterId: [], limit: 100n, unreadOnly: false });
      if (predicate(page)) return;
      await processStorageAccessCallbacks();
    }

    backendActor.setIdentity(identity);
    expect(predicate(await backendActor.listNotifications({ afterId: [], limit: 100n, unreadOnly: false }))).toBe(true);
  }

  async function expectSharedWithMeStorage(
    identity: Parameters<Actor<RabbitholeActorService>["setIdentity"]>[0],
    expected: boolean,
  ): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      backendActor.setIdentity(identity);
      const exists = (await backendActor.listSharedWithMeStorages()).some(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      );
      if (exists === expected) return;
      await processStorageAccessCallbacks();
    }

    backendActor.setIdentity(identity);
    expect(
      (await backendActor.listSharedWithMeStorages()).some(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      ),
    ).toBe(expected);
  }

  async function syncBackendVerifiedEmail(
    identity: Parameters<Actor<RabbitholeActorService>["setIdentity"]>[0],
    email: string,
  ): Promise<void> {
    backendActor.setIdentity(identity);
    const nonce = await backendActor.attributeNonceBegin();
    const issuedAtNs = BigInt(await manager.pic.getTime()) * 1_000_000n;
    const response = await updateCallWithSenderInfo(manager.pic, {
      arg: IDL.encode([IDL.Vec(IDL.Nat8)], [nonce]),
      canisterId: backend.canisterId,
      method: "syncIdentityAttributes",
      sender: identity.getPrincipal(),
      senderInfo: {
        info: encodeVerifiedEmailCallerInfo({
          email,
          issuedAtNs,
          nonce,
          origin: "http://localhost:4200",
        }),
        signer: II_BACKEND_CANISTER_ID,
      },
    });
    const [result] = IDL.decode([IdentityAttributesSyncResult], response);
    expect(result).toEqual({ ok: null });
  }

  async function syncStorageVerifiedEmail(
    identity: Parameters<Actor<RabbitholeActorService>["setIdentity"]>[0],
    email: string,
  ): Promise<unknown> {
    storageActor.setIdentity(identity);
    const nonce = await storageActor.attributeNonceBegin();
    const issuedAtNs = BigInt(await manager.pic.getTime()) * 1_000_000n;
    const response = await updateCallWithSenderInfo(manager.pic, {
      arg: IDL.encode([IDL.Vec(IDL.Nat8)], [nonce]),
      canisterId: storage.canisterId,
      method: "syncIdentityAttributes",
      sender: identity.getPrincipal(),
      senderInfo: {
        info: encodeVerifiedEmailCallerInfo({
          email,
          issuedAtNs,
          nonce,
          origin: `https://${storage.canisterId.toText()}.icp0.io`,
        }),
        signer: II_BACKEND_CANISTER_ID,
      },
    });
    const [result] = IDL.decode([IdentityAttributesSyncResult], response);
    return result;
  }

  async function createOrdinaryAccessGrant(
    args: Parameters<EncryptedStorageActorService["hasStoragePermission"]>[0],
  ): Promise<void> {
    await storageActor.createAccessBatch({
      items: [
        {
          ref: { principal: args.user },
          accessClass: { ordinary: null },
          scope: args.entry.length > 0 ? { entry: args.entry[0]! } : { root: null },
          permission: args.permission,
          source: { directGrant: null },
          expiresAt: [],
        },
      ],
    });
  }

  async function revokeOrdinaryAccessGrant(args: {
    entry: Parameters<EncryptedStorageActorService["hasStoragePermission"]>[0]["entry"];
    user: Principal;
  }): Promise<void> {
    await storageActor.revokeAccessBatch({
      items: [
        {
          principal: args.user,
          scope: args.entry.length > 0 ? { entry: args.entry[0]! } : { root: null },
        },
      ],
    });
  }

  async function ensureOwnerProSubscription(): Promise<void> {
    backendActor.setIdentity(manager.ownerIdentity);
    const currentSubscription = await backendActor.getSubscription();
    const now = BigInt(await manager.pic.getTime()) * 1_000_000n;
    const thirtyDays = 30n * 24n * 60n * 60n * 1_000_000_000n;

    if (currentSubscription.length > 0) {
      await backendActor.renewSubscription(
        manager.ownerIdentity.getPrincipal(),
        { Pro: null },
        [now + thirtyDays],
      );
    } else {
      await backendActor.activateSubscription(
        manager.ownerIdentity.getPrincipal(),
        { Pro: null },
        [now + thirtyDays],
      );
    }

    await manager.pic.advanceTime(25 * 60 * 60 * 1000);
    await manager.pic.tick(10);

    storageActor.setIdentity(manager.ownerIdentity);
    await storageActor.refreshSubscription();
  }

  async function setStorageControllers(controllers: Principal[]): Promise<void> {
    await manager.pic.updateCanisterSettings({
      canisterId: storage.canisterId,
      sender: manager.ownerIdentity.getPrincipal(),
      controllers,
    });
    await manager.pic.tick();
  }

  async function resetStorageControllers(): Promise<void> {
    await setStorageControllers([manager.ownerIdentity.getPrincipal()]);
  }

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

  // ===================== Owner-equivalent access =====================

  describe("Owner-equivalent access", () => {
    test("owner registers a controller as recovery owner and removes it after controller removal", async () => {
      storageActor.setIdentity(manager.ownerIdentity);

      const initial = await storageActor.listOwnerEquivalentPrincipals();
      expect(initial).toHaveLength(1);
      expect(initial[0]!.principal.toText()).toBe(
        manager.ownerIdentity.getPrincipal().toText(),
      );
      expect(initial[0]!.kind).toEqual({ accountOwner: null });
      expect(initial[0]!.controllerRecoveryEnabled).toBe(false);
      expect(initial[0]!.revokedAt).toEqual([]);

      storageActor.setIdentity(userAlice);
      await expect(storageActor.listOwnerEquivalentPrincipals()).rejects.toThrow();

      storageActor.setIdentity(manager.ownerIdentity);
      await expect(
        storageActor.addRecoveryOwner(manager.ownerIdentity.getPrincipal(), {
          controllerRecovery: false,
        }),
      ).rejects.toThrow(/controller/i);
      await expect(storageActor.takeRecoveryOwnership()).rejects.toThrow(
        /account owner/i,
      );

      await setStorageControllers([
        manager.ownerIdentity.getPrincipal(),
        userAlice.getPrincipal(),
      ]);

      storageActor.setIdentity(manager.ownerIdentity);
      const registered = await storageActor.registerRecoveryController(
        userAlice.getPrincipal(),
      );
      expect(registered.principal.toText()).toBe(userAlice.getPrincipal().toText());
      expect(registered.previous).toEqual([]);

      const registeredStatus = await storageActor.getRecoveryStatus();
      expect(registeredStatus.recoveryController).toHaveLength(1);
      expect(registeredStatus.recoveryController[0]!.toText()).toBe(
        userAlice.getPrincipal().toText(),
      );
      expect(registeredStatus.recoveryOwner).toEqual([]);

      const added = await storageActor.activateRecoveryOwnership(
        userAlice.getPrincipal(),
      );
      expect(added.principal.toText()).toBe(userAlice.getPrincipal().toText());
      expect(added.kind).toEqual({ recoveryOwner: null });
      expect(added.controllerRecoveryEnabled).toBe(true);
      expect(added.addedBy.toText()).toBe(
        manager.ownerIdentity.getPrincipal().toText(),
      );
      expect(added.revokedAt).toEqual([]);

      storageActor.setIdentity(userAlice);
      const recoveryCreated = await storageActor.create({
        entry: [DIRECTORY, "RecoveryOwned"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect(recoveryCreated.name).toBe("RecoveryOwned");

      storageActor.setIdentity(manager.ownerIdentity);
      const events = await storageActor.listStorageEvents([], 10n);
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]?.event).toEqual({
        access: { recoveryOwnerAdded: { principal: userAlice.getPrincipal() } },
      });

      await expect(
        storageActor.removeRecoveryOwner(userAlice.getPrincipal()),
      ).rejects.toThrow(/still a controller/i);

      await resetStorageControllers();

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.removeRecoveryOwner(userAlice.getPrincipal());

      storageActor.setIdentity(userAlice);
      await expect(
        storageActor.create({
          entry: [DIRECTORY, "RecoveryRevoked"],
          createMode: CREATE_NEW,
          encryptionMode: [],
        }),
      ).rejects.toThrow();
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
      await backendActor.ensureUser([]);
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
    test("#trial — createAccessBatch works", async () => {
      // Ensure trial is active and cache is fresh
      await storageActor.refreshSubscription();
      const s = await storageActor.getStatus();
      expect(s.subscriptionStatus[0]).toHaveProperty("trial");

      await storageActor.create({
        entry: [DIRECTORY, "TrialShared"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      await createOrdinaryAccessGrant({
        entry: [[DIRECTORY, "TrialShared"]],
        user: userAlice.getPrincipal(),
        permission: { Read: null },
      });
    });

    test("removing recovery owner preserves pre-existing root permission", async () => {
      const recipient = createIdentity("recovery-preserve-recipient");

      await ensureOwnerProSubscription();

      await createOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
        permission: { Read: null },
      });
      await setStorageControllers([
        manager.ownerIdentity.getPrincipal(),
        recipient.getPrincipal(),
      ]);
      storageActor.setIdentity(recipient);
      await storageActor.takeRecoveryOwnership();
      await resetStorageControllers();

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.removeRecoveryOwner(recipient.getPrincipal());

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { ReadWriteManage: null },
        }),
      ).toBe(false);
    });

    test("second recovery owner removal does not clobber new root permission", async () => {
      const recipient = createIdentity("recovery-remove-twice-recipient");

      await ensureOwnerProSubscription();

      await setStorageControllers([
        manager.ownerIdentity.getPrincipal(),
        recipient.getPrincipal(),
      ]);
      storageActor.setIdentity(recipient);
      await storageActor.takeRecoveryOwnership();
      await resetStorageControllers();

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.removeRecoveryOwner(recipient.getPrincipal());

      await createOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
        permission: { Read: null },
      });

      await expect(
        storageActor.removeRecoveryOwner(recipient.getPrincipal()),
      ).rejects.toThrow(/already removed/i);

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);
    });

    test("pending principal grant does not give permission before claim", async () => {
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      const pending = await storageActor.createPendingAccessGrant({
        ref: { principal: userBob.getPrincipal() },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 0n },
        expiresAt: [],
      });

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: userBob.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);

      await waitForBackendNotification(
        userBob,
        (page) => page.data.some(
          (item) =>
            "storageInviteCreated" in item.payload &&
            item.payload.storageInviteCreated.grantId === pending.id &&
            item.payload.storageInviteCreated.canisterId.toText() === storage.canisterId.toText(),
        ),
      );

      storageActor.setIdentity(userBob);
      const grant = await storageActor.claimPendingAccessGrant({
        grantId: pending.id,
      });
      expect(grant.principal.toText()).toBe(userBob.getPrincipal().toText());
      expect(grant.accessClass).toEqual({ ordinary: null });

      await waitForBackendNotification(
        manager.ownerIdentity,
        (page) => page.data.some(
          (item) =>
            "storageInviteClaimed" in item.payload &&
            item.payload.storageInviteClaimed.grantId === pending.id &&
            item.payload.storageInviteClaimed.principal.toText() === userBob.getPrincipal().toText(),
        ),
      );

      storageActor.setIdentity(manager.ownerIdentity);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: userBob.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);
    });

    test("pending email grant is claimed by verified email and reports the pending grant id", async () => {
      const expectedOrigin = `https://${storage.canisterId.toText()}.icp0.io`;
      const email = "andri.schatz@dfinity.org";

      await ensureOwnerProSubscription();
      await manager.pic.advanceTime(25 * 60 * 60 * 1000);
      await manager.pic.tick(10);

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      const pending = await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(
            storage.canisterId,
            email,
          ),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 2n },
        expiresAt: [],
      });

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: userCharlie.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);

      storageActor.setIdentity(userCharlie);
      const nonce = await storageActor.attributeNonceBegin();
      const issuedAtNs = BigInt(await manager.pic.getTime()) * 1_000_000n;
      const response = await updateCallWithSenderInfo(manager.pic, {
        arg: IDL.encode([IDL.Vec(IDL.Nat8)], [nonce]),
        canisterId: storage.canisterId,
        method: "syncIdentityAttributes",
        sender: userCharlie.getPrincipal(),
        senderInfo: {
          info: encodeVerifiedEmailCallerInfo({
            email,
            issuedAtNs,
            nonce,
            origin: expectedOrigin,
          }),
          signer: II_BACKEND_CANISTER_ID,
        },
      });
      const [result] = IDL.decode([IdentityAttributesSyncResult], response);
      expect(result).toEqual({ ok: null });

      const recipientEvents = await storageActor.listStorageEvents([], 100n);
      expect(
        recipientEvents.some(
          (item) =>
            "access" in item.event &&
            "pendingGrantClaimed" in item.event.access &&
            item.event.access.pendingGrantClaimed.grantId === pending.id &&
            item.event.access.pendingGrantClaimed.principal.toText() ===
              userCharlie.getPrincipal().toText(),
        ),
      ).toBe(true);

      await waitForBackendNotification(
        manager.ownerIdentity,
        (page) => page.data.some(
          (item) =>
            "storageInviteClaimed" in item.payload &&
            item.payload.storageInviteClaimed.grantId === pending.id &&
            item.payload.storageInviteClaimed.principal.toText() ===
              userCharlie.getPrincipal().toText(),
        ),
      );

      storageActor.setIdentity(manager.ownerIdentity);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: userCharlie.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);
    });

    test("access batch grants principals and creates pending email invites atomically", async () => {
      const recipient = createIdentity("access-batch-recipient");
      const email = "access-batch@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      const result = await storageActor.createAccessBatch({
        items: [
          {
            ref: { principal: recipient.getPrincipal() },
            accessClass: { ordinary: null },
            scope: { root: null },
            permission: { Read: null },
            source: { directGrant: null },
            expiresAt: [],
          },
          {
            ref: {
              emailCommitment: emailCommitment(storage.canisterId, email),
            },
            accessClass: { ordinary: null },
            scope: { root: null },
            permission: { Read: null },
            source: { ordinaryInvite: 7n },
            expiresAt: [],
          },
        ],
      });

      expect(result.principalGrants).toHaveLength(1);
      expect(result.pendingGrants).toHaveLength(1);
      expect(result.principalGrants[0]!.principal.toText()).toBe(
        recipient.getPrincipal().toText(),
      );

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);

      await waitForBackendNotification(
        recipient,
        (page) => page.data.some(
          (item) =>
            "storageAccessGranted" in item.payload &&
            item.payload.storageAccessGranted.canisterId.toText() ===
              storage.canisterId.toText(),
        ),
      );

      const revoked = await storageActor.revokeAccessBatch({
        items: [
          {
            principal: recipient.getPrincipal(),
            scope: { root: null },
          },
        ],
      });
      expect(revoked.revoked).toHaveLength(1);

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);

      await waitForBackendNotification(
        recipient,
        (page) => page.data.some(
          (item) =>
            "storageAccessRevoked" in item.payload &&
            item.payload.storageAccessRevoked.canisterId.toText() ===
              storage.canisterId.toText(),
        ),
      );
    });

    test("access batch rejects invalid scopes before applying any grants", async () => {
      const recipient = createIdentity("access-batch-rollback-recipient");
      const email = "access-batch-invalid@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      await expect(
        storageActor.createAccessBatch({
          items: [
            {
              ref: { principal: recipient.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { root: null },
              permission: { Read: null },
              source: { directGrant: null },
              expiresAt: [],
            },
            {
              ref: {
                emailCommitment: emailCommitment(storage.canisterId, email),
              },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, "MissingBatchTarget"] },
              permission: { Read: null },
              source: { ordinaryInvite: 8n },
              expiresAt: [],
            },
          ],
        }),
      ).rejects.toThrow(/access scope not found/i);

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);

      await storageActor.createAccessBatch({
        items: [
          {
            ref: { principal: recipient.getPrincipal() },
            accessClass: { ordinary: null },
            scope: { root: null },
            permission: { Read: null },
            source: { directGrant: null },
            expiresAt: [],
          },
        ],
      });

      await expect(
        storageActor.revokeAccessBatch({
          items: [
            {
              principal: recipient.getPrincipal(),
              scope: { root: null },
            },
            {
              principal: userBob.getPrincipal(),
              scope: { entry: [DIRECTORY, "MissingBatchRevokeTarget"] },
            },
          ],
        }),
      ).rejects.toThrow(/access scope not found/i);

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: recipient.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);
    });

    test("backend shared-with-me registry follows principal grant and revoke", async () => {
      const recipient = createIdentity("shared-with-me-recipient");

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      await createOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
        permission: { Read: null },
      });

      await waitForBackendNotification(
        recipient,
        (page) => page.data.some(
          (item) =>
            "storageAccessGranted" in item.payload &&
            item.payload.storageAccessGranted.canisterId.toText() ===
              storage.canisterId.toText(),
        ),
      );

      backendActor.setIdentity(recipient);
      const shared = await backendActor.listSharedWithMeStorages();
      const sharedRecord = shared.find(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      );
      expect(sharedRecord?.accountOwner.toText()).toBe(
        manager.ownerIdentity.getPrincipal().toText(),
      );
      expect(sharedRecord?.activeAccessClasses).toContainEqual({ ordinary: null });

      storageActor.setIdentity(manager.ownerIdentity);
      await revokeOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
      });

      await waitForBackendNotification(
        recipient,
        (page) => page.data.some(
          (item) =>
            "storageAccessRevoked" in item.payload &&
            item.payload.storageAccessRevoked.canisterId.toText() ===
              storage.canisterId.toText(),
        ),
      );

      backendActor.setIdentity(recipient);
      expect(
        (await backendActor.listSharedWithMeStorages()).some(
          (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
        ),
      ).toBe(false);
    });

    test("backend shared-with-me registry materializes pending email invite for verified backend email", async () => {
      const recipient = createIdentity("shared-with-me-email-recipient");
      const email = "shared-with-me@example.com";

      await syncBackendVerifiedEmail(recipient, email);

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      const pending = await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(
            storage.canisterId,
            email,
          ),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 5n },
        expiresAt: [],
      });

      backendActor.setIdentity(recipient);
      const shared = await backendActor.listSharedWithMeStorages();
      const sharedRecord = shared.find(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      );
      expect(sharedRecord?.activeAccessClasses).toContainEqual({ ordinary: null });
      expect(sharedRecord?.pendingGrantIds).not.toContain(pending.id);
    });

    test("backend shared-with-me registry claims existing pending email invite on first verified login", async () => {
      const recipient = createIdentity("shared-with-me-late-email-recipient");
      const email = "late-shared-with-me@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      const pending = await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(
            storage.canisterId,
            email,
          ),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 6n },
        expiresAt: [],
      });

      backendActor.setIdentity(recipient);
      expect(
        (await backendActor.listSharedWithMeStorages()).some(
          (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
        ),
      ).toBe(false);

      await syncBackendVerifiedEmail(recipient, email);

      const shared = await backendActor.listSharedWithMeStorages();
      const sharedRecord = shared.find(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      );
      expect(sharedRecord?.activeAccessClasses).toContainEqual({ ordinary: null });
      expect(sharedRecord?.pendingGrantIds).not.toContain(pending.id);
    });

    test("email invite can be claimed once per trusted origin", async () => {
      const storageClaimant = createIdentity("shared-with-me-storage-claimant");
      const rabbitholeClaimant = createIdentity("shared-with-me-rabbithole-claimant");
      const email = "dual-origin-claim@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      const pending = await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(storage.canisterId, email),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 9n },
        expiresAt: [],
      });

      expect(await syncStorageVerifiedEmail(storageClaimant, email)).toEqual({ ok: null });

      await waitForBackendNotification(
        manager.ownerIdentity,
        (page) => page.data.some(
          (item) =>
            "storageInviteClaimed" in item.payload &&
            item.payload.storageInviteClaimed.grantId === pending.id &&
            item.payload.storageInviteClaimed.principal.toText() ===
              storageClaimant.getPrincipal().toText(),
        ),
      );

      backendActor.setIdentity(storageClaimant);
      const storageClaimantShared = await backendActor.listSharedWithMeStorages();
      const storageClaimantRecord = storageClaimantShared.find(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      );
      expect(storageClaimantRecord?.activeAccessClasses).toContainEqual({ ordinary: null });
      expect(storageClaimantRecord?.pendingGrantIds).not.toContain(pending.id);

      await syncBackendVerifiedEmail(rabbitholeClaimant, email);

      backendActor.setIdentity(rabbitholeClaimant);
      const rabbitholeClaimantShared = await backendActor.listSharedWithMeStorages();
      const rabbitholeClaimantRecord = rabbitholeClaimantShared.find(
        (item) => item.storageCanisterId.toText() === storage.canisterId.toText(),
      );
      expect(rabbitholeClaimantRecord?.activeAccessClasses).toContainEqual({ ordinary: null });
      expect(rabbitholeClaimantRecord?.pendingGrantIds).not.toContain(pending.id);

      storageActor.setIdentity(manager.ownerIdentity);
      const grants = await storageActor.listAccessGrants({
        scope: [{ root: null }],
        mode: { exact: null },
      });
      const grant = grants.pendingGrants.find((item) => item.grant.id === pending.id);
      expect(grant?.grant.emailClaimState.storage[0]?.principal.toText()).toBe(
        storageClaimant.getPrincipal().toText(),
      );
      expect(grant?.grant.emailClaimState.rabbithole[0]?.principal.toText()).toBe(
        rabbitholeClaimant.getPrincipal().toText(),
      );
    });

    test("cancel pending email invite revokes already claimed principal grants", async () => {
      const storageClaimant = createIdentity("cancel-email-storage-claimant");
      const rabbitholeClaimant = createIdentity("cancel-email-rabbithole-claimant");
      const email = "cancel-claimed-email@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      const pending = await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(storage.canisterId, email),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 12n },
        expiresAt: [],
      });

      expect(await syncStorageVerifiedEmail(storageClaimant, email)).toEqual({ ok: null });
      await syncBackendVerifiedEmail(rabbitholeClaimant, email);
      await expectSharedWithMeStorage(storageClaimant, true);
      await expectSharedWithMeStorage(rabbitholeClaimant, true);

      storageActor.setIdentity(manager.ownerIdentity);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: storageClaimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: rabbitholeClaimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);

      await storageActor.cancelPendingAccessGrant({ grantId: pending.id });

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: storageClaimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: rabbitholeClaimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);
      await expectSharedWithMeStorage(storageClaimant, false);
      await expectSharedWithMeStorage(rabbitholeClaimant, false);
    });

    test("replacing pending email invite revokes claimed grants from the old invite", async () => {
      const claimant = createIdentity("replace-email-storage-claimant");
      const email = "replace-claimed-email@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(storage.canisterId, email),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 13n },
        expiresAt: [],
      });

      expect(await syncStorageVerifiedEmail(claimant, email)).toEqual({ ok: null });
      await expectSharedWithMeStorage(claimant, true);

      storageActor.setIdentity(manager.ownerIdentity);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: claimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);

      await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(storage.canisterId, email),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { ReadWrite: null },
        source: { ordinaryInvite: 14n },
        expiresAt: [],
      });

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: claimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);
      await expectSharedWithMeStorage(claimant, false);
    });

    test("verified email claim validates every matching grant before applying permissions", async () => {
      const claimant = createIdentity("email-claim-rollback-recipient");
      const email = "email-claim-rollback@example.com";

      await ensureOwnerProSubscription();

      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.create({
        entry: [DIRECTORY, "EmailClaimRollback"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(storage.canisterId, email),
        },
        accessClass: { ordinary: null },
        scope: { root: null },
        permission: { Read: null },
        source: { ordinaryInvite: 10n },
        expiresAt: [],
      });
      await storageActor.createPendingAccessGrant({
        ref: {
          emailCommitment: emailCommitment(storage.canisterId, email),
        },
        accessClass: { ordinary: null },
        scope: { entry: [DIRECTORY, "EmailClaimRollback"] },
        permission: { Read: null },
        source: { ordinaryInvite: 11n },
        expiresAt: [],
      });
      await storageActor.delete({
        entry: [DIRECTORY, "EmailClaimRollback"],
        recursive: true,
      });

      expect(await syncStorageVerifiedEmail(claimant, email)).toEqual({
        err: { malformedPayload: null },
      });

      storageActor.setIdentity(manager.ownerIdentity);
      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: claimant.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(false);
    });

    test("storage event read cursor tracks visible unread events", async () => {
      const recipient = createIdentity("storage-event-read-recipient");

      await ensureOwnerProSubscription();

      storageActor.setIdentity(recipient);
      expect(await storageActor.getStorageEventsUnreadCount()).toBe(0n);

      storageActor.setIdentity(manager.ownerIdentity);
      await createOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
        permission: { Read: null },
      });

      storageActor.setIdentity(recipient);
      expect(await storageActor.getStorageEventsUnreadCount()).toBe(1n);

      const events = await storageActor.listStorageEvents([], 100n);
      expect(events).toHaveLength(1);
      await storageActor.markStorageEventsRead(events[0]!.id);
      expect(await storageActor.getStorageEventsUnreadCount()).toBe(0n);

      storageActor.setIdentity(manager.ownerIdentity);
      await revokeOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
      });

      storageActor.setIdentity(recipient);
      expect(await storageActor.getStorageEventsUnreadCount()).toBe(1n);
    });

    test("pending and durable grants reject missing entry scopes", async () => {
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      await expect(
        storageActor.createPendingAccessGrant({
          ref: { principal: userCharlie.getPrincipal() },
          accessClass: { ordinary: null },
          scope: { entry: [DIRECTORY, "missing-folder"] },
          permission: { Read: null },
          source: { ordinaryInvite: 3n },
          expiresAt: [],
        }),
      ).rejects.toThrow(/scope not found/i);

      await expect(
        storageActor.createDurableAccessGrant({
          principal: userCharlie.getPrincipal(),
          scope: { entry: [FILE, "missing-file.txt"] },
          permission: { Read: null },
          source: { durablePolicy: 3n },
        }),
      ).rejects.toThrow(/scope not found/i);
    });

    test("rejected durable grant does not leave filesystem ACL behind", async () => {
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();

      await expect(
        storageActor.createDurableAccessGrant({
          principal: Principal.anonymous(),
          scope: { root: null },
          permission: { Read: null },
          source: { durablePolicy: 4n },
        }),
      ).rejects.toThrow(/anonymous principal/i);

      expect(
        await storageActor.hasStoragePermission({
          entry: [],
          user: Principal.anonymous(),
          permission: { Read: null },
        }),
      ).toBe(false);
    });

    test("access request stores requester intent without scope or permission", async () => {
      const requester = createIdentity("access-request-reviewer");

      storageActor.setIdentity(requester);
      const request = await storageActor.requestAccess({
        emailCommitment: [],
        message: ["Need access for review"],
      });
      expect(request.requester.toText()).toBe(requester.getPrincipal().toText());
      expect(request.status).toEqual({ pending: null });

      await expect(storageActor.listAccessRequests()).rejects.toThrow();

      const requesterEventsBeforeDecision = await storageActor.listStorageEvents([], 100n);
      expect(
        requesterEventsBeforeDecision.some(
          (item) =>
            "access" in item.event &&
            "accessRequestCreated" in item.event.access &&
            item.event.access.accessRequestCreated.requestId === request.id,
        ),
      ).toBe(true);

      storageActor.setIdentity(userBob);
      const unrelatedUserEvents = await storageActor.listStorageEvents([], 100n);
      expect(
        unrelatedUserEvents.some(
          (item) =>
            "access" in item.event &&
            "accessRequestCreated" in item.event.access &&
            item.event.access.accessRequestCreated.requestId === request.id,
        ),
      ).toBe(false);

      await waitForBackendNotification(
        manager.ownerIdentity,
        (page) => page.data.some(
          (item) =>
            "storageAccessRequestCreated" in item.payload &&
            item.payload.storageAccessRequestCreated.requestId === request.id &&
            item.payload.storageAccessRequestCreated.requester.toText() === requester.getPrincipal().toText(),
        ),
      );

      storageActor.setIdentity(manager.ownerIdentity);
      const requests = await storageActor.listAccessRequests();
      expect(requests.some((item) => item.id === request.id)).toBe(true);
      const requestEvents = await storageActor.listStorageEvents([], 100n);
      expect(
        requestEvents.some(
          (item) =>
            "access" in item.event &&
            "accessRequestCreated" in item.event.access &&
            item.event.access.accessRequestCreated.requestId === request.id,
        ),
      ).toBe(true);

      const resolved = await storageActor.resolveAccessRequest({
        requestId: request.id,
        decision: { rejected: null },
      });
      expect(resolved.status).toEqual({ rejected: null });

      await waitForBackendNotification(
        requester,
        (page) => page.data.some(
          (item) =>
            "storageAccessRequestResolved" in item.payload &&
            item.payload.storageAccessRequestResolved.requestId === request.id &&
            "rejected" in item.payload.storageAccessRequestResolved.status,
        ),
      );

      storageActor.setIdentity(requester);
      const requesterEventsAfterDecision = await storageActor.listStorageEvents([], 100n);
      expect(
        requesterEventsAfterDecision.some(
          (item) =>
            "access" in item.event &&
            "accessRequestResolved" in item.event.access &&
            item.event.access.accessRequestResolved.requestId === request.id &&
            "rejected" in item.event.access.accessRequestResolved.status,
        ),
      ).toBe(true);

      storageActor.setIdentity(manager.ownerIdentity);
      backendActor.setIdentity(manager.ownerIdentity);
    });

    test("approved access request creates ordinary permission for owner-selected scope", async () => {
      storageActor.setIdentity(manager.ownerIdentity);
      await storageActor.refreshSubscription();
      await storageActor.create({
        entry: [DIRECTORY, "RequestApproved"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      const requester = createIdentity("access-request-approved-recipient");

      storageActor.setIdentity(requester);
      const request = await storageActor.requestAccess({
        emailCommitment: [],
        message: ["Need access to approved folder"],
      });

      storageActor.setIdentity(manager.ownerIdentity);
      const resolved = await storageActor.resolveAccessRequest({
        requestId: request.id,
        decision: {
          approved: {
            scope: { entry: [DIRECTORY, "RequestApproved"] },
            permission: { Read: null },
          },
        },
      });
      expect(resolved.status).toEqual({ approved: null });
      expect(
        await storageActor.hasStoragePermission({
          entry: [[DIRECTORY, "RequestApproved"]],
          user: requester.getPrincipal(),
          permission: { Read: null },
        }),
      ).toBe(true);

      const events = await storageActor.listStorageEvents([], 100n);
      expect(
        events.some(
          (item) =>
            "access" in item.event &&
            "principalGrantCreated" in item.event.access &&
            "accessRequest" in item.event.access.principalGrantCreated.source &&
            item.event.access.principalGrantCreated.source.accessRequest === request.id,
        ),
      ).toBe(true);

      storageActor.setIdentity(requester);
      const recipientEvents = await storageActor.listStorageEvents([], 100n);
      expect(
        recipientEvents.some(
          (item) =>
            "access" in item.event &&
            "principalGrantCreated" in item.event.access &&
            "accessRequest" in item.event.access.principalGrantCreated.source &&
            item.event.access.principalGrantCreated.source.accessRequest === request.id,
        ),
      ).toBe(true);
      expect(
        recipientEvents.some(
          (item) =>
            "access" in item.event &&
            "accessRequestResolved" in item.event.access &&
            item.event.access.accessRequestResolved.requestId === request.id,
        ),
      ).toBe(true);

      await waitForBackendNotification(
        requester,
        (page) => page.data.some(
          (item) =>
            "storageAccessRequestResolved" in item.payload &&
            item.payload.storageAccessRequestResolved.requestId === request.id &&
            "approved" in item.payload.storageAccessRequestResolved.status,
        ),
      );

      backendActor.setIdentity(requester);
      const requesterNotifications = await backendActor.listNotifications({ afterId: [], limit: 100n, unreadOnly: false });
      expect(
        requesterNotifications.data.some(
          (item) =>
            "storageAccessGranted" in item.payload &&
            "accessRequest" in item.payload.storageAccessGranted.source &&
            item.payload.storageAccessGranted.source.accessRequest === request.id,
        ),
      ).toBe(false);

      storageActor.setIdentity(manager.ownerIdentity);
      backendActor.setIdentity(manager.ownerIdentity);
    });

    test("createAccessBatch blocked when subscription expired", async () => {
      // Expire the latest Pro renewal issued by earlier access-flow tests.
      await manager.pic.advanceTime(45 * 24 * 60 * 60 * 1000);
      await manager.pic.tick(10);
      await storageActor.refreshSubscription();

      const status = await storageActor.getStatus();
      expect(status.subscriptionStatus[0]).not.toEqual({
        active: { plan: { Pro: null } },
      });

      await storageActor.create({
        entry: [DIRECTORY, "Blocked"],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      await expect(
        createOrdinaryAccessGrant({
          entry: [[DIRECTORY, "Blocked"]],
          user: manager.ownerIdentity.getPrincipal(),
          permission: { Read: null },
        }),
      ).rejects.toThrow(/subscription|expired/i);

      await expect(
        storageActor.createPendingAccessGrant({
          ref: { principal: userBob.getPrincipal() },
          accessClass: { ordinary: null },
          scope: { root: null },
          permission: { Read: null },
        source: { ordinaryInvite: 1n },
        expiresAt: [],
      }),
      ).rejects.toThrow(/subscription|expired/i);

      await expect(
        storageActor.createDurableAccessGrant({
          principal: userBob.getPrincipal(),
          scope: { root: null },
        permission: { Read: null },
        source: { durablePolicy: 0n },
      }),
      ).rejects.toThrow(/subscription|expired/i);
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

    test("#active (Pro) — createAccessBatch works after reactivation", async () => {
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
      await createOrdinaryAccessGrant({
        entry: [[DIRECTORY, "ProShared"]],
        user: userAlice.getPrincipal(),
        permission: { Read: null },
      });

      const durable = await storageActor.createDurableAccessGrant({
        principal: userBob.getPrincipal(),
        scope: { root: null },
        permission: { Read: null },
        source: { durablePolicy: 1n },
      });
      expect(durable.accessClass).toEqual({ durable: null });
    });

    test("revokeAccessBatch revokes durable grant subscription bypass", async () => {
      const recipient = createIdentity("durable-revoke-recipient");

      await ensureOwnerProSubscription();

      const file = await storageActor.create({
        entry: [FILE, "DurableRevokedKey.txt"],
        createMode: CREATE_NEW,
        encryptionMode: toNullable(ENCRYPTED),
      });

      await storageActor.createDurableAccessGrant({
        principal: recipient.getPrincipal(),
        scope: { root: null },
        permission: { Read: null },
        source: { durablePolicy: 5n },
      });
      await revokeOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
      });

      await createOrdinaryAccessGrant({
        entry: [],
        user: recipient.getPrincipal(),
        permission: { Read: null },
      });

      await manager.pic.advanceTime(31 * 24 * 60 * 60 * 1000);
      await manager.pic.tick(10);

      storageActor.setIdentity(recipient);
      await expect(
        storageActor.getEncryptedVetkey(file.keyId, new Uint8Array(48)),
      ).rejects.toThrow(/expired/i);

      storageActor.setIdentity(manager.ownerIdentity);
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
      await ensureOwnerProSubscription();
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
