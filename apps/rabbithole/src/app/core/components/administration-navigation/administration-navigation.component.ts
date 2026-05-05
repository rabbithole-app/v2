import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideGauge,
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
      lucideGauge,
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
}
