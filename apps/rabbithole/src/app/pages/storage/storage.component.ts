import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { PermissionsService } from '../permissions/permissions.service';
import {
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
  provideCoreWorker,
  provideEncryptedStorage,
} from '@rabbithole/core';

@Component({
  selector: 'app-storage',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    provideCoreWorker(),
    provideEncryptedStorage(),
    PermissionsService,
  ],
})
export class StorageComponent {}
