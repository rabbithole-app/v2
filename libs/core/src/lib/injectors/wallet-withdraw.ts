import type { Provider } from '@angular/core';
import {
  createInjectionToken,
  createNoopInjectionToken,
} from 'ngxtension/create-injection-token';

import type {
  WithdrawDestination,
  WithdrawReceipt,
} from '@rabbithole/declarations/backend';

import {
  type TokenBalance,
  withdrawTreasuryBalance,
  withdrawWalletBalance,
} from '../services/balance.service';
import type { ExtractInjectionToken } from '../types';
import { MAIN_ACTOR_TOKEN } from './main-actor';

export type WalletWithdrawDialogLauncher = WalletWithdrawLauncher;

export type WalletWithdrawDialogLaunchParams = WalletWithdrawLaunchParams;

export type WalletWithdrawExecutor = (
  request: WalletWithdrawRequest,
) => Promise<WithdrawReceipt>;

export interface WalletWithdrawLauncher {
  open(params: WalletWithdrawLaunchParams): void;
}

export interface WalletWithdrawLaunchParams {
  completed?: () => void;
  refresh?: () => void;
  token: TokenBalance;
  tokens: readonly TokenBalance[];
}
export interface WalletWithdrawRequest {
  amount: bigint;
  destination: WithdrawDestination;
  token: TokenBalance;
}

export const [injectWalletWithdraw, , WALLET_WITHDRAW_TOKEN] =
  createInjectionToken(
    (
      mainActor: ExtractInjectionToken<typeof MAIN_ACTOR_TOKEN>,
    ): WalletWithdrawExecutor =>
      ({ amount, destination, token }) =>
        withdrawWalletBalance({
          amount,
          backendActor: mainActor(),
          destination,
          token,
        }),
    {
      deps: [MAIN_ACTOR_TOKEN],
    },
  );

export const [
  injectWalletWithdrawLauncher,
  ,
  WALLET_WITHDRAW_LAUNCHER_TOKEN,
] = createNoopInjectionToken<WalletWithdrawLauncher>(
  'WALLET_WITHDRAW_LAUNCHER_TOKEN',
);

export const injectWalletWithdrawDialogLauncher = injectWalletWithdrawLauncher;
export const WALLET_WITHDRAW_DIALOG_LAUNCHER_TOKEN =
  WALLET_WITHDRAW_LAUNCHER_TOKEN;

export function provideTreasuryWalletWithdraw(): Provider {
  return {
    provide: WALLET_WITHDRAW_TOKEN,
    useFactory:
      (
        mainActor: ExtractInjectionToken<typeof MAIN_ACTOR_TOKEN>,
      ): WalletWithdrawExecutor =>
      ({ amount, destination, token }) =>
        withdrawTreasuryBalance({
          amount,
          backendActor: mainActor(),
          destination,
          token,
        }),
    deps: [MAIN_ACTOR_TOKEN],
  };
}
