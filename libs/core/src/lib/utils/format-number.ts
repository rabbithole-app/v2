export const formatNumber = (
  value: number,
  options?: { maxFraction?: number; minFraction?: number } & Pick<
    Intl.NumberFormatOptions,
    'notation' | 'style' | 'unit' | 'unitDisplay'
  >,
): string => {
  const { minFraction = 2, maxFraction = 2, ...rest } = options ?? {};

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minFraction,
    maximumFractionDigits: maxFraction,
    ...rest,
  }).format(value);
};

export const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
  }).format(value);

export function formatTokenAmount(amount: bigint, decimals: number): string {
  const normalizedDecimals = Math.max(decimals, 0);
  const value = Number(amount) / 10 ** normalizedDecimals;

  return formatNumber(value, {
    minFraction: 0,
    maxFraction: Math.min(normalizedDecimals, 6),
  });
}

export function formatTokenAmountInput(
  amount: bigint,
  decimals: number,
): string {
  const normalizedDecimals = Math.max(decimals, 0);
  if (normalizedDecimals === 0) return amount.toString();

  const divisor = 10n ** BigInt(normalizedDecimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return whole.toString();

  const fractionText = fraction
    .toString()
    .padStart(normalizedDecimals, '0')
    .replace(/0+$/, '');

  return `${whole}.${fractionText}`;
}

export function isTokenAmountDraft(value: string): boolean {
  return /^(?:\d+|\d+[.,]\d*|[.,]\d*|)$/.test(value);
}

export function normalizeTokenAmountInput(value: string): string {
  const cleanedValue = value.replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const [whole = '', ...fractions] = cleanedValue.split('.');
  if (fractions.length === 0) return whole;

  return `${whole}.${fractions.join('')}`;
}

export function parseTokenAmountToBaseUnits(
  value: string,
  decimals: number,
): bigint | null {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d+\.\d*|\.\d+)$/.test(trimmed)) return null;

  const normalizedDecimals = Math.max(decimals, 0);
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > normalizedDecimals) return null;

  const wholeUnits = BigInt(whole || '0') * 10n ** BigInt(normalizedDecimals);
  const fractionUnits =
    fraction.length > 0 ? BigInt(fraction.padEnd(normalizedDecimals, '0')) : 0n;

  return wholeUnits + fractionUnits;
}
