import { NgTemplateOutlet } from '@angular/common';
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
  lucideStar,
} from '@ng-icons/lucide';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarService } from '@spartan-ng/helm/sidebar';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { BalanceService } from '../../../services/balance.service';
import { SubscriptionService } from '../../../services/subscription.service';
import {
  BACKEND_FEATURES_ENABLED_TOKEN,
  SIDEBAR_SUBSCRIPTION_LINK_TOKEN,
} from '../../../tokens';

@Component({
  selector: 'core-sidebar-subscription-footer',
  imports: [
    ...HlmTooltipImports,
    HlmIcon,
    NgTemplateOutlet,
    NgIcon,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideAlertTriangle,
      lucideArrowRight,
      lucideStar,
    }),
  ],
  template: `
    @if (backendFeaturesEnabled) {
      @if (subscriptionLink; as link) {
        <a
          [routerLink]="link"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent transition-colors"
          [hlmTooltip]="tooltipText()"
          [tooltipDisabled]="tooltipDisabled()"
          position="right"
        >
          <ng-container [ngTemplateOutlet]="content" />
        </a>
      } @else {
        <div
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          [hlmTooltip]="tooltipText()"
          [tooltipDisabled]="tooltipDisabled()"
          position="right"
        >
          <ng-container [ngTemplateOutlet]="content" />
        </div>
      }

      <ng-template #content>
        <ng-icon [name]="icon()" hlmIcon size="sm" [class]="iconClass()" />
        <span class="group-data-[collapsible=icon]:hidden truncate">
          {{ label() }}
        </span>
      </ng-template>
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
    if (this.#subscriptionService.isExpired()) return 'lucideAlertTriangle';
    return 'lucideArrowRight';
  });
  iconClass = computed(() => {
    if (this.#subscriptionService.isPro()) return 'text-green-600';
    if (this.#subscriptionService.isExpired()) return 'text-red-600';
    return 'text-muted-foreground';
  });
  #balanceService = inject(BalanceService);

  label = computed(() => {
    const total = this.#balanceService.totalUsd();
    const usdStr = total > 0 ? ` · $${total.toFixed(2)}` : '';

    if (this.#subscriptionService.isPro()) return `Pro${usdStr}`;
    if (this.#subscriptionService.isExpired()) return 'Expired';
    return 'Get Started';
  });

  readonly subscriptionLink = inject(SIDEBAR_SUBSCRIPTION_LINK_TOKEN);

  #sidebarService = inject(HlmSidebarService);

  tooltipDisabled = computed(
    () =>
      this.#sidebarService.state() !== 'collapsed' ||
      this.#sidebarService.isMobile(),
  );

  tooltipText = computed(() => this.label());
}
