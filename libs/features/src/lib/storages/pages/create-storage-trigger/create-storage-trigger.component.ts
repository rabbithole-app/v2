import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { HlmDialogService } from '@spartan-ng/helm/dialog';

import { CreateStorageDialogComponent } from '../../components';

/**
 * Invisible component activated via named outlet `(dialog:create-storage)`.
 * Opens the create-storage dialog on init, then navigates away from the outlet
 * so it doesn't re-trigger on back navigation.
 */
@Component({
  selector: 'rbth-create-storage-trigger',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateStorageTriggerComponent implements OnInit {
  readonly #dialogService = inject(HlmDialogService);
  readonly #router = inject(Router);

  ngOnInit(): void {
    this.#dialogService.open(CreateStorageDialogComponent, {
      contentClass: 'min-w-[500px] sm:max-w-[600px]',
    });

    // Remove the named outlet from the URL so back navigation won't re-trigger
    this.#router.navigate(['/dashboard', { outlets: { dialog: null } }], {
      replaceUrl: true,
    });
  }
}
