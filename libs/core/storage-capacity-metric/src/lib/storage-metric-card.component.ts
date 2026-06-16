import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideHardDrive,
  lucideRefreshCw,
  lucideStar,
} from '@ng-icons/lucide';
import { cva } from 'class-variance-authority';

import { formatBytes, UserSettingsDialogService } from '@rabbithole/core';
import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectEncryptedStorageActor,
  provideEncryptedStorageActor,
} from '@rabbithole/core/storage-runtime';
import { FormatBytesPipe } from '@rabbithole/core/ui';
import {
  RbthMetricCardComponent,
  RbthMetricCardContentDirective,
  RbthMetricCardFooterDirective,
  RbthMetricCardHeaderDirective,
  RbthMetricCardTitleDirective,
} from '@rabbithole/ui/metric-card';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { MetricLegendRowComponent } from './metric-legend-row.component';
import { StorageCapacityMetricStateService } from './storage-capacity-metric-state.service';
import {
  EMPTY_STORAGE_METRIC_SNAPSHOT,
  maxBigInt,
  MetricSnapshotSource,
  stickyMetricSnapshot,
  StorageBackendLabel,
  StorageMetricSnapshot,
} from './storage-capacity-metric.types';

type StorageMetricResourceParams = {
  forceRefresh: boolean;
};

const refreshIconVariants = cva('', {
  variants: {
    loading: {
      false: '',
      true: 'animate-spin',
    },
  },
});

@Component({
  selector: 'rbth-core-storage-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
  templateUrl: './storage-metric-card.component.html',
  imports: [
    HlmButton,
    HlmIcon,
    FormatBytesPipe,
    MetricLegendRowComponent,
    NgIcon,
    NgTemplateOutlet,
    RbthMetricCardComponent,
    RbthMetricCardContentDirective,
    RbthMetricCardFooterDirective,
    RbthMetricCardHeaderDirective,
    RbthMetricCardTitleDirective,
    ...HlmHoverCardImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
      lucideHardDrive,
      lucideRefreshCw,
      lucideStar,
    }),
    provideEncryptedStorageActor(),
  ],
})
export class StorageMetricCardComponent {
  readonly #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  readonly canisterId = this.#canisterId.toText();
  readonly compact = input(false);
  readonly #metricState = inject(StorageCapacityMetricStateService);
  readonly detailsExpanded = this.#metricState.storageExpanded;
  readonly #refreshNonce = signal(0);
  readonly #metrics = resource({
    params: (): StorageMetricResourceParams => ({
      forceRefresh: this.#refreshNonce() > 0,
    }),
    loader: ({ params }) => this.#load(params),
    defaultValue: EMPTY_STORAGE_METRIC_SNAPSHOT,
  });
  readonly snapshot = linkedSignal<
    MetricSnapshotSource<StorageMetricSnapshot>,
    StorageMetricSnapshot
  >({
    source: computed(() => ({
      canisterId: this.canisterId,
      value: this.#metrics.value() ?? EMPTY_STORAGE_METRIC_SNAPSHOT,
    })),
    computation: (source, previous) =>
      stickyMetricSnapshot({
        canisterId: source.canisterId,
        isVisible: source.value.canViewStorageMetrics,
        value: source.value,
        emptyValue: EMPTY_STORAGE_METRIC_SNAPSHOT,
        previous,
      }),
  });

  readonly totalBytes = computed(() => {
    const snapshot = this.snapshot();
    return (
      snapshot.limitBytes ??
      maxBigInt(1n, snapshot.fileBytes, snapshot.stableMemoryBytes)
    );
  });
  readonly filesWidth = computed(() =>
    this.#width(this.snapshot().fileBytes, this.totalBytes()),
  );
  readonly loading = computed(() => this.#metrics.isLoading());

  readonly refreshIconClass = computed(() =>
    refreshIconVariants({ loading: this.loading() }),
  );
  readonly showCard = computed(
    () => this.loading() || this.snapshot().canViewStorageMetrics,
  );
  readonly stableWidth = computed(() =>
    this.#width(this.snapshot().stableMemoryBytes, this.totalBytes()),
  );
  readonly subscriptionCtaEnabled = input(true);
  readonly #actor = injectEncryptedStorageActor();
  readonly #settingsDialogService = inject(UserSettingsDialogService);

  openSubscriptionAction(): void {
    if (this.snapshot().isPro) {
      void this.#settingsDialogService.open('subscription');
      return;
    }

    void this.#settingsDialogService.openProUpgrade('storage-limit');
  }

  refreshMetrics(): void {
    this.#refreshNonce.update((value) => value + 1);
  }

  toggleDetailsExpanded(): void {
    this.#metricState.toggleStorageDetails();
  }

  async #load({
    forceRefresh,
  }: StorageMetricResourceParams): Promise<StorageMetricSnapshot> {
    const actor = this.#actor();
    let storageMetrics = storageResultOk(
      forceRefresh
        ? await actor.refreshStorageCardMetrics()
        : await actor.getStorageCardMetrics(),
    );

    if (!storageMetrics && forceRefresh) {
      try {
        storageMetrics = storageResultOk(await actor.getStorageCardMetrics());
      } catch {
        // Keep the refresh failure as an unavailable card.
      }
    }

    if (storageMetrics?.subscriptionStatus.length === 0) {
      try {
        storageMetrics =
          storageResultOk(await actor.refreshStorageCardMetrics()) ??
          storageMetrics;
      } catch {
        // Shared users cannot force-refresh owner subscription metadata.
      }
    }

    if (storageMetrics) {
      const storageBackend: StorageBackendLabel =
        'OnChain' in storageMetrics.storageBackendType
          ? 'OnChain'
          : 'BlobStorage';
      if (
        !forceRefresh &&
        storageBackend === 'OnChain' &&
        onChainRuntimeStableMemoryBytes(storageMetrics) <
          storageMetrics.storedBytesUsed
      ) {
        try {
          storageMetrics =
            storageResultOk(await actor.refreshStorageCardMetrics()) ??
            storageMetrics;
        } catch {
          // Keep the cached query snapshot if runtime refresh is unavailable.
        }
      }
    }

    if (!storageMetrics) return EMPTY_STORAGE_METRIC_SNAPSHOT;

    const storageBackend: StorageBackendLabel =
      'OnChain' in storageMetrics.storageBackendType
        ? 'OnChain'
        : 'BlobStorage';
    const license = licensedLimits(storageMetrics.subscriptionStatus);
    const fileBytes = storageMetrics.storedBytesUsed;
    const stableMemoryBytes =
      storageBackend === 'OnChain'
        ? onChainStableMemoryBytes(storageMetrics, fileBytes)
        : fileBytes;

    return {
      canViewStorageMetrics: true,
      fileBytes,
      limitBytes: license?.includedBytes ?? null,
      limitLabel: storageLimitLabel(
        storageMetrics.subscriptionStatus,
        license?.includedBytes ?? null,
      ),
      maxFileBytes: license?.maxFileBytes ?? null,
      stableMemoryBytes,
      storageBackend,
      isPro: isPro(storageMetrics.subscriptionStatus),
    };
  }

  #width(value: bigint, total: bigint): string {
    if (total <= 0n) return '0%';
    const clamped = value > total ? total : value;
    const basisPoints = Number((clamped * 10_000n) / total);
    return `${basisPoints / 100}%`;
  }
}

