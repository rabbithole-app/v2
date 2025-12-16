import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Params, Router, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { SidebarLayoutComponent } from '@rabbithole/core';

@Component({
  selector: 'page-dashboard',
  imports: [SidebarLayoutComponent, RouterOutlet],
  template: `<core-sidebar-layout>
    <router-outlet />
  </core-sidebar-layout>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  authService = inject(AUTH_SERVICE);
  #router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.authService.isAuthenticated()) {
        const queryParams: Params | null =
          this.#router.url === '/' ? null : { redirectUrl: this.#router.url };
        this.#router.navigate(['/login'], { queryParams });
      }
    });
  }
}
