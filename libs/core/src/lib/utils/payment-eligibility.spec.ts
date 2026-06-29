import { describe, expect, it } from 'vitest';

import type { TokenBalance } from '../services/balance.service';
import { calculatePaymentEligibility } from './payment-eligibility';

const token = (label: string, usdValue: number): TokenBalance => ({
  balance: 0n,
  chain: 'ic',
  decimals: 6,
  label,
  showUsdValue: false,
  tokenId: { ckUSDC: null },
  usdValue,
});

describe('calculatePaymentEligibility', () => {
  it('returns sufficient when at least one token covers the required amount', () => {
    const result = calculatePaymentEligibility(
      [token('ckUSDC', 5.0), token('USDC', 1.0)],
      4.9,
    );

    expect(result.status).toBe('sufficient');
    expect(result.hint).toMatch(/sufficient/i);
  });

  it('returns sufficient at exact match', () => {
    const result = calculatePaymentEligibility([token('ckUSDC', 4.9)], 4.9);
    expect(result.status).toBe('sufficient');
  });

  it('returns no-single-asset when total covers required but no single token does', () => {
    const result = calculatePaymentEligibility(
      [token('USDT', 3.0), token('USDC', 2.0)],
      4.9,
    );

    expect(result.status).toBe('no-single-asset');
    expect(result.hint).toContain('no single asset');
  });

  it('returns insufficient when total is below required', () => {
    const result = calculatePaymentEligibility(
      [token('USDT', 1.0), token('USDC', 1.5)],
      4.9,
    );

    expect(result.status).toBe('insufficient');
    expect(result.hint).toMatch(/top up/i);
  });

  it('returns insufficient for empty balances', () => {
    const result = calculatePaymentEligibility([], 4.9);
    expect(result.status).toBe('insufficient');
  });
});
