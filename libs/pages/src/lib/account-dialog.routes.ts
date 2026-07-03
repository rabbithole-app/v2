import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type Provider,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type Routes } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';

import {
  ProUpgradeFlowComponent,
  SubscriptionService,
  SubscriptionSettingsFormComponent,
  UserSettingsDialogComponent,
  type UserSettingsDialogResult,
  UserSettingsDialogResultService,
  UserSettingsDialogService,
  type UserSettingsProUpgradeSource,
} from '@rabbithole/core/account-settings';
import {
  BalanceService,
  injectWalletBalanceContext,
  type TokenBalance,
  WALLET_WITHDRAW_LAUNCHER_TOKEN,
  WalletNetworksViewComponent,
  WalletSummaryHeaderComponent,
  type WalletWithdrawLauncher,
  WalletWithdrawPanelComponent,
} from '@rabbithole/core/wallet';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmSwitch } from '@spartan-ng/helm/switch';

const PRO_UPGRADE_SOURCES = [
  'encrypt',
  'expired-subscription',
  'external-storage',
  'file-size-limit',
  'managed-funding',
  'pricing',
  'share',
  'storage-limit',
  'subscription',
] as const satisfies readonly UserSettingsProUpgradeSource[];

@Component({
  selector: 'rbth-page-user-settings-route',
  template: `<div class="min-h-44"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UserSettingsRouteComponent {}

@Component({
  selector: 'rbth-page-user-settings-subscription-route',
  imports: [SubscriptionSettingsFormComponent],
  template: `
    <rbth-core-subscription-settings-form
      (activatePro)="openSubscriptionUpgrade()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UserSettingsSubscriptionRouteComponent {
  readonly #settingsDialogService = inject(UserSettingsDialogService);
  readonly #subscriptionService = inject(SubscriptionService);

  openSubscriptionUpgrade(): void {
    const source = this.#subscriptionService.isExpired()
      ? 'expired-subscription'
      : 'subscription';

    void this.#settingsDialogService.navigateTo([
      'subscription',
      'upgrade',
      source,
    ]);
  }
}

