import { inject, InjectionToken, Signal } from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';

import {
  BalanceService,
  type TokenBalance,
  type WalletAddresses,
} from '../../../services/balance.service';

export interface WalletBalanceContext {
  readonly balances: Signal<TokenBalance[]>;
  readonly error: Signal<unknown | null>;
  readonly hideZero: Signal<boolean>;
  readonly isLoading: Signal<boolean>;
  readonly principal?: Signal<Principal | null>;
  reload(): void;
  readonly totalUsd: Signal<number>;
  readonly walletAddresses: Signal<WalletAddresses | null>;
}

export const WALLET_BALANCE_CONTEXT = new InjectionToken<WalletBalanceContext>(
  'WALLET_BALANCE_CONTEXT',
);

export function injectWalletBalanceContext(): WalletBalanceContext {
  const context = inject(WALLET_BALANCE_CONTEXT, { optional: true });
  if (context) return context;

  const balanceService = inject(BalanceService);
  return {
    balances: balanceService.balances,
    error: balanceService.error,
    hideZero: balanceService.hideZero,
    isLoading: balanceService.isLoading,
    principal: balanceService.userPrincipal,
    reload: () => balanceService.reload(),
    totalUsd: balanceService.totalUsd,
    walletAddresses: balanceService.walletAddresses,
  };
}
