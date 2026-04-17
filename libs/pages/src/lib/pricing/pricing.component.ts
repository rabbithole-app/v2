import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideShield,
  lucideStar,
} from '@ng-icons/lucide';

import { SubscriptionService } from '@rabbithole/core';
import { AUTH_SERVICE } from '@rabbithole/auth';
import { PaymentDrawerComponent } from '@rabbithole/features/payment';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { PricingFaqComponent } from './pricing-faq.component';

@Component({
  selector: 'rbth-pricing-page',
  imports: [
    ...HlmCardImports,
    HlmButton,
    HlmIcon,
    NgIcon,
    PaymentDrawerComponent,
    PricingFaqComponent,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronDown,
      lucideShield,
      lucideStar,
    }),
  ],
  host: { class: 'block w-full' },
  templateUrl: './pricing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingComponent {
  #router = inject(Router);
  #authService = inject(AUTH_SERVICE);
  #subscriptionService = inject(SubscriptionService);

  isAuthenticated = this.#authService.isAuthenticated;
  isPro = this.#subscriptionService.isPro;
  isTrial = this.#subscriptionService.isTrial;
  isExpired = this.#subscriptionService.isExpired;

  hasSubscription = computed(
    () => this.#subscriptionService.subscription() !== null
      && this.#subscriptionService.subscription() !== undefined,
  );

  licenseCta = computed(() => {
    if (!this.isAuthenticated()) return 'Create Storage';
    if (this.hasSubscription()) return 'Create Another Storage';
    return 'Create Storage';
  });

  proCta = computed(() => {
    if (this.isPro()) return 'Current Plan';
    if (this.isExpired()) return 'Resubscribe';
    if (this.isTrial() || this.hasSubscription()) return 'Upgrade to Pro';
    return 'Subscribe to Pro';
  });

  proDisabled = computed(() => this.isPro());

  private readonly paymentDrawer = viewChild(PaymentDrawerComponent);

  onLicenseClick(): void {
    if (!this.isAuthenticated()) {
      this.#router.navigate(['/login'], { queryParams: { redirectUrl: '/pricing' } });
      return;
    }
    this.#router.navigate(['/dashboard', { outlets: { dialog: 'create-storage' } }]);
  }

  onProClick(): void {
    if (!this.isAuthenticated()) {
      this.#router.navigate(['/login'], { queryParams: { redirectUrl: '/pricing' } });
      return;
    }
    if (this.isPro()) {
      this.#router.navigate(['/dashboard/subscription']);
      return;
    }
    this.paymentDrawer()?.open();
  }
}
