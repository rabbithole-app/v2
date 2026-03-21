import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { SidebarLayoutComponent } from '@rabbithole/core';

import { StorageSwitcherComponent } from '../../core/components/storage-switcher/storage-switcher.component';

@Component({
  selector: 'app-dashboard',
  imports: [
    SidebarLayoutComponent,
    RouterOutlet,
    StorageSwitcherComponent,
  ],
  template: `<core-sidebar-layout>
    <app-storage-switcher sidebarTop />
    <router-outlet />
  </core-sidebar-layout>
  <router-outlet name="dialog" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  #authService = inject(AUTH_SERVICE);
  #router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.#authService.isAuthenticated()) {
        this.#router.navigate(['/login'], {
          queryParams: { redirectUrl: this.#router.url },
        });
      }
    });
  }
}
