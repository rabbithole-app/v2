import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationError,
  RouteConfigLoadEnd,
  RouteConfigLoadStart,
  Router,
  RouterOutlet,
} from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  SidebarHeaderSlotDirective,
  SidebarLayoutComponent,
} from '@rabbithole/core';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

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
    HlmSpinner,
  ],
  template: `<rbth-core-sidebar-layout>
    <app-storage-header-switcher rbthCoreSidebarHeader />
    <app-storage-switcher sidebarTop />
    <app-administration-navigation sidebarAfter />
    <router-outlet />
  </rbth-core-sidebar-layout>
  <router-outlet name="dialog" />
  @if (dialogRouteLoading()) {
    <div
      class="bg-background/90 fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm"
    >
      <hlm-spinner size="sm" />
      <span>Loading...</span>
    </div>
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly #dialogRouteLoadCount = signal(0);
  readonly dialogRouteLoading = computed(() => this.#dialogRouteLoadCount() > 0);
  #authService = inject(AUTH_SERVICE);
  #router = inject(Router);

  constructor() {
    this.#router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (
        event instanceof RouteConfigLoadStart &&
        event.route.outlet === 'dialog'
      ) {
        this.#dialogRouteLoadCount.update((count) => count + 1);
        return;
      }

      if (
        event instanceof RouteConfigLoadEnd &&
        event.route.outlet === 'dialog'
      ) {
        this.#dialogRouteLoadCount.update((count) => Math.max(0, count - 1));
        return;
      }

      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.#dialogRouteLoadCount.set(0);
      }
    });

    effect(() => {
      if (!this.#authService.isAuthenticated()) {
        this.#router.navigate(['/login'], {
          queryParams: { redirectUrl: this.#router.url },
        });
      }
    });
  }
}
