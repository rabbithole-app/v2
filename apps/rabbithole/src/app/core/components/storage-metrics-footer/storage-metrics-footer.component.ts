import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StorageCapacityMetricComponent } from '@rabbithole/core/storage-capacity-metric';
import { provideEncryptedStorageCanisterIdFromRouteParam } from '@rabbithole/core/storage-runtime';

@Component({
  selector: 'app-storage-metrics-footer',
  template: `<rbth-core-storage-capacity-metric placement="footer" />`,
  imports: [StorageCapacityMetricComponent],
  providers: [provideEncryptedStorageCanisterIdFromRouteParam()],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageMetricsFooterComponent {}
