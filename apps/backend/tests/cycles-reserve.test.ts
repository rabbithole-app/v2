/**
 * Cycles reserve tests: user-facing top-ups served from the backend's own
 * cycle balance (single deposit_cycles call) instead of the ICP→CMC
 * round-trip, with automatic fallback to the CMC path when the reserve
 * can't cover the amount above the ops floor.
 *
 * PocketIC gives the backend ~10^18 cycles, so with the default 10 TC floor
 * the reserve path always wins; raising the floor above the balance via
 * `setCyclesReserveConfig` forces the CMC fallback.
 */
import { Actor, createIdentity } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  encryptedStorageIdlFactory,
  initEncryptedStorage,
  type RabbitholeActorService,
} from "@rabbithole/declarations";
import { E8S_PER_ICP, ICP_LEDGER_CANISTER_ID } from "@rabbithole/testing";

import { BackendManager } from "./setup/backend-manager.ts";
import {
  buildStorageEnvironmentVariables,
  CKUSDC_CANISTER_ID,
  STORAGE_WASM_PATH as ENCRYPTED_STORAGE_WASM_PATH,
  ONE_TRILLION_CYCLES,
} from "./setup/constants.ts";
import { runHttpDownloaderQueueProcessor } from "./setup/github-outcalls.ts";

type BackendActor = RabbitholeActorService;
type TopUpFromBalanceResult = Awaited<
  ReturnType<BackendActor["topUpFromBalance"]>
>;

const DEFAULT_OPS_FLOOR = 10_000_000_000_000n; // 10 TC
const DEFAULT_REFILL_WATERMARK = 25_000_000_000_000n; // 25 TC
// Above the backend's ~10^18 test balance — forces the CMC fallback path.
const FLOOR_ABOVE_BALANCE = 10_000_000_000_000_000_000n;

