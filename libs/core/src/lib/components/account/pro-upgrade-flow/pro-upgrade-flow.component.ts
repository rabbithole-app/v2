import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCreditCard,
  lucideLock,
  lucideShield,
  lucideTriangleAlert,
} from '@ng-icons/lucide';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { PRO_MONTHLY_PRICE_USD } from '../../../constants';
import { DiscountService } from '../../../services/discount.service';
import { SubscriptionService } from '../../../services/subscription.service';
import { formatUsd } from '../../../utils/format-number';
import { applyDiscountUsd } from '../../../utils/referral';
import { PromoCodeInputComponent } from '../../promo-code-input/promo-code-input.component';
import type {
  UserSettingsDialogResult,
  UserSettingsProUpgradeSource,
} from '../user-settings-dialog/user-settings-dialog.types';
import { WalletBalancePanelComponent } from '../wallet-balance-panel/wallet-balance-panel.component';

type ProUpgradeState = 'error' | 'processing' | 'ready' | 'success';

@Component({
  selector: 'rbth-core-pro-upgrade-flow',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
  imports: [
    HlmButton,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    PromoCodeInputComponent,
    WalletBalancePanelComponent,
    ...HlmEmptyImports,
    ...HlmAlertImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCreditCard,
      lucideLock,
      lucideShield,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './pro-upgrade-flow.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProUpgradeFlowComponent {
  readonly balancePanel = viewChild(WalletBalancePanelComponent);

  readonly cancelled = output<void>();
  readonly state = signal<ProUpgradeState>('ready');
  readonly canUpgrade = computed(
    () => this.state() === 'ready' && this.balancePanel()?.canPay() === true,
  );
  readonly completed = output<UserSettingsDialogResult>();
  readonly source = input<UserSettingsProUpgradeSource>('subscription');
  readonly ctaLabel = computed(() =>
    this.source() === 'expired-subscription' ? 'Resume Pro' : 'Upgrade to Pro',
  );
  readonly #discountService = inject(DiscountService);
  // First Pro-month discount, when the user has a coupon-granted discount unused.
  readonly discountState = computed(() => this.#discountService.discountState());

  readonly proDiscountActive = computed(() => {
    const discount = this.discountState();
    return !!discount && !discount.proFirstMonthUsed;
  });
  readonly effectiveProPriceUsd = computed(() => {
    const discount = this.discountState();
    return this.proDiscountActive() && discount
      ? applyDiscountUsd(PRO_MONTHLY_PRICE_USD, discount.discountBps)
      : PRO_MONTHLY_PRICE_USD;
  });

  readonly discountedPriceLabel = computed(() =>
    formatUsd(this.effectiveProPriceUsd()),
  );
  readonly errorMessage = signal<string | null>(null);
  readonly priceLabel = formatUsd(PRO_MONTHLY_PRICE_USD);
  readonly showPromoInput = computed(() => this.discountState() === null);
  readonly #subscriptionService = inject(SubscriptionService);

  cancelFlow(): void {
    this.cancelled.emit();
  }

  closeSuccess(): void {
    this.completed.emit({ upgraded: true });
  }

  retry(): void {
    this.errorMessage.set(null);
    this.state.set('ready');
  }

  async upgrade(): Promise<void> {
    if (!this.canUpgrade()) return;

    this.errorMessage.set(null);
    this.state.set('processing');

    try {
      const upgraded = await this.#subscriptionService.purchaseSubscription({
        Pro: null,
      });

      if (upgraded) {
        this.state.set('success');
        return;
      }

      this.errorMessage.set(
        'The subscription was not activated. Check your wallet balance and try again.',
      );
      this.state.set('error');
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'The subscription was not activated. Try again.',
      );
      this.state.set('error');
    }
  }
}
