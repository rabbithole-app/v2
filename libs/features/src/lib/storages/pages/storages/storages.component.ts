import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import {
  CREATE_STORAGE_DIALOG_CONTENT_CLASS,
  CreateStorageDialogComponent,
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
  readonly #dialogService = inject(HlmDialogService);

  readonly hasActiveCreation = this.#storagesService.hasActiveCreation;
  readonly isCreating = this.#storagesService.isCreating;
  readonly isLoading = this.#storagesService.isLoading;
  readonly storages = this.#storagesService.storages;

  constructor() {
    this.#storagesService.reload();
  }

  openCreateDialog(): void {
    const dialogRef = this.#dialogService.open(CreateStorageDialogComponent, {
      contentClass: CREATE_STORAGE_DIALOG_CONTENT_CLASS,
    });

    dialogRef.closed$.subscribe(() => {
      this.#storagesService.clearTrackedCreation();
      this.#storagesService.reload();
    });
  }

  refresh(): void {
    this.#storagesService.reload();
  }
}
