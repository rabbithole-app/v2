import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { StoragesService } from '@rabbithole/core';
import { HlmDialogService } from '@spartan-ng/helm/dialog';

import {
  CREATE_STORAGE_DIALOG_CONTENT_CLASS,
  CreateStorageDialogComponent,
} from '../../components';

/**
 * Invisible component activated via named outlet `(dialog:create-storage)`.
 * Opens the create-storage dialog on init, then navigates away from the outlet
 * so it doesn't re-trigger on back navigation.
 */
@Component({
  selector: 'rbth-feat-create-storage-trigger',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateStorageTriggerComponent implements OnInit {
  readonly #dialogService = inject(HlmDialogService);
  readonly #router = inject(Router);
  readonly #storagesService = inject(StoragesService);

  ngOnInit(): void {
    const dialogRef = this.#dialogService.open(CreateStorageDialogComponent, {
      contentClass: CREATE_STORAGE_DIALOG_CONTENT_CLASS,
    });

    dialogRef.closed$.subscribe(() => {
      this.#storagesService.clearTrackedCreation();
      this.#storagesService.reload();
    });

    // Remove the named outlet from the URL so back navigation won't re-trigger
    this.#router.navigate(['/dashboard', { outlets: { dialog: null } }], {
      replaceUrl: true,
    });
  }
}
