export const formatNumber = (
  value: number,
  options?: { maxFraction: number; minFraction: number },
): string => {
  const { minFraction = 2, maxFraction = 2 } = options || {};

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minFraction,
    maximumFractionDigits: maxFraction,
  })
    .format(value)
    .replace(/\s/g, '’')
    .replace(',', '.');
};
