import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertTriangle,
  lucideArrowRight,
  lucideClock,
  lucideStar,
} from '@ng-icons/lucide';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarService } from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { BalanceService } from '../../../services/balance.service';
import { SubscriptionService } from '../../../services/subscription.service';
import { BACKEND_FEATURES_ENABLED_TOKEN } from '../../../tokens';

@Component({
  selector: 'rbth-sidebar-subscription-footer',
  imports: [
    ...HlmTooltipImports,
    HlmIcon,
    NgIcon,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideAlertTriangle,
      lucideArrowRight,
      lucideClock,
      lucideStar,
    }),
  ],
  template: `
    @if (backendFeaturesEnabled) {
      <a
        routerLink="/dashboard/subscription"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent transition-colors"
        [hlmTooltip]="tooltipText()"
        [tooltipDisabled]="tooltipDisabled()"
        position="right"
      >
        <ng-icon [name]="icon()" hlmIcon size="sm" [class]="iconClass()" />
        <span class="group-data-[collapsible=icon]:hidden truncate">
          {{ label() }}
        </span>
      </a>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarSubscriptionFooterComponent {
  readonly backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);
  #subscriptionService = inject(SubscriptionService);
  icon = computed(() => {
    if (this.#subscriptionService.isPro()) return 'lucideStar';
    if (this.#subscriptionService.isTrial()) return 'lucideClock';
    if (this.#subscriptionService.isExpired()) return 'lucideAlertTriangle';
    return 'lucideArrowRight';
  });
  iconClass = computed(() => {
    if (this.#subscriptionService.isPro()) return 'text-green-600';
    if (this.#subscriptionService.isTrial()) return 'text-amber-600';
    if (this.#subscriptionService.isExpired()) return 'text-red-600';
    return 'text-muted-foreground';
  });

  #balanceService = inject(BalanceService);

  label = computed(() => {
    const total = this.#balanceService.totalUsd();
    const usdStr = total > 0 ? ` · $${total.toFixed(2)}` : '';

    if (this.#subscriptionService.isPro()) return `Pro${usdStr}`;
    if (this.#subscriptionService.isTrial()) {
      const days = this.#subscriptionService.trialDaysLeft();
      return `Trial · ${days}d left`;
    }
    if (this.#subscriptionService.isExpired()) return 'Expired';
    return 'Get Started';
  });

  #sidebarService = inject(HlmSidebarService);

  tooltipDisabled = computed(
    () =>
      this.#sidebarService.state() !== 'collapsed' ||
      this.#sidebarService.isMobile(),
  );

  tooltipText = computed(() => this.label());
}
