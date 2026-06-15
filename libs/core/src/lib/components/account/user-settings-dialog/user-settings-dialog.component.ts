import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCreditCard,
  lucideRefreshCw,
  lucideSettings,
  lucideWallet,
} from '@ng-icons/lucide';
import {
  BrnDialogRef,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';

import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';
import { HlmSwitch } from '@spartan-ng/helm/switch';

import { BalanceService } from '../../../services/balance.service';
import { SubscriptionService } from '../../../services/subscription.service';
import { ProUpgradeFlowComponent } from '../pro-upgrade-flow/pro-upgrade-flow.component';
import { SubscriptionSettingsFormComponent } from '../subscription-settings/subscription-settings-form.component';
import {
  WalletNetworksViewComponent,
  WalletSummaryHeaderComponent,
} from '../wallet';
import type {
  UserSettingsDialogContext,
  UserSettingsDialogResult,
  UserSettingsDialogSection,
  UserSettingsProUpgradeSource,
} from './user-settings-dialog.types';

type UserSettingsDialogView = UserSettingsDialogSection | 'subscriptionUpgrade';

@Component({
  selector: 'rbth-core-user-settings-dialog',
  imports: [
    HlmButton,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmIcon,
    HlmSwitch,
    ...HlmSidebarImports,
    NgIcon,
    ProUpgradeFlowComponent,
    SubscriptionSettingsFormComponent,
    WalletNetworksViewComponent,
    WalletSummaryHeaderComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCreditCard,
      lucideRefreshCw,
      lucideSettings,
      lucideWallet,
    }),
  ],
  templateUrl: './user-settings-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsDialogComponent {
  readonly #context = injectBrnDialogContext<UserSettingsDialogContext | undefined>();
  readonly activeView = signal<UserSettingsDialogView>(
    this.#context?.upgradeSource
      ? 'subscriptionUpgrade'
      : (this.#context?.section ?? 'settings'),
  );
  readonly activeSection = computed<UserSettingsDialogSection>(() => {
    const view = this.activeView();
    return view === 'subscriptionUpgrade' ? 'subscription' : view;
  });
  readonly #balanceService = inject(BalanceService);
  readonly hideZeroBalances = this.#balanceService.hideZero;
  readonly title = computed(() => {
    const view = this.activeView();
    if (view === 'subscriptionUpgrade') return 'Activate Pro';
    if (view === 'wallet') return 'Wallet';
    return view === 'subscription' ? 'Subscription' : 'Settings';
  });
  readonly upgradeSource = signal<UserSettingsProUpgradeSource>(
    this.#context?.upgradeSource ?? 'subscription',
  );
  readonly #dialogRef =
    inject<BrnDialogRef<UserSettingsDialogResult | undefined>>(BrnDialogRef);
  readonly #subscriptionService = inject(SubscriptionService);

  backToSubscription(): void {
    this.activeView.set('subscription');
  }

  defaultUpgradeSource(): UserSettingsProUpgradeSource {
    return this.#subscriptionService.isExpired()
      ? 'expired-subscription'
      : 'subscription';
  }

  handleUpgradeCancelled(): void {
    if (this.#context?.closeOnUpgrade) {
      this.#dialogRef.close({ upgraded: false });
      return;
    }

    this.backToSubscription();
  }

  handleUpgradeCompleted(result: UserSettingsDialogResult): void {
    if (this.#context?.closeOnUpgrade) {
      this.#dialogRef.close(result);
      return;
    }

    this.backToSubscription();
  }

  openSubscriptionUpgrade(source?: UserSettingsProUpgradeSource): void {
    this.upgradeSource.set(source ?? this.defaultUpgradeSource());
    this.activeView.set('subscriptionUpgrade');
  }

  refreshWallet(): void {
    this.#balanceService.reload();
  }

  selectSection(section: UserSettingsDialogSection): void {
    this.activeView.set(section);
  }

  toggleHideZeroBalances(checked: boolean): void {
    this.#balanceService.hideZero.set(checked);
  }
}
