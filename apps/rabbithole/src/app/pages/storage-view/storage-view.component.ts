import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectCoreWorker,
  UploadDrawerComponent,
} from '@rabbithole/core';

@Component({
  selector: 'app-storage-view',
  templateUrl: './storage-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UploadDrawerComponent],
})
export class StorageViewComponent {
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.postMessage({
      action: 'worker:init-storage',
      payload: this.canisterId.toText(),
    });
  }
}
