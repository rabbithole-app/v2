import { describe, expect, it } from 'vitest';

import type { Coupon } from '@rabbithole/declarations/backend';

import { computeCouponStatus } from './coupon-status';

const NOW_MS = 1_700_000_000_000;
const NOW_NS = BigInt(NOW_MS) * 1_000_000n;

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    code: 'ABC123',
    owner: undefined as never,
    ownerText: 'owner',
    discountBps: 1000n,
    maxRedemptions: [],
    redeemedCount: 0n,
    expiresAt: [],
    revoked: false,
    createdAt: 0n,
    ...overrides,
  };
}

describe('computeCouponStatus', () => {
  it('returns active for an open, unexpired coupon', () => {
    expect(computeCouponStatus(makeCoupon(), NOW_MS)).toBe('active');
  });

  it('returns revoked regardless of other fields', () => {
    const coupon = makeCoupon({
      revoked: true,
      maxRedemptions: [1n],
      redeemedCount: 1n,
    });
    expect(computeCouponStatus(coupon, NOW_MS)).toBe('revoked');
  });

  it('returns expired when the expiry is in the past', () => {
    const coupon = makeCoupon({ expiresAt: [NOW_NS - 1_000_000n] });
    expect(computeCouponStatus(coupon, NOW_MS)).toBe('expired');
  });

  it('treats a future expiry as active', () => {
    const coupon = makeCoupon({ expiresAt: [NOW_NS + 1_000_000_000n] });
    expect(computeCouponStatus(coupon, NOW_MS)).toBe('active');
  });

  it('returns exhausted when redemptions reach the max', () => {
    const coupon = makeCoupon({ maxRedemptions: [2n], redeemedCount: 2n });
    expect(computeCouponStatus(coupon, NOW_MS)).toBe('exhausted');
  });

  it('keeps unlimited coupons active regardless of redeemed count', () => {
    const coupon = makeCoupon({ maxRedemptions: [], redeemedCount: 999n });
    expect(computeCouponStatus(coupon, NOW_MS)).toBe('active');
  });

  it('prioritizes expiry over exhaustion', () => {
    const coupon = makeCoupon({
      expiresAt: [NOW_NS - 1n],
      maxRedemptions: [1n],
      redeemedCount: 1n,
    });
    expect(computeCouponStatus(coupon, NOW_MS)).toBe('expired');
  });
});
