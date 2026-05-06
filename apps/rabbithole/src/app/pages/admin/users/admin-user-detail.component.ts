import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpAgent } from '@icp-sdk/core/agent';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideDatabase,
  lucideReceipt,
  lucideRefreshCw,
  lucideShield,
  lucideWallet,
} from '@ng-icons/lucide';

import {
  formatICP,
  formatTCycles,
  formatUsd,
  HTTP_AGENT_OPTIONS_TOKEN,
  injectMainActor,
  MAIN_CANISTER_ID_TOKEN,
  MULTI_CHAIN_RPC_CONFIG_TOKEN,
  timeInNanosToDate,
} from '@rabbithole/core';
import {
  fetchTokenBalancesForWallet,
  fetchTokenRates,
  TokenBalance,
  WALLET_BALANCE_CONTEXT,
  type WalletBalanceContext,
  WalletNetworksViewComponent,
  WalletSummaryHeaderComponent,
} from '@rabbithole/core/wallet';
import {
  License,
  Plan,
  RabbitholeActorService,
  Subscription,
  TokenId,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import {
  RbthFrameComponent,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTypographyImports } from '@spartan-ng/helm/typography';

import { AdminUserDetailResolverData } from './admin-user-detail.resolver';
import { AdminUserHeaderComponent } from './admin-user-header.component';
import { AdminUserOverviewComponent } from './admin-user-overview.component';

type AdminUserDetailTab = 'creations' | 'licenses' | 'overview' | 'wallet';
type AdminUserWalletMeta = Awaited<
  ReturnType<RabbitholeActorService['adminGetUserWalletMeta']>
>;
type BadgeVariant = 'default' | 'destructive' | 'outline' | 'secondary';

@Component({
  selector: 'app-admin-user-detail',
  imports: [
    AdminUserHeaderComponent,
    AdminUserOverviewComponent,
    CopyToClipboardComponent,
    DatePipe,
    HlmBadge,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    RouterLink,
    RbthFrameComponent,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    WalletNetworksViewComponent,
    WalletSummaryHeaderComponent,
    ...HlmButtonImports,
    ...HlmCardImports,
    ...HlmTableImports,
    ...HlmTabsImports,
    ...HlmTypographyImports,
  ],
  providers: [
    provideIcons({
      lucideDatabase,
      lucideReceipt,
      lucideRefreshCw,
      lucideShield,
      lucideWallet,
    }),
    {
      provide: WALLET_BALANCE_CONTEXT,
      useExisting: forwardRef(() => AdminUserDetailComponent),
    },
  ],
  templateUrl: './admin-user-detail.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserDetailComponent implements WalletBalanceContext {
  readonly userDetail = input.required<AdminUserDetailResolverData>();

  readonly #actor = injectMainActor();
  protected readonly _walletMeta = resource({
    params: () => ({
      actor: this.#actor(),
      principal: this.userDetail().principal,
    }),
    loader: async ({ params }): Promise<AdminUserWalletMeta | null> => {
      return params.actor.adminGetUserWalletMeta(params.principal);
    },
    defaultValue: null,
  });
  protected readonly _walletReload = signal(0);
  readonly #ledgerAgent = HttpAgent.create(inject(HTTP_AGENT_OPTIONS_TOKEN));
  readonly #mainCanisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #rpcConfig = inject(MULTI_CHAIN_RPC_CONFIG_TOKEN);
  protected readonly _walletBalances = resource({
    params: () => ({
      reload: this._walletReload(),
      wallet: this._walletMeta.value()?.walletAddresses ?? null,
    }),
    loader: async ({ params }): Promise<TokenBalance[]> => {
      if (!params.wallet) return [];

      const [ledgerAgent, rates] = await Promise.all([
        this.#ledgerAgent,
        fetchTokenRates(),
      ]);

      return fetchTokenBalancesForWallet({
        ledgerAgent,
        ownerPrincipal: this.#mainCanisterId,
        rates,
        rpcConfig: this.#rpcConfig,
        wallet: params.wallet,
      });
    },
    defaultValue: [],
  });
  readonly balances = computed(() => this._walletBalances.value());
  protected readonly _walletContextError = computed(
    () => this._walletMeta.error() ?? this._walletBalances.error() ?? null,
  );
  readonly error = this._walletContextError;
  readonly hideZero = computed(() => false);
  protected readonly _walletContextLoading = computed(
    () => this._walletMeta.isLoading() || this._walletBalances.isLoading(),
  );
  readonly isLoading = this._walletContextLoading;
  protected readonly _walletTotalUsd = computed(() =>
    this._walletBalances
      .value()
      .reduce((sum, balance) => sum + balance.usdValue, 0),
  );
  readonly totalUsd = this._walletTotalUsd;
  protected readonly _walletContextWalletAddresses = computed(
    () => this._walletMeta.value()?.walletAddresses ?? null,
  );
  readonly walletAddresses = this._walletContextWalletAddresses;
  protected readonly _creations = computed(() => this.userDetail().creations);
  protected readonly _activeCreations = computed(
    () =>
      this._creations().filter(
        (creation) =>
          creation.statusTag !== 'Completed' && creation.statusTag !== 'Failed',
      ).length,
  );
  protected readonly _activeTab = signal<AdminUserDetailTab>('overview');
  protected readonly _failedCreations = computed(
    () =>
      this._creations().filter((creation) => creation.statusTag === 'Failed')
        .length,
  );
  protected readonly _licenses = computed(() => this.userDetail().licenses);
  protected readonly _refundedLicenses = computed(
    () =>
      this._licenses().filter((license) => license.statusTag === 'refunded')
        .length,
  );
  protected readonly _subscription = computed(
    () => this.userDetail().subscription,
  );
  protected readonly _unboundLicenses = computed(
    () => this._licenses().filter((license) => !license.canisterId[0]).length,
  );
  protected readonly _user = computed(() => this.userDetail().user);
  reload(): void {
    this._walletReload.update((value) => value + 1);
  }

  protected _badgeVariant(value: string): BadgeVariant {
    if (value === 'Failed' || value === 'failed' || value === 'refunded') {
      return 'destructive';
    }
    if (value === 'pending') return 'secondary';
    return 'outline';
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _formatAmount(license: License): string {
    const tokenId = license.receipt.tokenId;
    if ('ICP' in tokenId) return `${formatICP(license.receipt.amount)} ICP`;
    return `${license.receipt.amount.toString()} ${this._tokenLabel(tokenId)}`;
  }

  protected _formatCycles(value: bigint): string {
    return `${formatTCycles(value)} TCycles`;
  }

  protected _formatUsd(value: number): string {
    return formatUsd(value);
  }

  protected _planLabel(plan: Plan): string {
    if ('Pro' in plan) return 'Pro';
    if ('Trial' in plan) return 'Trial';
    return 'Free';
  }

  protected _retryWalletMeta(): void {
    this._walletMeta.reload();
  }

  protected _statusLabel(status: Subscription['status']): string {
    if ('Active' in status) return 'Active';
    if ('Expired' in status) return 'Expired';
    return 'Cancelled';
  }

  protected _subscriptionSummary(subscription: Subscription | null): string {
    if (!subscription) return 'No subscription';
    return `${this._planLabel(subscription.plan)} · ${this._statusLabel(subscription.status)}`;
  }

  protected _tokenLabel(tokenId: TokenId): string {
    if ('ICP' in tokenId) return 'ICP';
    if ('ckUSDC' in tokenId) return 'ckUSDC';
    if ('ckUSDT' in tokenId) return 'ckUSDT';
    if ('ckETH' in tokenId) return 'ckETH';
    if ('BaseETH' in tokenId) return 'Base ETH';
    if ('BaseUSDC' in tokenId) return 'Base USDC';
    if ('BaseUSDT' in tokenId) return 'Base USDT';
    if ('SOL' in tokenId) return 'SOL';
    if ('SolUSDC' in tokenId) return 'Solana USDC';
    return 'Solana USDT';
  }
}
