import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { SidebarLayoutComponent } from '@rabbithole/core';

@Component({
  selector: 'rbth-page-dashboard',
  imports: [SidebarLayoutComponent, RouterOutlet],
  template: `<rbth-core-sidebar-layout>
    <router-outlet />
  </rbth-core-sidebar-layout>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  authService = inject(AUTH_SERVICE);
  #router = inject(Router);

  constructor() {
    effect(() => {
      if (!this.authService.isAuthenticated()) {
        this.#router.navigate(['/login'], {
          queryParams: { redirectUrl: this.#router.url },
        });
      }
    });
  }
}
