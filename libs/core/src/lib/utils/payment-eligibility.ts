import type { TokenBalance } from '../services/balance.service';
import { formatUsd } from './format-number';

export type PaymentEligibilityStatus = 'sufficient' | 'no-single-asset' | 'insufficient';

export interface PaymentEligibility {
  status: PaymentEligibilityStatus;
  hint: string;
}

export const calculatePaymentEligibility = (
  balances: readonly TokenBalance[],
  requiredUsd: number,
): PaymentEligibility => {
  const totalUsd = balances.reduce((sum, b) => sum + b.usdValue, 0);
  const hasSufficientToken = balances.some((b) => b.usdValue >= requiredUsd);

  if (hasSufficientToken) {
    return {
      status: 'sufficient',
      hint: 'Sufficient balance — payment available.',
    };
  }

  if (totalUsd >= requiredUsd) {
    return {
      status: 'no-single-asset',
      hint: `${formatUsd(totalUsd)} total, but no single asset covers ${formatUsd(requiredUsd)}. Top up one token to pay from balance.`,
    };
  }

  const shortfall = requiredUsd - totalUsd;
  return {
    status: 'insufficient',
    hint: `${formatUsd(totalUsd)} available. Top up ${formatUsd(shortfall)} to pay from balance.`,
  };
};
