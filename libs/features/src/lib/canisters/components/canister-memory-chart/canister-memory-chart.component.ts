import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

import { RadarChartComponent, RadarData } from '@rabbithole/core';
import { CanisterMemoryMetrics } from '@rabbithole/core';

@Component({
  selector: 'rbth-feat-canisters-canister-memory-chart',
  imports: [RadarChartComponent],
  templateUrl: './canister-memory-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
})
export class CanisterMemoryChartComponent {
  /** Canister memory metrics */
  memoryMetrics = input<CanisterMemoryMetrics | undefined>();
  /** Computed chart data from memory metrics */
  chartsData = computed<RadarData[]>(() => {
    const metrics = this.memoryMetrics();
    if (!metrics) {
      return [{}];
    }

    const data: RadarData = {
      'on heap': Number(metrics.wasmMemorySize ?? 0n),
      'on stable': Number(metrics.stableMemorySize ?? 0n),
    };

    // Add global memory if > 1MB
    if ((metrics.globalMemorySize ?? 0n) > this.ONE_MB) {
      data['in global'] = Number(metrics.globalMemorySize ?? 0n);
    }

    // Add chunk store for mission_control segment
    if (
      this.segment() === 'mission_control' &&
      (metrics.wasmChunkStoreSize ?? 0n) > 0n
    ) {
      data['in chunks'] = Number(metrics.wasmChunkStoreSize ?? 0n);
    }

    // Add snapshots if > 0
    if ((metrics.snapshotsSize ?? 0n) > 0n) {
      data['on snapshot'] = Number(metrics.snapshotsSize ?? 0n);
    }

    // Add custom sections
    data['of custom sections'] = Number(metrics.customSectionsSize ?? 0n);

    // Add code size
    data['of code'] = Number(metrics.wasmBinarySize ?? 0n);

    // Add history if > 1KB
    if ((metrics.canisterHistorySize ?? 0n) > this.ONE_KB) {
      data['in history'] = Number(metrics.canisterHistorySize ?? 0n);
    }

    return [data];
  });
  /** Segment type (optional, used for conditional display) */
  segment = input<string>('');

  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected readonly _computedClass = computed(() =>
    hlm(
      'flex items-center justify-center h-[200px] w-full md:h-[180px] md:w-full',
      this.userClass(),
    ),
  );
  private readonly ONE_KB = 1000;

  /** Constants for thresholds */
  private readonly ONE_MB = 1000 * 1000;
}
