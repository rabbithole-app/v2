import { describe, expect, it } from 'vitest';

import {
  formatTokenAmount,
  formatTokenAmountInput,
  normalizeTokenAmountInput,
  parseTokenAmountToBaseUnits,
} from './format-number';

describe('token amount formatting', () => {
  it('formats token base units through the shared number formatter', () => {
    expect(formatTokenAmount(123456789n, 8)).toBe('1.234568');
    expect(formatTokenAmount(100000000n, 8)).toBe('1');
    expect(formatTokenAmount(1230000n, 6)).toBe('1.23');
  });

  it('formats exact token amounts for form input values', () => {
    expect(formatTokenAmountInput(123456789n, 8)).toBe('1.23456789');
    expect(formatTokenAmountInput(100000000n, 8)).toBe('1');
    expect(formatTokenAmountInput(1230000n, 6)).toBe('1.23');
  });

  it('normalizes amount input drafts without parsing them', () => {
    expect(normalizeTokenAmountInput('1,25')).toBe('1.25');
    expect(normalizeTokenAmountInput('abc1.2.3')).toBe('1.23');
  });

  it('converts decimal strings to token base units', () => {
    expect(parseTokenAmountToBaseUnits('1.25', 6)).toBe(1250000n);
    expect(parseTokenAmountToBaseUnits('.5', 8)).toBe(50000000n);
    expect(parseTokenAmountToBaseUnits('1.', 8)).toBe(100000000n);
  });

  it('rejects invalid or over-precise token amounts', () => {
    expect(parseTokenAmountToBaseUnits('', 6)).toBeNull();
    expect(parseTokenAmountToBaseUnits('abc', 6)).toBeNull();
    expect(parseTokenAmountToBaseUnits('0.0000001', 6)).toBeNull();
  });
});
