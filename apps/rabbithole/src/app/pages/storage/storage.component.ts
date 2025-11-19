import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Principal } from '@dfinity/principal';

import { PermissionsService } from '../permissions/permissions.service';
import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  provideCoreWorker,
  provideEncryptedStorage,
} from '@rabbithole/core';

@Component({
  selector: 'app-storage',
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  providers: [
    {
      provide: ENCRYPTED_STORAGE_CANISTER_ID,
      useFactory: () => {
        const route = inject(ActivatedRoute);
        const canisterId = route.snapshot.paramMap.get('id');

        if (!canisterId) {
          throw new Error('Canister ID parameter is required');
        }
        return Principal.fromText(canisterId);
      },
    },
    provideCoreWorker(),
    provideEncryptedStorage(),
    PermissionsService,
  ],
})
export class StorageComponent {}
