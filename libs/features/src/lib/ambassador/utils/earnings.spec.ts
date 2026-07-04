import { describe, expect, it } from 'vitest';

import type { DistributionRecord } from '@rabbithole/declarations/backend';

import {
  filterMyL1Distributions,
  sumEarningsByToken,
  uniquePayerIds,
} from './earnings';

const ME = 'me-principal';
const OTHER = 'other-principal';

function distribution(
  overrides: Partial<DistributionRecord> = {},
): DistributionRecord {
  return {
    id: 0n,
    status: { completed: null },
    tokenId: { ICP: null },
    l1Amount: 0n,
    transfers: [],
    l2Amount: 0n,
    ambassadorL1: [principal(ME)],
    ambassadorL2: [],
    totalAmount: 0n,
    paymentId: 'p',
    timestamp: 0n,
    payer: principal(OTHER),
    treasuryAmount: 0n,
    ...overrides,
  };
}

function principal(text: string) {
  return { toText: () => text } as never;
}

describe('filterMyL1Distributions', () => {
  it('keeps only records where I am the L1 ambassador', () => {
    const records = [
      distribution({ ambassadorL1: [principal(ME)] }),
      distribution({ ambassadorL1: [principal(OTHER)] }),
      distribution({ ambassadorL1: [] }),
    ];
    expect(filterMyL1Distributions(records, ME)).toHaveLength(1);
  });

  it('excludes partial distributions where the L1 transfer failed', () => {
    const records = [
      distribution({ ambassadorL1: [principal(ME)], status: { completed: null } }),
      distribution({ ambassadorL1: [principal(ME)], status: { partial: null } }),
    ];
    expect(filterMyL1Distributions(records, ME)).toHaveLength(1);
  });
});

describe('sumEarningsByToken', () => {
  it('groups and sums l1Amount per token, dropping zero totals', () => {
    const records = [
      distribution({ tokenId: { ICP: null }, l1Amount: 100_000_000n }),
      distribution({ tokenId: { ICP: null }, l1Amount: 50_000_000n }),
      distribution({ tokenId: { SOL: null }, l1Amount: 1_000_000_000n }),
      distribution({ tokenId: { ckUSDC: null }, l1Amount: 0n }),
    ];

    const result = sumEarningsByToken(records);

    expect(result).toContainEqual({ key: 'ICP', formatted: '1.5 ICP' });
    expect(result).toContainEqual({ key: 'SOL', formatted: '1 SOL' });
    expect(result.some((e) => e.key === 'ckUSDC')).toBe(false);
  });

  it('returns an empty list when there are no records', () => {
    expect(sumEarningsByToken([])).toEqual([]);
  });
});

describe('uniquePayerIds', () => {
  it('collects distinct payer principals', () => {
    const records = [
      distribution({ payer: principal('a') }),
      distribution({ payer: principal('a') }),
      distribution({ payer: principal('b') }),
    ];
    expect(uniquePayerIds(records)).toEqual(new Set(['a', 'b']));
  });
});
