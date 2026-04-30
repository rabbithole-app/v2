import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
  PermissionsService,
  provideEncryptedStorage,
  provideUploadFilesService,
} from '@rabbithole/core/storage-runtime';

@Component({
  selector: 'app-storage',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterOutlet],
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    provideEncryptedStorage(),
    provideUploadFilesService(),
    PermissionsService,
  ],
})
export class StorageComponent {}
