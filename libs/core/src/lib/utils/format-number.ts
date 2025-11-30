export const formatNumber = (
  value: number,
  options?: { minFraction?: number; maxFraction?: number } & Pick<
    Intl.NumberFormatOptions,
    'notation' | 'unit' | 'style' | 'unitDisplay'
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
