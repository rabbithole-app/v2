import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  SidebarHeaderSlotDirective,
  SidebarLayoutComponent,
} from '@rabbithole/core';

import { AdministrationNavigationComponent } from '../../core/components/administration-navigation/administration-navigation.component';
import { StorageHeaderSwitcherComponent } from '../../core/components/storage-header-switcher/storage-header-switcher.component';
import { StorageSwitcherComponent } from '../../core/components/storage-switcher/storage-switcher.component';

@Component({
  selector: 'app-dashboard',
  imports: [
    SidebarLayoutComponent,
    SidebarHeaderSlotDirective,
    RouterOutlet,
    StorageHeaderSwitcherComponent,
    StorageSwitcherComponent,
    AdministrationNavigationComponent,
  ],
  template: `<core-sidebar-layout>
    <app-storage-header-switcher coreSidebarHeader />
    <app-storage-switcher sidebarTop />
    <app-administration-navigation sidebarAfter />
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
