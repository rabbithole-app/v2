import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideShield,
  lucideStar,
} from '@ng-icons/lucide';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { SubscriptionService, UserSettingsDialogService } from '@rabbithole/core';
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
  #subscriptionService = inject(SubscriptionService);
  hasSubscription = computed(
    () => this.#subscriptionService.subscription() !== null
      && this.#subscriptionService.subscription() !== undefined,
  );
  #authService = inject(AUTH_SERVICE);

  isAuthenticated = this.#authService.isAuthenticated;
  isExpired = this.#subscriptionService.isExpired;
  isPro = this.#subscriptionService.isPro;

  licenseCta = computed(() => {
    if (!this.isAuthenticated()) return 'Create Storage';
    if (this.hasSubscription()) return 'Create Another Storage';
    return 'Create Storage';
  });

  proCta = computed(() => {
    if (this.isPro()) return 'Current Plan';
    if (this.isExpired()) return 'Resubscribe';
    if (this.hasSubscription()) return 'Upgrade to Pro';
    return 'Subscribe to Pro';
  });

  proDisabled = computed(() => this.isPro());

  #router = inject(Router);
  #settingsDialogService = inject(UserSettingsDialogService);

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
      void this.#settingsDialogService.open('subscription');
      return;
    }
    void this.#settingsDialogService.openProUpgrade(
      this.isExpired() ? 'expired-subscription' : 'pricing',
    );
  }
}
