import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import {
  CanisterDataInfo,
  CanisterSyncStatus,
  formatBytes,
} from '@rabbithole/core';
import { HlmItem } from '@spartan-ng/helm/item';
import { HlmItemImports } from '@spartan-ng/helm/item';

import { CanisterMemoryChartComponent } from '../canister-memory-chart/canister-memory-chart.component';
import { InlineWarningComponent } from '../inline-warning/inline-warning.component';

@Component({
  selector: 'rbth-feat-canisters-canister-memory',
  hostDirectives: [
    {
      directive: HlmItem,
      inputs: ['variant', 'size', 'class'],
    },
  ],
  imports: [
    ...HlmItemImports,
    CanisterMemoryChartComponent,
    InlineWarningComponent,
  ],
  templateUrl: './canister-memory.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanisterMemoryComponent {
  /** Canister data info */
  canister = input.required<CanisterDataInfo>();

  /** Canister data (optional, for warnings) */
  canisterData = input<{ warning?: { heap?: boolean } } | undefined>();

  memoryMetrics = computed(() => this.canister().memoryMetrics);

  canisterHistorySize = computed(
    () => this.memoryMetrics()?.canisterHistorySize,
  );

  canisterHistoryFormatted = computed(() => {
    const size = this.canisterHistorySize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  customSectionsSize = computed(() => this.memoryMetrics()?.customSectionsSize);
  customSectionsFormatted = computed(() => {
    const size = this.customSectionsSize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  globalMemorySize = computed(() => this.memoryMetrics()?.globalMemorySize);

  globalMemoryFormatted = computed(() => {
    const size = this.globalMemorySize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  /** Heap warning label */
  heapWarningLabel = input<string | undefined>();

  memorySizeInTotal = computed(() => this.canister().memorySize);

  /** Segment type */
  segment = input<string>('');

  wasmChunkStoreSize = computed(() => this.memoryMetrics()?.wasmChunkStoreSize);

  showChunkStore = computed(() => {
    return (
      this.segment() === 'mission_control' &&
      (this.wasmChunkStoreSize() ?? 0n) > 0n
    );
  });

  /** Constants for thresholds */
  private readonly ONE_MB = 1000 * 1000;

  /** Conditional display flags */
  showGlobalMemory = computed(() => {
    const size = this.globalMemorySize();
    return (size ?? 0n) > this.ONE_MB;
  });

  private readonly ONE_KB = 1000;

  showHistory = computed(() => {
    return (this.canisterHistorySize() ?? 0n) > this.ONE_KB;
  });

  snapshotsSize = computed(() => this.memoryMetrics()?.snapshotsSize);

  showSnapshots = computed(() => {
    return (this.snapshotsSize() ?? 0n) > 0n;
  });

  snapshotsFormatted = computed(() => {
    const size = this.snapshotsSize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  stableMemorySize = computed(() => this.memoryMetrics()?.stableMemorySize);

  stableMemoryFormatted = computed(() => {
    const size = this.stableMemorySize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  /** Sync status */
  sync = input<CanisterSyncStatus | undefined>();

  /** Formatted values */
  totalMemoryFormatted = computed(() => {
    const size = this.memorySizeInTotal();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  /** Computed values */
  warning = computed(() => this.canisterData()?.warning?.heap === true);

  wasmBinarySize = computed(() => this.memoryMetrics()?.wasmBinarySize);

  wasmBinaryFormatted = computed(() => {
    const size = this.wasmBinarySize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  wasmChunkStoreFormatted = computed(() => {
    const size = this.wasmChunkStoreSize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });

  wasmMemorySize = computed(() => this.memoryMetrics()?.wasmMemorySize);

  wasmMemoryFormatted = computed(() => {
    const size = this.wasmMemorySize();
    return size !== undefined ? formatBytes(Number(size)) : '???';
  });
}
