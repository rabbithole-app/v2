import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
  ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
  PermissionsService,
  provideEncryptedStorage,
} from '@rabbithole/core';

@Component({
  selector: 'app-storage',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  providers: [
    ENCRYPTED_STORAGE_FROM_ACTIVATED_ROUTE_PROVIDER,
    provideEncryptedStorage(),
    PermissionsService,
  ],
})
export class StorageComponent {}
