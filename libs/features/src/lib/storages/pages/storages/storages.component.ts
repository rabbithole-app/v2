import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideHardDrive,
  lucideInbox,
  lucidePlus,
  lucideRefreshCw,
} from '@ng-icons/lucide';

import { StoragesService } from '@rabbithole/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import {
  CreateStorageDrawerComponent,
  StorageCardComponent,
} from '../../components';

@Component({
  selector: 'rbth-feat-storages',
  imports: [
    NgIcon,
    HlmIcon,
    HlmSpinner,
    ...HlmButtonImports,
    ...HlmButtonGroupImports,
    ...HlmEmptyImports,
    StorageCardComponent,
    CreateStorageDrawerComponent,
  ],
  providers: [
    provideIcons({
      lucideHardDrive,
      lucideInbox,
      lucidePlus,
      lucideRefreshCw,
    }),
  ],
  host: {
    class: 'space-y-4',
  },
  templateUrl: './storages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoragesComponent {
  readonly #storagesService = inject(StoragesService);

  readonly hasActiveCreation = this.#storagesService.hasActiveCreation;
  readonly isCreating = this.#storagesService.isCreating;
  readonly isLoading = this.#storagesService.isLoading;
  readonly storages = this.#storagesService.storages;

  readonly createStorageDrawer = viewChild(CreateStorageDrawerComponent);

  constructor() {
    this.#storagesService.reload();
  }

  openCreateDrawer(): void {
    this.createStorageDrawer()?.open();
  }

  refresh(): void {
    this.#storagesService.reload();
  }
}
