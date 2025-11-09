import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Params, Router, RouterOutlet } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideLogOut } from '@ng-icons/lucide';

import { SidebarLayoutComponent } from '../../widgets/sidebar/sidebar.component';
import { UploadDrawerComponent } from '../../widgets/upload-drawer/upload-drawer.component';
import { AUTH_SERVICE } from '@rabbithole/auth';

@Component({
  selector: 'app-dashboard',
  imports: [
    SidebarLayoutComponent,
    UploadDrawerComponent,
    RouterOutlet,
  ],
  providers: [provideIcons({ lucideLogOut })],
  templateUrl: './dashboard.component.html',
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
