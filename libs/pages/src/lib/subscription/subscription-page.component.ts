import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
} from '@angular/core';

import {
  formatTCycles,
  SettingsService,
  StorageFundingService,
  SubscriptionService,
} from '@rabbithole/core';
import { PaymentDrawerComponent } from '@rabbithole/features/payment';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSwitch } from '@spartan-ng/helm/switch';

@Component({
  selector: 'rbth-subscription-page',
  imports: [
    ...HlmCardImports,
    DatePipe,
    HlmBadge,
    HlmButton,
    HlmSwitch,
    PaymentDrawerComponent,
  ],
  host: { class: 'block w-full space-y-6' },
  templateUrl: './subscription-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionPageComponent {
  #settingsService = inject(SettingsService);
  // Settings
  autoRenew = this.#settingsService.autoRenew;
  #subscriptionService = inject(SubscriptionService);

  expiresAt = this.#subscriptionService.expiresAt;
  expiresAtDate = computed(() => {
    const ms = this.expiresAt();
    return ms ? new Date(ms) : null;
  });
  #storageFundingService = inject(StorageFundingService);
  storageFundingStatus = this.#storageFundingService.status;
  includedFundingExhausted = computed(
    () => this.storageFundingStatus()?.includedCyclesRemaining === 0n,
  );
  includedFundingPeriodEndDate = computed(() => {
    const value = this.storageFundingStatus()?.periodEnd[0];
    return value === undefined ? null : new Date(Number(value) / 1_000_000);
  });
  includedFundingProgress = computed(() =>
    Math.min(100, this.#storageFundingService.includedProgress() * 100),
  );
  isActive = this.#subscriptionService.isActive;
  isExpired = this.#subscriptionService.isExpired;
  isExpiredPro = this.#subscriptionService.isExpiredPro;
  isPro = this.#subscriptionService.isPro;
  paidStorageAutoTopUpEnabled = computed(
    () => this.storageFundingStatus()?.paidAutoTopUpEnabled ?? false,
  );
  planBadgeVariant = computed(() => {
    if (this.isExpired()) return 'destructive' as const;
    if (this.isPro()) return 'default' as const;
    return 'outline' as const;
  });

  planLabel = computed(() => {
    if (this.isPro()) return 'Pro';
    if (this.isExpiredPro()) return 'Expired Pro';
    if (this.isExpired()) return 'Expired';
    return 'License';
  });
  spendingPriority = this.#settingsService.spendingPriority;
  // Subscription state
  subscription = this.#subscriptionService.subscription;

  private readonly paymentDrawer = viewChild(PaymentDrawerComponent);

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatCycles(cycles: bigint): string {
    return `${formatTCycles(cycles)} TCycles`;
  }

  formatSpendingPriority(): string {
    return this.spendingPriority()
      .map((t) => Object.keys(t)[0])
      .join(' > ');
  }

  async onAutoRenewChange(enabled: boolean): Promise<void> {
    const settings = this.#settingsService.settings();
    if (!settings) return;
    await this.#settingsService.updateSettings({ ...settings, autoRenew: enabled });
  }

  openPaymentDrawer(): void {
    this.paymentDrawer()?.open();
  }
}
