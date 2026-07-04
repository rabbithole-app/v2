import { type Actor, createIdentity } from "@dfinity/pic";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type {
  Coupon,
  RabbitholeActorService,
} from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager.ts";
import { userAlice, userBob, userCharlie } from "./setup/helpers.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function msToNs(ms: number): bigint {
  return BigInt(ms) * 1_000_000n;
}

function expectOk<T extends { ok?: unknown }>(
  result: T | { err: unknown },
): Exclude<T["ok"], undefined> {
  if (!("ok" in result)) {
    throw new Error(`Expected ok, got ${JSON.stringify(result)}`);
  }
  return result.ok as Exclude<T["ok"], undefined>;
}

describe("Coupons", () => {
  let actor: Actor<RabbitholeActorService>;
  let manager: BackendManager;
  let now: Date;

  async function createUserCoupon(
    owner: Parameters<typeof actor.setIdentity>[0],
    args?: { maxRedemptions?: bigint; expiresAt?: bigint; note?: string },
  ): Promise<Coupon> {
    actor.setIdentity(owner);
    await actor.ensureUser([]);
    const result = await actor.createCoupon({
      maxRedemptions: args?.maxRedemptions !== undefined ? [args.maxRedemptions] : [],
      expiresAt: args?.expiresAt !== undefined ? [args.expiresAt] : [],
      note: args?.note !== undefined ? [args.note] : [],
    });
    return expectOk(result) as Coupon;
  }

  beforeEach(async () => {
    manager = await BackendManager.create();
    ({ actor } = await manager.initBackendCanister());
    now = new Date();
    await manager.pic.setTime(now);
  });

  afterEach(async () => {
    await manager?.afterAll();
  });

  test("createCoupon issues an 8-char code with the default 10% discount", async () => {
    const coupon = await createUserCoupon(userAlice);

    expect(coupon.code).toHaveLength(8);
    expect(coupon.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(coupon.discountBps).toBe(1000n);
    expect(coupon.redeemedCount).toBe(0n);
    expect(coupon.revoked).toBe(false);
    expect(coupon.owner.toText()).toBe(userAlice.getPrincipal().toText());

    const coupons = await actor.getMyCoupons();
    expect(coupons).toHaveLength(1);
    expect(coupons[0].code).toBe(coupon.code);
  });

  test("createCoupon stores a private note, trimmed, visible in getMyCoupons", async () => {
    const coupon = await createUserCoupon(userAlice, { note: "  for twitter  " });
    expect(coupon.note).toEqual(["for twitter"]);

    const coupons = await actor.getMyCoupons();
    expect(coupons[0].note).toEqual(["for twitter"]);

    // Note is gone together with the coupon.
    expect(await actor.revokeCoupon(coupon.code)).toEqual({ ok: null });
    expect(await actor.deleteCoupon(coupon.code)).toEqual({ ok: null });
  });

  test("createCoupon requires a registered user", async () => {
    actor.setIdentity(userAlice);
    const result = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    expect(result).toEqual({ err: { userNotFound: null } });
  });

  test("createCoupon rejects past expiry and zero maxRedemptions", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    const pastExpiry = await actor.createCoupon({
      maxRedemptions: [],
      expiresAt: [msToNs(now.getTime() - DAY_MS)],
      note: [],
    });
    expect(pastExpiry).toEqual({ err: { invalidExpiry: null } });

    const zeroRedemptions = await actor.createCoupon({
      maxRedemptions: [0n],
      expiresAt: [],
      note: [],
    });
    expect(zeroRedemptions).toEqual({ err: { invalidMaxRedemptions: null } });

    const longNote = await actor.createCoupon({
      maxRedemptions: [],
      expiresAt: [],
      note: ["x".repeat(65)],
    });
    expect(longNote).toEqual({ err: { invalidNote: null } });
  });

  test("active coupons are limited to 10; revoking frees a slot", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const coupon = expectOk(
        await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] }),
      ) as Coupon;
      codes.push(coupon.code);
    }
    expect(new Set(codes).size).toBe(10);

    const overLimit = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    expect(overLimit).toEqual({ err: { tooManyActiveCoupons: { limit: 10n } } });

    expect(await actor.revokeCoupon(codes[0])).toEqual({ ok: null });
    const afterRevoke = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    expect("ok" in afterRevoke).toBe(true);
  });

  test("deleteCoupon removes inactive coupons only, owner only", async () => {
    const coupon = await createUserCoupon(userAlice);

    // Active coupon cannot be deleted.
    expect(await actor.deleteCoupon(coupon.code)).toEqual({
      err: { couponActive: null },
    });

    expect(await actor.revokeCoupon(coupon.code)).toEqual({ ok: null });

    // Non-owner cannot delete a revoked coupon.
    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.deleteCoupon(coupon.code)).toEqual({
      err: { notOwner: null },
    });

    actor.setIdentity(userAlice);
    expect(await actor.deleteCoupon(coupon.code)).toEqual({ ok: null });
    expect(await actor.getMyCoupons()).toHaveLength(0);
    expect(await actor.deleteCoupon(coupon.code)).toEqual({
      err: { couponNotFound: null },
    });
  });

  test("revokeCoupon rejects non-owner and is idempotent for the owner", async () => {
    const coupon = await createUserCoupon(userAlice);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.revokeCoupon(coupon.code)).toEqual({ err: { notOwner: null } });
    expect(await actor.revokeCoupon("NOPE1234")).toEqual({ err: { couponNotFound: null } });

    actor.setIdentity(userAlice);
    expect(await actor.revokeCoupon(coupon.code)).toEqual({ ok: null });
    expect(await actor.revokeCoupon(coupon.code)).toEqual({ ok: null });
  });

  test("coupon activation binds inviter, grants discount, increments redeemedCount", async () => {
    const coupon = await createUserCoupon(userAlice);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ ok: null });

    const user = (await actor.getUser())[0];
    expect(user?.inviter[0]?.toText()).toBe(userAlice.getPrincipal().toText());

    const discount = (await actor.getMyDiscountState())[0];
    expect(discount?.discountBps).toBe(1000n);
    expect(discount?.couponCode).toBe(coupon.code);
    expect(discount?.licenseUsed).toBe(false);
    expect(discount?.proFirstMonthUsed).toBe(false);

    actor.setIdentity(userAlice);
    const coupons = await actor.getMyCoupons();
    expect(coupons[0].redeemedCount).toBe(1n);
  });

  test("personal referral code still binds inviter without discount", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.createProfile({ username: "alice-amb", displayName: [] });
    const personalCode = (await actor.getProfile())[0]!.referralCode[0]!;

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(personalCode)).toEqual({ ok: null });

    const user = (await actor.getUser())[0];
    expect(user?.inviter[0]?.toText()).toBe(userAlice.getPrincipal().toText());
    expect(await actor.getMyDiscountState()).toEqual([]);
  });

  test("same-owner coupon after personal-code binding grants discount only", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.createProfile({ username: "alice-amb2", displayName: [] });
    const personalCode = (await actor.getProfile())[0]!.referralCode[0]!;
    const coupon = await createUserCoupon(userAlice);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(personalCode)).toEqual({ ok: null });
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ ok: null });

    const user = (await actor.getUser())[0];
    expect(user?.inviter[0]?.toText()).toBe(userAlice.getPrincipal().toText());
    const discount = (await actor.getMyDiscountState())[0];
    expect(discount?.couponCode).toBe(coupon.code);
  });

  test("foreign coupon after coupon binding is rejected and grants nothing", async () => {
    const aliceCoupon = await createUserCoupon(userAlice);
    const charlieCoupon = await createUserCoupon(userCharlie);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(aliceCoupon.code)).toEqual({ ok: null });
    expect(await actor.applyReferralCode(charlieCoupon.code)).toEqual({
      discountAlreadyApplied: null,
    });

    const user = (await actor.getUser())[0];
    expect(user?.inviter[0]?.toText()).toBe(userAlice.getPrincipal().toText());

    actor.setIdentity(userCharlie);
    expect((await actor.getMyCoupons())[0].redeemedCount).toBe(0n);
  });

  test("foreign coupon after personal-code binding is rejected without discount", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.createProfile({ username: "alice-amb3", displayName: [] });
    const personalCode = (await actor.getProfile())[0]!.referralCode[0]!;
    const charlieCoupon = await createUserCoupon(userCharlie);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(personalCode)).toEqual({ ok: null });
    expect(await actor.applyReferralCode(charlieCoupon.code)).toEqual({
      alreadyApplied: null,
    });

    expect(await actor.getMyDiscountState()).toEqual([]);
    const user = (await actor.getUser())[0];
    expect(user?.inviter[0]?.toText()).toBe(userAlice.getPrincipal().toText());

    actor.setIdentity(userCharlie);
    expect((await actor.getMyCoupons())[0].redeemedCount).toBe(0n);
  });

  test("own coupon is rejected as self-referral", async () => {
    const coupon = await createUserCoupon(userAlice);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ selfReferral: null });
  });

  test("coupon requires a registered user", async () => {
    const coupon = await createUserCoupon(userAlice);
    actor.setIdentity(userBob);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ userNotFound: null });
  });

  test("one-time coupon is exhausted after a single redemption", async () => {
    const coupon = await createUserCoupon(userAlice, { maxRedemptions: 1n });

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ ok: null });

    actor.setIdentity(userCharlie);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({
      couponExhausted: null,
    });
  });

  test("multi-use coupon serves several users and counts redemptions", async () => {
    const coupon = await createUserCoupon(userAlice);

    for (const [index, identity] of [userBob, userCharlie].entries()) {
      actor.setIdentity(identity);
      await actor.ensureUser([]);
      expect(await actor.applyReferralCode(coupon.code)).toEqual({ ok: null });

      actor.setIdentity(userAlice);
      expect((await actor.getMyCoupons())[0].redeemedCount).toBe(BigInt(index + 1));
    }
  });

  test("revoked coupon is rejected", async () => {
    const coupon = await createUserCoupon(userAlice);
    expect(await actor.revokeCoupon(coupon.code)).toEqual({ ok: null });

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ couponRevoked: null });
  });

  test("expired coupon is rejected", async () => {
    const coupon = await createUserCoupon(userAlice, {
      expiresAt: msToNs(now.getTime() + DAY_MS),
    });

    await manager.pic.setTime(new Date(now.getTime() + 2 * DAY_MS));

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(coupon.code)).toEqual({ couponExpired: null });
  });

  test("second coupon after granted discount is rejected", async () => {
    const aliceCoupon = await createUserCoupon(userAlice);
    const aliceCoupon2 = await createUserCoupon(userAlice);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(aliceCoupon.code)).toEqual({ ok: null });
    expect(await actor.applyReferralCode(aliceCoupon2.code)).toEqual({
      discountAlreadyApplied: null,
    });

    actor.setIdentity(userAlice);
    const coupons = await actor.getMyCoupons();
    const redeemed = coupons.map((c) => c.redeemedCount);
    expect(redeemed.filter((count) => count === 1n)).toHaveLength(1);
    expect(redeemed.filter((count) => count === 0n)).toHaveLength(1);
  });

  test("unknown code resolves to referralCodeNotFound", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode("ZZZZZZZZ")).toEqual({
      referralCodeNotFound: null,
    });
  });
});

