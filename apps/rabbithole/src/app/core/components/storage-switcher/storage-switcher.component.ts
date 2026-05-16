import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronsUpDown,
  lucideHardDrive,
  lucideLoader2,
  lucidePlus,
  lucideShare2,
} from '@ng-icons/lucide';
import { filter, map, startWith } from 'rxjs';

import { isPrincipal, StoragesService } from '@rabbithole/core';
import { RbthSidebarMenuButton } from '@rabbithole/ui/sidebar';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

@Component({
  selector: 'app-storage-switcher',
  templateUrl: './storage-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    RouterLink,
    RouterLinkActive,
    HlmIcon,
    HlmSpinner,
    RbthSidebarMenuButton,
    ...HlmSidebarImports,
    ...HlmDropdownMenuImports,
  ],
  providers: [
    provideIcons({
      lucideChevronsUpDown,
      lucideHardDrive,
      lucideLoader2,
      lucidePlus,
      lucideShare2,
    }),
  ],
})
export class StorageSwitcherComponent {
  readonly #router = inject(Router);
  readonly activeCanisterId = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.#router.url),
      map((url) => {
        const segments = url.split(/[?#(]/)[0].split('/').filter(Boolean);
        // Skip 'dashboard' prefix — canisterId is the second segment
        const candidate = segments[0] === 'dashboard' ? segments[1] : segments[0];
        return candidate && isPrincipal(candidate) ? candidate : null;
      }),
    ),
    { initialValue: null },
  );

  readonly #storagesService = inject(StoragesService);
  readonly storages = this.#storagesService.storages;

  readonly availableStorages = computed(() =>
    this.storages().filter(
      (s) => s.canisterId && (
        s.status.type === 'Completed' ||
        s.status.type === 'UpgradingWasm' ||
        s.status.type === 'UpgradingFrontend' ||
        s.status.type === 'UpdatingControllers' ||
        s.status.type === 'RevokingInstallerPermission'
      ),
    ),
  );

  readonly menuItemClass =
    'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';


  readonly #upgradingCanisterIds = computed(() => {
    const upgrading = new Set<string>();
    for (const s of this.storages()) {
      if (
        s.canisterId &&
        s.status.type !== 'Completed' &&
        s.status.type !== 'Failed' &&
        s.status.type !== 'Pending'
      ) {
        upgrading.add(s.canisterId.toText());
      }
    }
    return upgrading;
  });

  isStorageUpgrading(canisterId: string): boolean {
    return this.#upgradingCanisterIds().has(canisterId);
  }

  navigateToStorage(canisterId: string): void {
    this.#router.navigate(['/dashboard', canisterId, 'drive']);
  }

  openCreateStorage(): void {
    this.#router.navigate(['/dashboard', { outlets: { dialog: 'create-storage' } }]);
  }
}
