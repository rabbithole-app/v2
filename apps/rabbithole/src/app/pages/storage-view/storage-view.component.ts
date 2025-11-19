import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { UploadDrawerComponent } from '../../widgets/upload-drawer/upload-drawer.component';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '@rabbithole/core';

@Component({
  selector: 'app-storage-view',
  templateUrl: './storage-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UploadDrawerComponent],
})
export class StorageViewComponent {
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
}
