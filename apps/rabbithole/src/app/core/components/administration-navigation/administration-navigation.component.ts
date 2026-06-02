import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideCircleAlert,
  lucideCreditCard,
  lucideGauge,
  lucideKeyRound,
  lucidePackageOpen,
  lucideServerCog,
  lucideUsers,
} from '@ng-icons/lucide';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { injectMainActor } from '@rabbithole/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-administration-navigation',
  templateUrl: './administration-navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmIcon,
    ...HlmSidebarImports,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideChevronDown,
      lucideCreditCard,
      lucideGauge,
      lucideKeyRound,
      lucidePackageOpen,
      lucideServerCog,
      lucideUsers,
    }),
  ],
})
export class AdministrationNavigationComponent {
  readonly #actor = injectMainActor();
  readonly #authService = inject(AUTH_SERVICE);
  readonly adminCheckParams = computed(() => {
    if (!this.#authService.isAuthenticated()) return undefined;

    return {
      actor: this.#actor(),
      principal: this.#authService.identity().getPrincipal(),
    };
  });
  readonly administrationNavExpanded = signal(true);

  readonly administrationNavItems = [
    {
      exact: true,
      icon: 'lucideGauge',
      label: 'Overview',
      route: '/dashboard/admin',
    },
    {
      exact: false,
      icon: 'lucideServerCog',
      label: 'Creations',
      route: '/dashboard/admin/creations',
    },
    {
      exact: false,
      icon: 'lucideCircleAlert',
      label: 'CMC Recovery',
      route: '/dashboard/admin/cmc-recovery',
    },
    {
      exact: false,
      icon: 'lucideCreditCard',
      label: 'Subscriptions',
      route: '/dashboard/admin/subscriptions',
    },
    {
      exact: false,
      icon: 'lucideKeyRound',
      label: 'Licenses',
      route: '/dashboard/admin/licenses',
    },
    {
      exact: false,
      icon: 'lucidePackageOpen',
      label: 'Releases',
      route: '/dashboard/admin/releases',
    },
    {
      exact: false,
      icon: 'lucideUsers',
      label: 'Users',
      route: '/dashboard/admin/users',
    },
  ];

  readonly isAdmin = resource({
    params: this.adminCheckParams,
    loader: async ({ params }) =>
      params ? params.actor.isAdmin(params.principal) : false,
    defaultValue: false,
  });

  toggleAdministrationNav(): void {
    this.administrationNavExpanded.update((expanded) => !expanded);
  }
}
