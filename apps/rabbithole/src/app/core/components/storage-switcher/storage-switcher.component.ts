import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronsUpDown,
  lucideHardDrive,
  lucidePlus,
} from '@ng-icons/lucide';
import { filter, map, startWith } from 'rxjs';

import { isPrincipal, StoragesService } from '@rabbithole/core';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';

@Component({
  selector: 'app-storage-switcher',
  templateUrl: './storage-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmIcon, ...HlmSidebarImports, ...HlmDropdownMenuImports],
  providers: [
    provideIcons({ lucideChevronsUpDown, lucideHardDrive, lucidePlus }),
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
        const first = url.split(/[?#(]/)[0].split('/').filter(Boolean)[0];
        return first && isPrincipal(first) ? first : null;
      }),
    ),
    { initialValue: null },
  );

  readonly #storagesService = inject(StoragesService);
  readonly storages = this.#storagesService.storages;

  readonly completedStorages = computed(() =>
    this.storages().filter(
      (s) => s.status.type === 'Completed' && s.canisterId,
    ),
  );

  readonly menuItemClass =
    'group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';

  readonly #dialogService = inject(HlmDialogService);

  navigateToStorage(canisterId: string): void {
    this.#router.navigate(['/', canisterId, 'drive']);
  }

  async openCreateStorageDialog(): Promise<void> {
    const { CreateStorageDialogComponent } = await import(
      '@rabbithole/features/storages'
    );
    this.#dialogService.open(CreateStorageDialogComponent, {
      contentClass: 'min-w-[500px] sm:max-w-[600px]',
    });
  }
}
