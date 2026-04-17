import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideStar } from '@ng-icons/lucide';

import {
  SettingsService,
  SubscriptionService,
} from '@rabbithole/core';
import { PaymentDrawerComponent } from '@rabbithole/features/payment';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { HlmSwitch } from '@spartan-ng/helm/switch';

@Component({
  selector: 'rbth-subscription-page',
  imports: [
    ...HlmCardImports,
    DatePipe,
    HlmBadge,
    HlmButton,
    HlmIcon,
    HlmSeparator,
    HlmSwitch,
    NgIcon,
    PaymentDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucideStar,
    }),
  ],
  host: { class: 'block w-full space-y-6' },
  templateUrl: './subscription-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionPageComponent {
  #subscriptionService = inject(SubscriptionService);
  #settingsService = inject(SettingsService);

  // Subscription state
  subscription = this.#subscriptionService.subscription;
  isActive = this.#subscriptionService.isActive;
  isExpired = this.#subscriptionService.isExpired;
  isTrial = this.#subscriptionService.isTrial;
  isPro = this.#subscriptionService.isPro;
  expiresAt = this.#subscriptionService.expiresAt;
  trialUsedBytes = this.#subscriptionService.trialUsedBytes;
  trialProgress = this.#subscriptionService.trialProgress;
  trialDaysLeft = this.#subscriptionService.trialDaysLeft;

  // Settings
  autoRenew = this.#settingsService.autoRenew;
  autoTopUp = this.#settingsService.autoTopUp;
  spendingPriority = this.#settingsService.spendingPriority;

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

  expiresAtDate = computed(() => {
    const ms = this.expiresAt();
    return ms ? new Date(ms) : null;
  });

  private readonly paymentDrawer = viewChild(PaymentDrawerComponent);

  openPaymentDrawer(): void {
    this.paymentDrawer()?.open();
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
}
