export type CanisterCyclesMetricSnapshot = {
  canViewCycleMetrics: boolean;
  currentFreezingReserve: bigint;
  cycleBalance: bigint;
  minimumSafeBalance: bigint;
  requiredBalance: bigint;
};

export type CycleStatus = "buffer" | "critical" | "low" | "ready";

export type StorageBackendLabel = "BlobStorage" | "OnChain";

export type StorageMetricSnapshot = {
  canViewStorageMetrics: boolean;
  fileBytes: bigint;
  isPro: boolean;
  limitBytes: bigint | null;
  limitLabel: string;
  maxFileBytes: bigint | null;
  stableMemoryBytes: bigint;
  storageBackend: StorageBackendLabel;
};

export const EMPTY_STORAGE_METRIC_SNAPSHOT: StorageMetricSnapshot = {
  canViewStorageMetrics: false,
  fileBytes: 0n,
  limitBytes: null,
  limitLabel: "No fixed limit",
  maxFileBytes: null,
  stableMemoryBytes: 0n,
  storageBackend: "BlobStorage",
  isPro: false,
};

export const EMPTY_CANISTER_CYCLES_METRIC_SNAPSHOT: CanisterCyclesMetricSnapshot =
  {
    canViewCycleMetrics: false,
    cycleBalance: 0n,
    currentFreezingReserve: 0n,
    minimumSafeBalance: 0n,
    requiredBalance: 0n,
  };

export type MetricSnapshotSource<T> = {
  canisterId: string | null;
  value: T;
};

export function maxBigInt(...values: bigint[]): bigint {
  return values.reduce((max, value) => (value > max ? value : max), 0n);
}

export function stickyMetricSnapshot<T>({
  canisterId,
  isVisible,
  value,
  emptyValue,
  previous,
}: {
  canisterId: string | null;
  emptyValue: T;
  isVisible: boolean;
  previous:
    | {
        source: MetricSnapshotSource<T>;
        value: T;
      }
    | undefined;
  value: T;
}): T {
  if (!canisterId) return emptyValue;
  if (isVisible) return value;
  if (previous?.source.canisterId === canisterId) return previous.value;
  return emptyValue;
}
