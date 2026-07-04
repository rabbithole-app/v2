import {
  ChangeDetectionStrategy,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import '@ic-pay/icpay-widget';
import { lucideLock } from '@ng-icons/lucide';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  applyDiscountUsd,
  DiscountService,
  formatUsd,
  ICPAY_CONFIG_TOKEN,
  PRO_MONTHLY_PRICE_USD,
  PromoCodeInputComponent,
  SubscriptionService,
} from '@rabbithole/core';
import { WalletBalancePaymentPanelComponent } from '@rabbithole/core/wallet';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import {
  RbthFrameComponent,
  RbthFrameDescriptionDirective,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui/frame';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

type DrawerStep = 'confirming' | 'error' | 'icpay-pending' | 'select' | 'success';

@Component({
  selector: 'rbth-feat-payment-drawer',
  imports: [
    BrnSheetContent,
    HlmButton,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    PromoCodeInputComponent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    RbthFrameComponent,
    RbthFrameDescriptionDirective,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    WalletBalancePaymentPanelComponent,
  ],
  providers: [provideIcons({ lucideLock })],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './payment-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentDrawerComponent {
  readonly #discountService = inject(DiscountService);

  // First Pro-month discount applies to the pay-from-balance path (the backend
  // applies it on purchaseSubscription). The ICPay crypto path is charged the
  // full monthly price.
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

  readonly discountedProPriceLabel = computed(() =>
    formatUsd(this.effectiveProPriceUsd()),
  );

  readonly errorMessage = signal<string | null>(null);
  readonly icpayPayBtn = viewChild<ElementRef<HTMLElement>>('icpayPayBtn');
  readonly purpose = input<'resubscribe' | 'subscribe'>('subscribe');
  readonly payFromBalanceLabel = computed(() =>
    this.purpose() === 'resubscribe'
      ? `Resubscribe to Pro - ${this.discountedProPriceLabel()}/mo from balance`
      : `Pay ${this.discountedProPriceLabel()}/mo from balance`,
  );
  readonly proPriceLabel = formatUsd(PRO_MONTHLY_PRICE_USD);
  readonly showPromoInput = computed(() => this.discountState() === null);

  readonly step = signal<DrawerStep>('select');
  readonly title = computed(() =>
    this.purpose() === 'resubscribe' ? 'Resubscribe to Pro' : 'Subscribe to Pro',
  );
  readonly #authService = inject(AUTH_SERVICE);
  readonly #icpayConfig = inject(ICPAY_CONFIG_TOKEN);

  readonly #router = inject(Router);

  readonly #subscriptionService = inject(SubscriptionService);

  private readonly drawer = viewChild(RbthDrawerComponent);

  constructor() {
    effect(() => {
      const btn = this.icpayPayBtn()?.nativeElement;
      if (!btn) return;
      (btn as unknown as { config: unknown }).config = {
        ...this.#icpayConfig,
        amountUsd: PRO_MONTHLY_PRICE_USD,
        buttonLabel: `Pay ${this.proPriceLabel}/mo with crypto`,
        metadata: {
          purpose: 'pro_monthly',
          userId: this.#authService.principalId(),
        },
        onSuccess: () => this.#onIcpaySuccess(),
      };
    });
  }

  close(): void {
    this.drawer()?.close();
  }

  goToDashboard(): void {
    this.close();
    this.#router.navigate(['/dashboard']);
  }

  open(): void {
    this.step.set('select');
    this.errorMessage.set(null);
    this.drawer()?.open();
  }

  async purchaseFromBalance(): Promise<void> {
    this.step.set('confirming');
    const success = await this.#subscriptionService.purchaseSubscription({
      Pro: null,
    });
    if (success) {
      this.step.set('success');
    } else {
      this.step.set('error');
      this.errorMessage.set('Purchase failed. Check your balance.');
    }
  }

  retry(): void {
    this.step.set('select');
    this.errorMessage.set(null);
  }

  #onIcpaySuccess(): void {
    this.#subscriptionService.reload();
    this.step.set('success');
  }
}
