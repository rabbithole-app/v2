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

import {
  formatUsd,
  ICPAY_CONFIG_TOKEN,
  PRO_MONTHLY_PRICE_USD,
  SubscriptionService,
  WalletBalancePaymentPanelComponent,
} from '@rabbithole/core';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerTitleDirective,
  RbthFrameComponent,
  RbthFrameDescriptionDirective,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
} from '@rabbithole/ui';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

type DrawerStep = 'select' | 'icpay-pending' | 'confirming' | 'success' | 'error';

@Component({
  selector: 'rbth-feat-payment-drawer',
  imports: [
    BrnSheetContent,
    HlmButton,
    HlmIcon,
    HlmSpinner,
    NgIcon,
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
  readonly purpose = input<'subscribe' | 'resubscribe'>('subscribe');

  readonly PRO_MONTHLY_PRICE_USD = PRO_MONTHLY_PRICE_USD;
  readonly proPriceLabel = formatUsd(PRO_MONTHLY_PRICE_USD);

  readonly step = signal<DrawerStep>('select');
  readonly errorMessage = signal<string | null>(null);

  readonly icpayPayBtn = viewChild<ElementRef<HTMLElement>>('icpayPayBtn');

  readonly #authService = inject(AUTH_SERVICE);
  readonly #icpayConfig = inject(ICPAY_CONFIG_TOKEN);
  readonly #router = inject(Router);
  readonly #subscriptionService = inject(SubscriptionService);

  readonly title = computed(() =>
    this.purpose() === 'resubscribe' ? 'Resubscribe to Pro' : 'Subscribe to Pro',
  );

  readonly payFromBalanceLabel = computed(() =>
    this.purpose() === 'resubscribe'
      ? `Resubscribe ${this.proPriceLabel}/mo from balance`
      : `Pay ${this.proPriceLabel}/mo from balance`,
  );

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

  open(): void {
    this.step.set('select');
    this.errorMessage.set(null);
    this.drawer()?.open();
  }

  close(): void {
    this.drawer()?.close();
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

  goToDashboard(): void {
    this.close();
    this.#router.navigate(['/dashboard']);
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
