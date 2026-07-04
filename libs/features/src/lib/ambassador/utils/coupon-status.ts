import { timeInNanosToDate } from '@rabbithole/core';
import type { Coupon } from '@rabbithole/declarations/backend';

export type CouponStatus = 'active' | 'exhausted' | 'expired' | 'revoked';

/**
 * Derives the display status of a coupon. `nowMs` is the current time in ms.
 * Precedence: revoked → expired → exhausted → active.
 */
export function computeCouponStatus(coupon: Coupon, nowMs: number): CouponStatus {
  if (coupon.revoked) return 'revoked';

  const expiresAt = coupon.expiresAt[0];
  if (expiresAt !== undefined && timeInNanosToDate(expiresAt).getTime() <= nowMs) {
    return 'expired';
  }

  const maxRedemptions = coupon.maxRedemptions[0];
  if (maxRedemptions !== undefined && coupon.redeemedCount >= maxRedemptions) {
    return 'exhausted';
  }

  return 'active';
}
