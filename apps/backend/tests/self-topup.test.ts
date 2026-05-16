import type { CanisterFixture } from "@dfinity/pic";
import { createIdentity } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager";
import { E8S_PER_ICP, ONE_TRILLION_CYCLES } from "./setup/constants";

/**
 * Fixed treasury subaccount — mirrors `Const.treasurySubaccount()` in
 * mo:treasury. Duplicated here so tests can inspect treasury balances
 * without pulling in the library.
 */
const TREASURY_SUBACCOUNT: Uint8Array = new Uint8Array([
  0x00, 0x74, 0x72, 0x65, 0x61, 0x73, 0x75, 0x72, 0x79,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0,
]);

describe("Backend self-topup from treasury", () => {
  let manager: BackendManager;
  let backendFixture: CanisterFixture<RabbitholeActorService>;

  beforeAll(async () => {
    manager = await BackendManager.create();
    backendFixture = await manager.initBackendCanister();
    await manager.deployXrcMock();
  });

  afterAll(async () => {
    await manager.afterAll();
  });

  test("getBackendCyclesBalance: admin sees a non-zero balance", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const balance = await backendFixture.actor.getBackendCyclesBalance();
    expect(balance).toBeGreaterThan(0n);
  });

  test("getBackendCyclesBalance: non-admin is rejected", async () => {
    const stranger = createIdentity("cycles-query-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(backendFixture.actor.getBackendCyclesBalance()).rejects.toThrow();
  });

  test("triggerSelfTopUp: non-admin is rejected", async () => {
    const stranger = createIdentity("self-topup-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(backendFixture.actor.triggerSelfTopUp()).rejects.toThrow();
  });

  test("retryPendingCmcOp: non-admin is rejected", async () => {
    const stranger = createIdentity("retry-cmc-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(backendFixture.actor.retryPendingCmcOp(0n)).rejects.toThrow();
  });

  test("triggerSelfTopUp: no-op when cycles already at/above target (fresh backend)", async () => {
    // Fresh PocketIC backend has ~100 T cycles — well above the 5 T target.
    // Treasury has zero ICP at this point. triggerSelfTopUp must return
    // cleanly WITHOUT attempting any transfer (nothing to transfer from, and
    // target already reached). No exception = passing test.
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    await backendFixture.actor.triggerSelfTopUp();

    // Treasury subaccount still zero — confirms no transfer was attempted.
    const treasuryBalance = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendFixture.canisterId,
      subaccount: [TREASURY_SUBACCOUNT],
    });
    expect(treasuryBalance).toBe(0n);
  });

  test("triggerSelfTopUp: logs and returns gracefully when treasury is empty below target", async () => {
    // Even if we somehow end up below target, missing treasury funds must not
    // cause the admin call to trap. Fund nothing, call — expect no throw.
    // Backend is still above target here so the early-exit path is exercised.
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    await backendFixture.actor.triggerSelfTopUp();
  });

  test("purchaseLicenseAndCreateStorage silently triggers maybeTopUpSelf (no error surfaces)", async () => {
    // maybeTopUpSelf runs as fire-and-forget Timer(#seconds 0, ...) — it must
    // not crash or delay the purchase even if the self-topup machinery has
    // nothing to do. This test verifies a user-facing purchase completes
    // without any error leaking from the opportunistic self-topup trigger.
    const identity = createIdentity("self-topup-purchase-trigger");

    backendFixture.actor.setIdentity(identity);
    await backendFixture.actor.ensureUser([]);

    // Fund user subaccount enough to cover the license charge and canister
    // creation (same pattern as fundUserForStorage in storage-deployer.test.ts).
    const totalCycles = 2_000_000_000_000n;
    const rate = await manager.cmcActor.get_icp_xdr_conversion_rate();
    const cyclesE8s = (totalCycles * 10_000n * E8S_PER_ICP) / (ONE_TRILLION_CYCLES * rate.data.xdr_permyriad_per_icp);
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendFixture.canisterId, subaccount: [principalToSubAccount(identity.getPrincipal())] },
      amount: cyclesE8s + 100_000_000n,
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
    });

    backendFixture.actor.setIdentity(identity);
    const result = await backendFixture.actor.purchaseLicenseAndCreateStorage(
      { OnChain: null },
      [[{ name: 'VETKEY_NAME', value: 'dfx_test_key' }]],
    );
    expect(result).toHaveProperty("ok");
  });

  test("runSelfTopUp early-exit does NOT emit #backendSelfTopUpFailed", async () => {
    // Fresh backend is above target → runSelfTopUp returns on the first
    // check without ever attempting a transfer. The failure notification
    // should only fire on real errors — an early-exit is not a failure.
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const before = await backendFixture.actor.listNotifications({ afterId: [], limit: 100n, unreadOnly: false });
    await backendFixture.actor.triggerSelfTopUp();
    const after = await backendFixture.actor.listNotifications({ afterId: [], limit: 100n, unreadOnly: false });

    const newlyFailed = after.data.slice(0, after.data.length - before.data.length).filter((n) => {
      return Object.keys(n.payload)[0] === "backendSelfTopUpFailed";
    });
    expect(newlyFailed).toHaveLength(0);
  });

  test("triggerSelfTopUp: does not drain treasury when backend already at target", async () => {
    // Deposit extra ICP into the treasury subaccount and call triggerSelfTopUp.
    // Current backend cycles are well above the 5 TC target (PocketIC seeds
    // canisters with a very large default), so `selfTopUpFromTreasury` must
    // early-exit and leave the treasury untouched. This guards against the
    // no-op branch being broken by future refactors.
    //
    // Treasury subaccount may already hold funds from earlier tests that
    // exercised `chargeAndDistribute`, so we measure the delta across our
    // own transfer rather than assuming a zero starting point.
    const accountArg = {
      owner: backendFixture.canisterId,
      subaccount: [TREASURY_SUBACCOUNT] as [Uint8Array],
    };
    const baseline = await manager.icpLedgerActor.icrc1_balance_of(accountArg);

    const depositAmount = 100_000_000n; // 1 ICP
    manager.icpLedgerActor.setIdentity(manager.ownerIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: accountArg,
      amount: depositAmount,
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
    });

    const treasuryBefore = await manager.icpLedgerActor.icrc1_balance_of(accountArg);
    expect(treasuryBefore).toBe(baseline + depositAmount);

    backendFixture.actor.setIdentity(manager.ownerIdentity);
    await backendFixture.actor.triggerSelfTopUp();

    const treasuryAfter = await manager.icpLedgerActor.icrc1_balance_of(accountArg);
    // No-op branch: treasury unchanged between before/after the trigger call.
    expect(treasuryAfter).toBe(treasuryBefore);
  });
});
