import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
  PermissionsService,
  provideEncryptedStorage,
  provideEncryptedStorageCanisterIdFromRouteParam,
  provideUploadFilesService,
} from '@rabbithole/core/storage-runtime';

@Component({
  selector: 'app-storage',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterOutlet],
  providers: [
    provideEncryptedStorageCanisterIdFromRouteParam(),
    provideEncryptedStorage(),
    provideUploadFilesService(),
    PermissionsService,
  ],
})
export class StorageComponent {}
