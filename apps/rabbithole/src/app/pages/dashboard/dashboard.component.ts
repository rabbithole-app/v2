import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Params, Router, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { SidebarLayoutComponent } from '@rabbithole/core';

import { AdvancedNavigationComponent } from '../../core/components/advanced-navigation/advanced-navigation.component';
import { StorageSwitcherComponent } from '../../core/components/storage-switcher/storage-switcher.component';

@Component({
  selector: 'app-dashboard',
  imports: [
    SidebarLayoutComponent,
    RouterOutlet,
    StorageSwitcherComponent,
    AdvancedNavigationComponent,
  ],
  template: `<core-sidebar-layout>
    <app-storage-switcher sidebarTop />
    <app-advanced-navigation sidebarBottom />
    <router-outlet />
  </core-sidebar-layout>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  #authService = inject(AUTH_SERVICE);
  #router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.#authService.isAuthenticated()) {
        const queryParams: Params | null =
          this.#router.url === '/' ? null : { redirectUrl: this.#router.url };
        this.#router.navigate(['/login'], { queryParams });
      }
    });
  }
}
