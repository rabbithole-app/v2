import { ChangeDetectionStrategy, Component, inject, OnInit, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { CreateStorageDrawerComponent } from '../../components';

/**
 * Invisible component activated via named outlet `(dialog:create-storage)`.
 * Opens the create-storage drawer on init, then navigates away from the outlet
 * so it doesn't re-trigger on back navigation.
 */
@Component({
  selector: 'rbth-create-storage-trigger',
  imports: [CreateStorageDrawerComponent],
  template: '<rbth-feat-storages-create-storage-drawer />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateStorageTriggerComponent implements OnInit {
  readonly #router = inject(Router);
  readonly drawer = viewChild(CreateStorageDrawerComponent);

  ngOnInit(): void {
    // Open drawer after view init
    setTimeout(() => this.drawer()?.open());

    // Remove the named outlet from the URL so back navigation won't re-trigger
    this.#router.navigate(['/dashboard', { outlets: { dialog: null } }], {
      replaceUrl: true,
    });
  }
}
