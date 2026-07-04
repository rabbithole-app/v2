/**
 * Referral-discount charge funnel: Pro purchases through chargeForService
 * with a coupon-granted 10% first-payment discount.
 * License-path discount (deferred payout) is covered in storage-deployer.test.ts.
 */
import { type Actor, createIdentity } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";
import { E8S_PER_ICP, minterIdentity } from "@rabbithole/testing";

import { BackendManager } from "./setup/backend-manager.ts";
import { ONE_TRILLION_CYCLES } from "./setup/constants.ts";

type BackendActor = RabbitholeActorService;

describe("Referral discount: Pro purchase funnel", () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;

  beforeAll(async () => {
    manager = await BackendManager.create({ fiduciary: true });
    await manager.deployXrcMock();
    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    await manager.pic.tick();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  async function setupAmbassadorCoupon(seed: string): Promise<string> {
    const ambassador = createIdentity(`amb-${seed}`);
    actor.setIdentity(ambassador);
    await actor.ensureUser([]);
    const result = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    if (!("ok" in result)) throw new Error(`createCoupon failed: ${JSON.stringify(result)}`);
    return result.ok.code;
  }

  async function setupBuyer(
    seed: string,
    opts: { couponCode?: string; fund?: boolean },
  ) {
    const buyer = createIdentity(`buyer-${seed}`);
    actor.setIdentity(buyer);
    await actor.ensureUser([]);
    if (opts.couponCode) {
      expect(await actor.applyReferralCode(opts.couponCode)).toEqual({ ok: null });
    }
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: false,
      autoTopUp: false,
      topUpAmountCycles: ONE_TRILLION_CYCLES,
    });
    if (opts.fund !== false) {
      manager.icpLedgerActor.setIdentity(minterIdentity);
      await manager.icpLedgerActor.icrc1_transfer({
        to: {
          owner: manager.backendCanisterId,
          subaccount: [principalToSubAccount(buyer.getPrincipal())],
        },
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        amount: 10n * E8S_PER_ICP,
      });
      actor.setIdentity(buyer);
    }
    return buyer;
  }

  async function distributionRowsFor(buyer: ReturnType<typeof createIdentity>) {
    actor.setIdentity(manager.ownerIdentity);
    const log = await actor.getDistributionLog({ limit: 1000n, offset: 0n });
    return log.filter((r) => r.payer.toText() === buyer.getPrincipal().toText());
  }

  test("first Pro month with coupon charges ~90%, ambassador gets 15% of the paid amount", async () => {
    const couponCode = await setupAmbassadorCoupon("pro-main");
    const fullBuyer = await setupBuyer("pro-full", {});
    actor.setIdentity(fullBuyer);
    expect(await actor.purchaseSubscription({ Pro: null })).toHaveProperty("ok");

    const discountBuyer = await setupBuyer("pro-disc", { couponCode });
    actor.setIdentity(discountBuyer);
    expect(await actor.purchaseSubscription({ Pro: null })).toHaveProperty("ok");

    const [fullRow] = await distributionRowsFor(fullBuyer);
    const [discountRow] = await distributionRowsFor(discountBuyer);
    expect(fullRow).toBeDefined();
    expect(discountRow).toBeDefined();

    // Paid amount is ~90% of list price (tolerance absorbs rate rounding).
    expect(Number(discountRow.totalAmount) / Number(fullRow.totalAmount)).toBeCloseTo(
      0.9,
      3,
    );
    // Split is computed from the PAID amount: L1 = 15% of discounted total.
    expect(discountRow.l1Amount).toBe((discountRow.totalAmount * 1500n) / 10_000n);
    expect(discountRow.treasuryAmount).toBe(
      discountRow.totalAmount - discountRow.l1Amount,
    );
    // Undiscounted buyer had no ambassador: 100% treasury.
    expect(fullRow.l1Amount).toBe(0n);

    // Flag burned for Pro only; license discount remains available.
    actor.setIdentity(discountBuyer);
    const discount = (await actor.getMyDiscountState())[0];
    expect(discount?.proFirstMonthUsed).toBe(true);
    expect(discount?.licenseUsed).toBe(false);
  });

  test("second Pro payment is charged at full price", async () => {
    const couponCode = await setupAmbassadorCoupon("pro-second");
    const buyer = await setupBuyer("pro-repeat", { couponCode });

    actor.setIdentity(buyer);
    expect(await actor.purchaseSubscription({ Pro: null })).toHaveProperty("ok");
    expect(await actor.purchaseSubscription({ Pro: null })).toHaveProperty("ok");

    const rows = await distributionRowsFor(buyer);
    expect(rows).toHaveLength(2);
    const [first, second] = [...rows].sort((a, b) => Number(a.id - b.id));
    // Second charge is full price — strictly greater than the discounted first.
    expect(Number(first.totalAmount) / Number(second.totalAmount)).toBeCloseTo(
      0.9,
      3,
    );
    // Ambassador still earns 15% recurring on the full second payment.
    expect(second.l1Amount).toBe((second.totalAmount * 1500n) / 10_000n);
  });

  test("failed charge keeps the discount for a retry", async () => {
    const couponCode = await setupAmbassadorCoupon("pro-retry");
    const buyer = await setupBuyer("pro-poor", { couponCode, fund: false });

    actor.setIdentity(buyer);
    const failed = await actor.purchaseSubscription({ Pro: null });
    expect(failed).toHaveProperty("err");

    const discountAfterFail = (await actor.getMyDiscountState())[0];
    expect(discountAfterFail?.proFirstMonthUsed).toBe(false);

    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: {
        owner: manager.backendCanisterId,
        subaccount: [principalToSubAccount(buyer.getPrincipal())],
      },
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    actor.setIdentity(buyer);
    expect(await actor.purchaseSubscription({ Pro: null })).toHaveProperty("ok");
    const [row] = await distributionRowsFor(buyer);
    expect(row.l1Amount).toBe((row.totalAmount * 1500n) / 10_000n);
    expect(row.l1Amount).toBeGreaterThan(0n);

    actor.setIdentity(buyer);
    expect((await actor.getMyDiscountState())[0]?.proFirstMonthUsed).toBe(true);
  });

  test("getMyDistributions returns rows where caller is ambassador or payer", async () => {
    const ambassador = createIdentity("amb-dist");
    actor.setIdentity(ambassador);
    await actor.ensureUser([]);
    const couponResult = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    if (!("ok" in couponResult)) throw new Error("createCoupon failed");

    const buyer = await setupBuyer("dist", { couponCode: couponResult.ok.code });
    actor.setIdentity(buyer);
    expect(await actor.purchaseSubscription({ Pro: null })).toHaveProperty("ok");

    // Ambassador sees the referred purchase with their own L1 share.
    actor.setIdentity(ambassador);
    const ambassadorRows = await actor.getMyDistributions();
    const earning = ambassadorRows.find(
      (r) => r.payer.toText() === buyer.getPrincipal().toText(),
    );
    expect(earning).toBeDefined();
    expect(earning!.l1Amount).toBeGreaterThan(0n);
    expect(earning!.ambassadorL1[0]?.toText()).toBe(
      ambassador.getPrincipal().toText(),
    );

    // Payer sees their own charge; an unrelated user sees nothing.
    actor.setIdentity(buyer);
    const buyerRows = await actor.getMyDistributions();
    expect(buyerRows.some((r) => r.payer.toText() === buyer.getPrincipal().toText())).toBe(true);

    const stranger = createIdentity("dist-stranger");
    actor.setIdentity(stranger);
    await actor.ensureUser([]);
    const strangerRows = await actor.getMyDistributions();
    expect(
      strangerRows.filter(
        (r) => r.payer.toText() === buyer.getPrincipal().toText(),
      ),
    ).toHaveLength(0);
  });
});
