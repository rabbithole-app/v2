import { ChangeDetectionStrategy, Component } from '@angular/core';

import { StorageCapacityMetricComponent } from '@rabbithole/core/storage-capacity-metric';

@Component({
  selector: 'app-storage-metrics-footer',
  template: `<rbth-core-storage-capacity-metric
    placement="footer"
    [subscriptionCtaEnabled]="false"
  />`,
  imports: [StorageCapacityMetricComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageMetricsFooterComponent {}
