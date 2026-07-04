import { match, P } from 'ts-pattern';

import type { ApplyReferralCodeResult } from '@rabbithole/declarations/backend';

const BPS_DENOMINATOR = 10_000;

export type ApplyReferralCodeError = Exclude<ApplyReferralCodeResult, { ok: null }>;

/** Applies a basis-point discount to a USD price. */
export function applyDiscountUsd(priceUsd: number, discountBps: bigint): number {
  return priceUsd * (1 - Number(discountBps) / BPS_DENOMINATOR);
}

/**
 * Maps a failed `applyReferralCode` result to a human-readable message.
 * `alreadyApplied` means the account is already linked to a *different*
 * ambassador — the code was rejected, so it is surfaced as an error. Only
 * `discountAlreadyApplied` is benign (see `isBenignReferralError`).
 */
export function applyReferralCodeErrorMessage(
  err: ApplyReferralCodeError,
): string {
  return match(err)
    .with({ referralCodeNotFound: P.any }, () => 'This code was not found.')
    .with({ couponExpired: P.any }, () => 'This code has expired.')
    .with({ couponExhausted: P.any }, () => 'This code has reached its redemption limit.')
    .with({ couponRevoked: P.any }, () => 'This code is no longer active.')
    .with({ selfReferral: P.any }, () => 'You cannot use your own referral code.')
    .with(
      { alreadyApplied: P.any },
      () =>
        'This code belongs to a different ambassador — your account is already linked to one.',
    )
    .with({ discountAlreadyApplied: P.any }, () => 'You already have a discount active.')
    .with({ userNotFound: P.any }, () => 'Your account was not found.')
    .with({ storageError: P.select() }, (msg) => `Something went wrong: ${msg}`)
    .exhaustive();
}

/** Formats basis points as a percentage label (e.g. 1000n → "10%"). */
export function formatDiscountPercent(discountBps: bigint): string {
  return `${Number(discountBps) / 100}%`;
}

/**
 * `discountAlreadyApplied` is not a real failure — the user simply already has
 * a discount. Callers show it as an informational message rather than an error.
 */
export function isBenignReferralError(err: ApplyReferralCodeError): boolean {
  return 'discountAlreadyApplied' in err;
}
