import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Params, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut } from '@ng-icons/lucide';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconDirective } from '@spartan-ng/ui-icon-helm';

import { FSTree } from '../../widgets/fs-tree/fs-tree.component';
import { SidebarLayoutComponent } from '../../widgets/sidebar/sidebar.component';
import { UploadDrawerComponent } from '../../widgets/upload-drawer/upload-drawer.component';
import { AUTH_SERVICE } from '@rabbithole/auth';

@Component({
  selector: 'app-dashboard',
  imports: [
    NgIcon,
    HlmButtonDirective,
    HlmIconDirective,
    SidebarLayoutComponent,
    UploadDrawerComponent,
    FSTree,
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