describe("Referral discount configuration", () => {
  let actor: Actor<RabbitholeActorService>;
  let manager: BackendManager;

  beforeEach(async () => {
    manager = await BackendManager.create();
    ({ actor } = await manager.initBackendCanister());
  });

  afterEach(async () => {
    await manager?.afterAll();
  });

  test("defaults to 1000 bps and is admin-configurable with a 3500 cap", async () => {
    expect(await actor.getReferralDiscountBps()).toBe(1000n);

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await expect(actor.setReferralDiscountBps(2000n)).rejects.toThrow();

    actor.setIdentity(manager.ownerIdentity);
    await expect(actor.setReferralDiscountBps(3600n)).rejects.toThrow(
      /cannot exceed 3500/,
    );

    await actor.setReferralDiscountBps(2000n);
    expect(await actor.getReferralDiscountBps()).toBe(2000n);
  });

  test("coupons snapshot the bps at creation; config changes never retrofit", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    const before = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    const beforeCoupon = ("ok" in before ? before.ok : undefined)!;
    expect(beforeCoupon.discountBps).toBe(1000n);

    actor.setIdentity(manager.ownerIdentity);
    await actor.setReferralDiscountBps(2500n);

    actor.setIdentity(userAlice);
    const after = await actor.createCoupon({ maxRedemptions: [], expiresAt: [], note: [] });
    const afterCoupon = ("ok" in after ? after.ok : undefined)!;
    expect(afterCoupon.discountBps).toBe(2500n);

    // The redeemed discount snapshots from the coupon, not the live config.
    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(beforeCoupon.code)).toEqual({ ok: null });
    expect((await actor.getMyDiscountState())[0]?.discountBps).toBe(1000n);
  });
});
