import { ChangeDetectionStrategy, Component } from '@angular/core';

import { provideEncryptedStorageCanisterIdFromRouteParam } from '@rabbithole/core/storage-runtime';
import { StorageVersionInfoComponent } from '@rabbithole/core/storage-version-info';

@Component({
  selector: 'app-storage-version-info-outlet',
  template: `<rbth-core-storage-version-info />`,
  imports: [StorageVersionInfoComponent],
  providers: [provideEncryptedStorageCanisterIdFromRouteParam()],
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageVersionInfoOutletComponent {}
