import { fromNullable } from '@dfinity/utils';

import type { DistributionRecord } from '@rabbithole/declarations/backend';

import { formatTokenById, tokenKey, tokenUsdValue } from './token-format';

export interface EarningByToken {
  formatted: string;
  key: string;
}

/** USD value of L1 earnings grouped by payer principal (text). */
export function earningsUsdByPayer(
  records: DistributionRecord[],
  rates: Record<string, number>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of records) {
    const payer = record.payer.toText();
    const value = tokenUsdValue(tokenKey(record.tokenId), record.l1Amount, rates);
    totals.set(payer, (totals.get(payer) ?? 0) + value);
  }
  return totals;
}

/**
 * Completed distributions where the given principal (text) is the L1
 * ambassador. Partial distributions (the L1 transfer failed) are excluded so
 * unpaid amounts never show up as earnings.
 */
export function filterMyL1Distributions(
  records: DistributionRecord[],
  myPrincipalText: string,
): DistributionRecord[] {
  return records.filter(
    (record) =>
      'completed' in record.status &&
      fromNullable(record.ambassadorL1)?.toText() === myPrincipalText,
  );
}

/** Sums L1 earnings per token, dropping zero totals. */
export function sumEarningsByToken(
  records: DistributionRecord[],
): EarningByToken[] {
  const totals = new Map<string, bigint>();
  for (const record of records) {
    const key = tokenKey(record.tokenId);
    totals.set(key, (totals.get(key) ?? 0n) + record.l1Amount);
  }
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0n)
    .map(([key, amount]) => ({ key, formatted: formatTokenById(key, amount) }));
}

/** Total USD value of L1 earnings at current rates. */
export function sumEarningsUsd(
  records: DistributionRecord[],
  rates: Record<string, number>,
): number {
  let total = 0;
  for (const record of records) {
    total += tokenUsdValue(tokenKey(record.tokenId), record.l1Amount, rates);
  }
  return total;
}

/** Unique payer principals (text) across the given distributions. */
export function uniquePayerIds(records: DistributionRecord[]): Set<string> {
  return new Set(records.map((record) => record.payer.toText()));
}
