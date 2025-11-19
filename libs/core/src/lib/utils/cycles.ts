import { ONE_TRILLION } from '../constants';
import { formatNumber } from './format-number';

export const formatTCycles = (cycles: bigint): string =>
  formatNumber(Number(cycles) / Number(ONE_TRILLION), {
    minFraction: 3,
    maxFraction: 3,
  });

export const cyclesToICP = (cycles: bigint): number =>
  Number(cycles) / Number(ONE_TRILLION);
