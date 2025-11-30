import { E8S_PER_ICP } from '../constants';
import { formatNumber, formatUsd } from './format-number';

/**
 * Formats an ICP value (in e8s) to a human-readable string with 4 decimal places.
 *
 * @param {bigint} icp - The value of ICP in e8s (1 ICP = 10^8 e8s).
 * @returns {string} - The formatted ICP value as a string with 4 decimal places.
 */
export const formatICP = (icp: bigint): string =>
  formatNumber(Number(icp) / Number(E8S_PER_ICP), {
    minFraction: 4,
    maxFraction: 8,
  });

/**
 * Converts an ICP value (in e8s) to USD using a given exchange rate and formats it as a USD string.
 *
 * @param {Object} params - The parameters for conversion.
 * @param {bigint} params.icp - The value of ICP in e8s (1 ICP = 10^8 e8s).
 * @param {number} params.icpToUsd - The exchange rate of 1 ICP to USD.
 * @returns {string} - The formatted USD value as a string.
 */
export const formatICPToUsd = ({
  icp,
  icpToUsd,
}: {
  icp: bigint;
  icpToUsd: number;
}): string => formatUsd((Number(icp) * icpToUsd) / Number(E8S_PER_ICP));
