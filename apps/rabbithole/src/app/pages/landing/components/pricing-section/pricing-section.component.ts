import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleHelp,
  lucidePlus,
  lucideStar,
} from '@ng-icons/lucide';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  formatBytes,
  formatTCycles,
  formatUsd,
  PRO_MANAGED_OPERATIONS_CREDIT_CYCLES,
  PRO_MONTHLY_PRICE_USD,
  ProFeatureGateService,
  STARTER_VAULT_INITIAL_CYCLES,
  STARTER_VAULT_LIST_PRICE_USD,
  STARTER_VAULT_PROMO_PRICE_USD,
  STORAGE_LICENSE_LIMITS_TOKEN,
  SubscriptionService,
} from '@rabbithole/core';
import {
  RbthFrameComponent,
  RbthFramePanelDirective,
} from '@rabbithole/ui/frame';
import { RbthRainbowButton } from '@rabbithole/ui/rainbow-button';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

@Component({
  selector: 'app-landing-pricing-section',
  imports: [
    ...HlmAlertImports,
    HlmBadge,
    HlmButton,
    HlmIcon,
    ...HlmTooltipImports,
    NgIcon,
    RbthFrameComponent,
    RbthFramePanelDirective,
    RbthRainbowButton,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleHelp,
      lucidePlus,
      lucideStar,
    }),
  ],
  host: { class: 'block w-full' },
  templateUrl: './pricing-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPricingSectionComponent {
  readonly #subscriptionService = inject(SubscriptionService);
  readonly hasSubscription = computed(
    () =>
      this.#subscriptionService.subscription() !== null &&
      this.#subscriptionService.subscription() !== undefined,
  );
  readonly #authService = inject(AUTH_SERVICE);
  readonly isAuthenticated = this.#authService.isAuthenticated;
  readonly isExpired = this.#subscriptionService.isExpired;
  readonly isPro = this.#subscriptionService.isPro;
  readonly licenseCta = computed(() => {
    if (!this.isAuthenticated()) return 'Create Starter Vault';
    if (this.hasSubscription()) return 'Create Another Vault';
    return 'Create Starter Vault';
  });
  readonly proCta = computed(() => {
    if (this.isPro()) return 'Current Plan';
    if (this.isExpired()) return 'Reactivate Pro';
    return 'Add Pro to Account';
  });

  readonly proDisabled = computed(() => this.isPro());
  readonly proManagedCreditLabel = formatCyclesLabel(
    PRO_MANAGED_OPERATIONS_CREDIT_CYCLES,
  );

  readonly proPriceLabel = formatUsd(PRO_MONTHLY_PRICE_USD);

  readonly starterCtaLink = computed(() =>
    ['/dashboard', { outlets: { dialog: 'create-storage' } }],
  );
  readonly starterInitialCyclesLabel = formatCyclesLabel(
    STARTER_VAULT_INITIAL_CYCLES,
  );
  readonly starterListPriceLabel = formatUsd(STARTER_VAULT_LIST_PRICE_USD);
  readonly starterPromoPriceLabel = formatUsd(STARTER_VAULT_PROMO_PRICE_USD);
  readonly #storageLicenseLimits = inject(STORAGE_LICENSE_LIMITS_TOKEN);
  readonly storageIncludedLabel = formatBytes(
    this.#storageLicenseLimits.includedBytes,
  );
  readonly storageMaxFileLabel = formatBytes(
    this.#storageLicenseLimits.maxFileBytes,
  );

  readonly #proFeatureGate = inject(ProFeatureGateService);

  readonly #router = inject(Router);

  openProUpgrade(): void {
    if (!this.isAuthenticated()) {
      void this.#router.navigate(['/login'], {
        queryParams: { redirectUrl: '/dashboard' },
      });
      return;
    }

    void this.#proFeatureGate.ensurePro(
      this.isExpired() ? 'expired-subscription' : 'pricing',
    );
  }
}

function formatCyclesLabel(cycles: bigint): string {
  return `${formatTCycles(cycles).replace(/\.?0+$/, '')} TC`;
}
