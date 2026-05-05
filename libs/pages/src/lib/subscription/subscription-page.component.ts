import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
} from '@angular/core';

import {
  SettingsService,
  SubscriptionService,
} from '@rabbithole/core';
import { PaymentDrawerComponent } from '@rabbithole/features/payment';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { HlmSwitch } from '@spartan-ng/helm/switch';

@Component({
  selector: 'rbth-subscription-page',
  imports: [
    ...HlmCardImports,
    DatePipe,
    HlmBadge,
    HlmButton,
    HlmSeparator,
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

  autoTopUp = this.#settingsService.autoTopUp;
  #subscriptionService = inject(SubscriptionService);
  expiresAt = this.#subscriptionService.expiresAt;
  expiresAtDate = computed(() => {
    const ms = this.expiresAt();
    return ms ? new Date(ms) : null;
  });
  isActive = this.#subscriptionService.isActive;
  isExpired = this.#subscriptionService.isExpired;
  isPro = this.#subscriptionService.isPro;
  isTrial = this.#subscriptionService.isTrial;
  planBadgeVariant = computed(() => {
    if (this.isPro()) return 'default' as const;
    if (this.isTrial()) return 'secondary' as const;
    if (this.isExpired()) return 'destructive' as const;
    return 'outline' as const;
  });

  planLabel = computed(() => {
    if (this.isPro()) return 'Pro';
    if (this.isTrial()) return 'Trial';
    if (this.isExpired()) return 'Expired';
    return 'License';
  });
  spendingPriority = this.#settingsService.spendingPriority;
  // Subscription state
  subscription = this.#subscriptionService.subscription;

  trialDaysLeft = this.#subscriptionService.trialDaysLeft;

  trialProgress = this.#subscriptionService.trialProgress;

  trialUsedBytes = this.#subscriptionService.trialUsedBytes;

  private readonly paymentDrawer = viewChild(PaymentDrawerComponent);

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  async onAutoTopUpChange(enabled: boolean): Promise<void> {
    const settings = this.#settingsService.settings();
    if (!settings) return;
    await this.#settingsService.updateSettings({ ...settings, autoTopUp: enabled });
  }

  openPaymentDrawer(): void {
    this.paymentDrawer()?.open();
  }
}
