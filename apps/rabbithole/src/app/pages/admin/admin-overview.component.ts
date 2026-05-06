import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  resource,
} from '@angular/core';
import { HttpAgent } from '@icp-sdk/core/agent';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideDatabase,
  lucideRefreshCw,
  lucideWalletCards,
} from '@ng-icons/lucide';

import {
  formatTCycles,
  formatUsd,
  HTTP_AGENT_OPTIONS_TOKEN,
  injectMainActor,
  MAIN_CANISTER_ID_TOKEN,
  MULTI_CHAIN_RPC_CONFIG_TOKEN,
} from '@rabbithole/core';
import {
  fetchTokenBalancesForWallet,
  fetchTokenRates,
  type TokenBalance,
  WALLET_BALANCE_CONTEXT,
  type WalletBalanceContext,
  WalletNetworksViewComponent,
} from '@rabbithole/core/wallet';
import {
  RbthFrameComponent,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

@Component({
  selector: 'app-admin-overview',
  imports: [
    NgIcon,
    HlmIcon,
    HlmSpinner,
    RbthFrameComponent,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    WalletNetworksViewComponent,
    ...HlmButtonImports,
  ],
  providers: [
    provideIcons({ lucideDatabase, lucideRefreshCw, lucideWalletCards }),
    {
      provide: WALLET_BALANCE_CONTEXT,
      useExisting: forwardRef(() => AdminOverviewComponent),
    },
  ],
  templateUrl: './admin-overview.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOverviewComponent implements WalletBalanceContext {
  protected readonly _tokenRates = resource({
    loader: fetchTokenRates,
    defaultValue: { ETH: 0, ICP: 0, SOL: 0 },
  });
  readonly #actor = injectMainActor();
  protected readonly _treasuryWallet = resource({
    params: () => this.#actor(),
    loader: async ({ params }) => params.getTreasuryWalletAddresses(),
  });
  readonly #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #ledgerAgent = HttpAgent.create(inject(HTTP_AGENT_OPTIONS_TOKEN));

  readonly #rpcConfig = inject(MULTI_CHAIN_RPC_CONFIG_TOKEN);

  protected readonly _treasuryBalances = resource({
    params: () => ({
      rates: this._tokenRates.value(),
      wallet: this._treasuryWallet.value(),
    }),
    loader: async ({ params: { rates, wallet } }) => {
      if (!wallet) return [];

      const ledgerAgent = await this.#ledgerAgent;
      return fetchTokenBalancesForWallet({
        ledgerAgent,
        ownerPrincipal: this.#backendCanisterId,
        rates,
        rpcConfig: this.#rpcConfig,
        wallet,
      });
    },
    defaultValue: [] as TokenBalance[],
  });

  readonly balances = computed(() => this._treasuryBalances.value());
  protected readonly _treasuryWalletError = computed(
    () =>
      this._treasuryWallet.error() ??
      this._treasuryBalances.error() ??
      this._tokenRates.error() ??
      null,
  );

  readonly error = this._treasuryWalletError;
  readonly hideZero = computed(() => false);
  protected readonly _treasuryWalletLoading = computed(
    () =>
      this._treasuryWallet.isLoading() ||
      this._treasuryBalances.isLoading() ||
      this._tokenRates.isLoading(),
  );
  readonly isLoading = this._treasuryWalletLoading;
  protected readonly _treasuryTotalUsd = computed(() =>
    this._treasuryBalances
      .value()
      .reduce((sum, balance) => sum + balance.usdValue, 0),
  );
  readonly totalUsd = this._treasuryTotalUsd;
  protected readonly _treasuryWalletAddresses = computed(
    () => this._treasuryWallet.value() ?? null,
  );
  readonly walletAddresses = this._treasuryWalletAddresses;
  protected readonly _backendCyclesBalance = resource({
    params: () => this.#actor(),
    loader: async ({ params }) => params.getBackendCyclesBalance(),
    defaultValue: 0n,
  });
  protected readonly _treasuryTotalUsdLabel = computed(() =>
    formatUsd(this._treasuryTotalUsd()),
  );

  reload(): void {
    this._backendCyclesBalance.reload();
    this._tokenRates.reload();
    this._treasuryBalances.reload();
    this._treasuryWallet.reload();
  }

  protected _formatCycles(value: bigint): string {
    return `${formatTCycles(value)} TCycles`;
  }

}