function isPro(subscriptionStatus: readonly unknown[]): boolean {
  const status = subscriptionStatus[0];
  return (
    !!status &&
    typeof status === 'object' &&
    'active' in status &&
    typeof status.active === 'object' &&
    status.active !== null &&
    'plan' in status.active &&
    typeof status.active.plan === 'object' &&
    status.active.plan !== null &&
    'Pro' in status.active.plan
  );
}

function licensedLimits(
  subscriptionStatus: readonly unknown[],
): { includedBytes: bigint; maxFileBytes: bigint } | null {
  const status = subscriptionStatus[0];
  if (!status || typeof status !== 'object' || !('licensed' in status))
    return null;
  return (
    status as { licensed: { includedBytes: bigint; maxFileBytes: bigint } }
  ).licensed;
}

function onChainRuntimeStableMemoryBytes(metrics: {
  memoryInfo: { capacity: bigint };
  runtimeStableMemoryBytes: [] | [bigint];
}): bigint {
  return maxBigInt(
    metrics.runtimeStableMemoryBytes[0] ?? 0n,
    metrics.memoryInfo.capacity,
  );
}

function onChainStableMemoryBytes(
  metrics: {
    memoryInfo: { capacity: bigint };
    runtimeStableMemoryBytes: [] | [bigint];
  },
  fileBytes: bigint,
): bigint {
  return maxBigInt(onChainRuntimeStableMemoryBytes(metrics), fileBytes);
}

function storageLimitLabel(
  subscriptionStatus: readonly unknown[],
  includedBytes: bigint | null,
): string {
  if (includedBytes !== null) return formatBytes(Number(includedBytes));

  const status = subscriptionStatus[0];
  if (status && typeof status === 'object' && 'free' in status)
    return 'No license';

  return 'No fixed limit';
}

function storageResultOk<T>(result: { err: unknown } | { ok: T }): T | null {
  return 'ok' in result ? result.ok : null;
}