function expectTopUpSuccess(result: TopUpFromBalanceResult) {
  if (!("ok" in result)) {
    throw new Error(`Expected ok, got: ${JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  }
  return result.ok;
}

function encodeStorageInitArg(owner: Principal): Uint8Array {
  const [initArgsIdl] = initEncryptedStorage({ IDL });
  return new Uint8Array(
    IDL.encode(
      [initArgsIdl],
      [
        {
          owner,
          storageBackendType: [{ OnChain: null }],
        },
      ],
    ),
  );
}

describe("Cycles reserve", () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;
  let storageCanisterId: Principal;
  const storageUser = createIdentity("cycles-reserve-user");

  async function treasuryIcpBalance(): Promise<bigint> {
    const icpLedger = manager.createIcrcLedgerActor(ICP_LEDGER_CANISTER_ID);
    return await icpLedger.icrc1_balance_of({
      owner: backendCanisterId,
      subaccount: [BackendManager.TREASURY_SUBACCOUNT],
    });
  }

  beforeAll(async () => {
    manager = await BackendManager.create({ fiduciary: true });

    await manager.deployXrcMock();
    await manager.deployCkUsdcLedger();

    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;

    actor.setIdentity(manager.ownerIdentity);
    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () =>
        (await actor.getStorageReleaseAdminStatus()).hasDownloadedRelease,
    );
    await manager.pic.tick();

    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      await manager.pic.tick(20);
      ready = (await actor.getStorageReleaseAdminStatus())
        .hasDeploymentReadyRelease;
    }
    expect(ready).toBe(true);

    // Treasury ICP funds the CMC fallback path.
    await manager.mintToTreasurySubaccount(
      ICP_LEDGER_CANISTER_ID,
      100n * E8S_PER_ICP,
    );

    const storageInitArg = encodeStorageInitArg(storageUser.getPrincipal());
    const storageFixture = await manager.pic.setupCanister({
      wasm: ENCRYPTED_STORAGE_WASM_PATH,
      sender: storageUser.getPrincipal(),
      idlFactory: encryptedStorageIdlFactory as unknown as IDL.InterfaceFactory,
      environmentVariables: buildStorageEnvironmentVariables(backendCanisterId),
      arg: storageInitArg,
    });
    storageCanisterId = storageFixture.canisterId;
    await manager.pic.tick();

    actor.setIdentity(storageUser);
    await actor.ensureUser([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false,
      autoTopUp: false,
      topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const addResult = await actor.addStorage(storageCanisterId, storageInitArg);
    expect(addResult).toHaveProperty("ok");
    await manager.pic.tick();
  }, 360_000);

  afterAll(async () => {
    await manager?.afterAll();
  });

  test("getCyclesReserveStats: non-admin is rejected", async () => {
    actor.setIdentity(storageUser);
    await expect(actor.getCyclesReserveStats()).rejects.toThrow();
  });

  test("setCyclesReserveConfig: non-admin is rejected", async () => {
    actor.setIdentity(storageUser);
    await expect(
      actor.setCyclesReserveConfig({
        opsFloor: 0n,
        refillWatermark: 0n,
      }),
    ).rejects.toThrow();
  });

  test("getCyclesReserveStats: fresh backend has defaults and zero counters", async () => {
    actor.setIdentity(manager.ownerIdentity);
    const stats = await actor.getCyclesReserveStats();
    expect(stats.opsFloor).toBe(DEFAULT_OPS_FLOOR);
    expect(stats.refillWatermark).toBe(DEFAULT_REFILL_WATERMARK);
    expect(stats.balance).toBeGreaterThan(DEFAULT_OPS_FLOOR);
    expect(stats.manualTopUps).toBe(0n);
    expect(stats.manualTopUpCycles).toBe(0n);
    expect(stats.cmcFallbacks).toBe(0n);
  });

  test("topUpFromBalance: served from reserve — treasury ICP untouched, backend cycles spent", async () => {
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      storageUser.getPrincipal(),
      50_000_000n, // $50
    );

    const treasuryBefore = await treasuryIcpBalance();
    const backendCyclesBefore =
      await manager.getCyclesBalance(backendCanisterId);
    const storageCyclesBefore =
      await manager.getCyclesBalance(storageCanisterId);

    actor.setIdentity(storageUser);
    const result = await actor.topUpFromBalance(
      storageCanisterId,
      ONE_TRILLION_CYCLES,
    );
    await manager.pic.tick(5);

    const { cyclesAdded } = expectTopUpSuccess(result);
    expect(cyclesAdded).toBe(ONE_TRILLION_CYCLES);

    const storageCyclesAfter =
      await manager.getCyclesBalance(storageCanisterId);
    expect(storageCyclesAfter).toBeGreaterThan(storageCyclesBefore);
    // deposit_cycles delivers the amount 1:1 (minus idle burn between reads)
    expect(storageCyclesAfter - storageCyclesBefore).toBeGreaterThan(
      (ONE_TRILLION_CYCLES * 9n) / 10n,
    );

    // The reserve paid — backend balance dropped by at least the amount.
    const backendCyclesAfter =
      await manager.getCyclesBalance(backendCanisterId);
    expect(backendCyclesBefore - backendCyclesAfter).toBeGreaterThanOrEqual(
      ONE_TRILLION_CYCLES,
    );

    // No CMC round-trip — treasury ICP stays put.
    const treasuryAfter = await treasuryIcpBalance();
    expect(treasuryAfter).toBe(treasuryBefore);

    actor.setIdentity(manager.ownerIdentity);
    const stats = await actor.getCyclesReserveStats();
    expect(stats.manualTopUps).toBe(1n);
    expect(stats.manualTopUpCycles).toBe(ONE_TRILLION_CYCLES);
    expect(stats.cmcFallbacks).toBe(0n);
  });

  test("topUpFromBalance: floor above balance → CMC fallback path, treasury ICP spent", async () => {
    actor.setIdentity(manager.ownerIdentity);
    await actor.setCyclesReserveConfig({
      opsFloor: FLOOR_ABOVE_BALANCE,
      refillWatermark: DEFAULT_REFILL_WATERMARK,
    });

    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      storageUser.getPrincipal(),
      50_000_000n,
    );

    const treasuryBefore = await treasuryIcpBalance();
    const storageCyclesBefore =
      await manager.getCyclesBalance(storageCanisterId);

    actor.setIdentity(storageUser);
    const result = await actor.topUpFromBalance(
      storageCanisterId,
      ONE_TRILLION_CYCLES,
    );
    await manager.pic.tick(10);

    const { cyclesAdded } = expectTopUpSuccess(result);
    expect(cyclesAdded).toBe(ONE_TRILLION_CYCLES);

    const storageCyclesAfter =
      await manager.getCyclesBalance(storageCanisterId);
    expect(storageCyclesAfter).toBeGreaterThan(storageCyclesBefore);

    // CMC path burned treasury ICP.
    const treasuryAfter = await treasuryIcpBalance();
    expect(treasuryAfter).toBeLessThan(treasuryBefore);

    actor.setIdentity(manager.ownerIdentity);
    const stats = await actor.getCyclesReserveStats();
    expect(stats.opsFloor).toBe(FLOOR_ABOVE_BALANCE);
    expect(stats.cmcFallbacks).toBe(1n);
    // Manual counter unchanged from the reserve-path test above.
    expect(stats.manualTopUps).toBe(1n);

    // Restore defaults for any test that runs after this one.
    await actor.setCyclesReserveConfig({
      opsFloor: DEFAULT_OPS_FLOOR,
      refillWatermark: DEFAULT_REFILL_WATERMARK,
    });
  });
});
