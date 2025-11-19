import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Params, Router, RouterOutlet } from '@angular/router';

import { SidebarLayoutComponent } from '../../widgets/sidebar/sidebar.component';
import { AUTH_SERVICE } from '@rabbithole/auth';

@Component({
  selector: 'app-dashboard',
  imports: [SidebarLayoutComponent, RouterOutlet],
  template: `<app-sidebar-layout>
    <router-outlet />
  </app-sidebar-layout>`,
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
