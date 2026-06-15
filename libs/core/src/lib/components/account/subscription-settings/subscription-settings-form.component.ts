import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSparkles, lucideStar, lucideZap } from '@ng-icons/lucide';

import {
  RbthFrameComponent,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSwitch } from '@spartan-ng/helm/switch';

import { PRO_MONTHLY_PRICE_USD } from '../../../constants';
import { SettingsService } from '../../../services/settings.service';
import { SubscriptionService } from '../../../services/subscription.service';
import { formatUsd } from '../../../utils/format-number';
import { SpendingPriorityListComponent } from './spending-priority-list.component';

@Component({
  selector: 'core-subscription-settings-form',
  imports: [
    ...HlmFieldImports,
    RbthFrameComponent,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    HlmBadge,
    HlmButton,
    HlmIcon,
    HlmSwitch,
    NgIcon,
    SpendingPriorityListComponent,
  ],
  providers: [provideIcons({ lucideSparkles, lucideZap, lucideStar })],
  templateUrl: './subscription-settings-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionSettingsFormComponent {
  readonly activatePro = output<void>();
  readonly #subscriptionService = inject(SubscriptionService);

  readonly isExpired = this.#subscriptionService.isExpired;
  readonly activationDescription = computed(() =>
    this.isExpired()
      ? 'Resume Pro to restore sharing, uploads beyond starter limits, and managed funding.'
      : 'Activate Pro for sharing, uploads beyond starter limits, and managed funding.',
  );

  readonly activationLabel = computed(() =>
    this.isExpired() ? 'Resubscribe to Pro' : 'Activate Pro',
  );
  readonly #settingsService = inject(SettingsService);
  readonly autoRenew = this.#settingsService.autoRenew;
  readonly isPro = this.#subscriptionService.isPro;
  readonly nextBillingLabel = computed(() =>
    this.autoRenew() ? 'Renews on' : 'Ends on',
  );
  readonly nextBillingValue = computed(() => {
    const expiresAt = this.#subscriptionService.expiresAt();
    if (!expiresAt) return 'Not scheduled';

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(expiresAt));
  });
  readonly planDescription =
    'Your plan includes sharing, approved updates, automatic cycle top-ups, and 2 TC of managed operations credit per period.';
  readonly proPriceLabel = formatUsd(PRO_MONTHLY_PRICE_USD);

  async onAutoRenewChange(enabled: boolean): Promise<void> {
    const settings = this.#settingsService.settings();
    if (!settings) return;

    await this.#settingsService.updateSettings({ ...settings, autoRenew: enabled });
  }

  requestProActivation(): void {
    this.activatePro.emit();
  }
}