@Component({
  selector: 'rbth-page-user-settings-subscription-upgrade-route',
  imports: [ProUpgradeFlowComponent],
  template: `
    <rbth-core-pro-upgrade-flow
      [source]="source()"
      (cancelled)="handleCancelled()"
      (completed)="handleCompleted($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UserSettingsSubscriptionUpgradeRouteComponent {
  readonly #route = inject(ActivatedRoute);
  readonly source = signal<UserSettingsProUpgradeSource>(
    upgradeSourceFromParam(this.#route.snapshot.paramMap.get('source')),
  );
  readonly #settingsDialogResults = inject(UserSettingsDialogResultService);
  readonly #settingsDialogService = inject(UserSettingsDialogService);

  constructor() {
    this.#route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.source.set(upgradeSourceFromParam(params.get('source')));
    });
  }

  handleCancelled(): void {
    this.#settingsDialogResults.completeUpgrade(false);
    void this.#settingsDialogService.navigateTo(['subscription']);
  }

  handleCompleted(result: UserSettingsDialogResult): void {
    this.#settingsDialogResults.completeUpgrade(result.upgraded === true);
    void this.#settingsDialogService.close();
  }
}

@Component({
  selector: 'rbth-page-user-settings-wallet-route',
  imports: [
    HlmSwitch,
    WalletNetworksViewComponent,
    WalletSummaryHeaderComponent,
  ],
  providers: [provideWalletWithdrawRouteLauncher()],
  template: `
    <div class="space-y-5">
      <div
        class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <rbth-core-wallet-summary-header size="md" />

        <label
          for="user-settings-hide-zero-balances"
          class="flex items-center gap-3 text-sm"
        >
          <span class="text-muted-foreground">Hide zero balances</span>
          <hlm-switch
            id="user-settings-hide-zero-balances"
            [checked]="hideZeroBalances()"
            (checkedChange)="toggleHideZeroBalances($event)"
          />
        </label>
      </div>

      <rbth-core-wallet-networks-view
        [hideZeroBalances]="hideZeroBalances()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UserSettingsWalletRouteComponent {
  readonly #balanceService = inject(BalanceService);
  readonly hideZeroBalances = this.#balanceService.hideZero;

  toggleHideZeroBalances(checked: boolean): void {
    this.#balanceService.hideZero.set(checked);
  }
}

@Component({
  selector: 'rbth-page-user-settings-wallet-withdraw-route',
  imports: [
    HlmSpinner,
    NgIcon,
    WalletWithdrawPanelComponent,
    ...HlmAlertImports,
  ],
  providers: [provideIcons({ lucideTriangleAlert })],
  template: `
    @if (error()) {
      <hlm-alert variant="destructive">
        <ng-icon hlmAlertIcon name="lucideTriangleAlert" />
        <h4 hlmAlertTitle>Wallet balances could not be loaded</h4>
      </hlm-alert>
    } @else if (selectedToken(); as token) {
      <rbth-core-wallet-withdraw-panel
        [token]="token"
        [tokens]="tokens()"
        (cancelled)="backToWallet()"
        (completed)="handleCompleted()"
        (tokenChange)="handleTokenChange($event)"
      />
    } @else if (isLoading()) {
      <div class="flex min-h-48 items-center justify-center">
        <hlm-spinner class="text-2xl" />
      </div>
    } @else {
      <hlm-alert variant="destructive">
        <ng-icon hlmAlertIcon name="lucideTriangleAlert" />
        <h4 hlmAlertTitle>Withdrawal asset is not available</h4>
      </hlm-alert>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UserSettingsWalletWithdrawRouteComponent {
  readonly #walletContext = injectWalletBalanceContext();
  readonly error = this.#walletContext.error;
  readonly isLoading = this.#walletContext.isLoading;
  readonly #route = inject(ActivatedRoute);
  readonly tokenId = signal(this.#route.snapshot.paramMap.get('tokenId') ?? '');
  readonly tokens = this.#walletContext.balances;
  readonly selectedToken = computed(() =>
    this.tokens().find((token) => tokenRouteId(token) === this.tokenId()),
  );
  readonly #settingsDialogService = inject(UserSettingsDialogService);

  constructor() {
    this.#route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.tokenId.set(params.get('tokenId') ?? '');
    });
  }

  backToWallet(): void {
    void this.#settingsDialogService.navigateTo(['wallet']);
  }

  handleCompleted(): void {
    this.#walletContext.reload();
  }

  handleTokenChange(token: TokenBalance): void {
    const nextTokenId = tokenRouteId(token);
    if (nextTokenId === this.tokenId()) return;

    void this.#settingsDialogService.navigateTo(
      ['wallet', 'withdraw', nextTokenId],
      { replaceUrl: true },
    );
  }
}

export const userSettingsDialogRoutes: Routes = [
  {
    path: '',
    component: UserSettingsDialogComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'settings',
      },
      {
        path: 'settings',
        component: UserSettingsRouteComponent,
        data: {
          section: 'settings',
          title: 'Settings',
        },
      },
      {
        path: 'subscription',
        component: UserSettingsSubscriptionRouteComponent,
        data: {
          section: 'subscription',
          title: 'Subscription',
        },
      },
      {
        path: 'subscription/upgrade/:source',
        component: UserSettingsSubscriptionUpgradeRouteComponent,
        data: {
          backCommands: ['subscription'],
          backLabel: 'Back to subscription settings',
          section: 'subscription',
          title: 'Activate Pro',
          upgradeFlow: true,
        },
      },
      {
        path: 'wallet',
        component: UserSettingsWalletRouteComponent,
        data: {
          section: 'wallet',
          title: 'Wallet',
          walletRefresh: true,
        },
      },
      {
        path: 'wallet/withdraw/:tokenId',
        component: UserSettingsWalletWithdrawRouteComponent,
        data: {
          backCommands: ['wallet'],
          backLabel: 'Back to wallet',
          section: 'wallet',
          title: 'Withdraw',
          walletRefresh: true,
        },
      },
    ],
  },
];

function provideWalletWithdrawRouteLauncher(): Provider {
  return {
    provide: WALLET_WITHDRAW_LAUNCHER_TOKEN,
    useFactory: (): WalletWithdrawLauncher => {
      const settingsDialogService = inject(UserSettingsDialogService);

      return {
        open(params): void {
          void settingsDialogService.navigateTo([
            'wallet',
            'withdraw',
            tokenRouteId(params.token),
          ]);
        },
      };
    },
  };
}

function tokenRouteId(token: TokenBalance): string {
  return Object.keys(token.tokenId)[0] ?? '';
}

function upgradeSourceFromParam(
  value: string | null,
): UserSettingsProUpgradeSource {
  return PRO_UPGRADE_SOURCES.includes(value as UserSettingsProUpgradeSource)
    ? (value as UserSettingsProUpgradeSource)
    : 'subscription';
}
