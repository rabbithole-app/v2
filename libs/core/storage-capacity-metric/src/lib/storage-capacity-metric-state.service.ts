import { computed, effect, Injectable, signal } from '@angular/core';

type StorageCapacityMetricState = {
  cyclesExpanded: boolean;
  storageExpanded: boolean;
};

const STORAGE_CAPACITY_METRIC_STATE_KEY =
  'rabbithole.storageCapacityMetric.state';

const DEFAULT_STATE: StorageCapacityMetricState = {
  cyclesExpanded: false,
  storageExpanded: false,
};

@Injectable({ providedIn: 'root' })
export class StorageCapacityMetricStateService {
  readonly #state = signal(readStoredState() ?? DEFAULT_STATE);

  readonly cyclesExpanded = computed(() => this.#state().cyclesExpanded);
  readonly state = this.#state.asReadonly();
  readonly storageExpanded = computed(() => this.#state().storageExpanded);

  constructor() {
    effect(() => {
      writeState(this.#state());
    });
  }

  toggleCyclesDetails(): void {
    this.#state.update((state) => ({
      ...state,
      cyclesExpanded: !state.cyclesExpanded,
    }));
  }

  toggleStorageDetails(): void {
    this.#state.update((state) => ({
      ...state,
      storageExpanded: !state.storageExpanded,
    }));
  }
}

function normalizeState(value: unknown): StorageCapacityMetricState | null {
  if (!value || typeof value !== 'object') return null;

  return {
    cyclesExpanded:
      'cyclesExpanded' in value && typeof value.cyclesExpanded === 'boolean'
        ? value.cyclesExpanded
        : DEFAULT_STATE.cyclesExpanded,
    storageExpanded:
      'storageExpanded' in value &&
      typeof value.storageExpanded === 'boolean'
        ? value.storageExpanded
        : DEFAULT_STATE.storageExpanded,
  };
}

function readStoredState(): StorageCapacityMetricState | null {
  try {
    const raw = globalThis.localStorage?.getItem(
      STORAGE_CAPACITY_METRIC_STATE_KEY,
    );
    if (!raw) return null;

    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeState(state: StorageCapacityMetricState): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_CAPACITY_METRIC_STATE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Ignore unavailable browser storage.
  }
}
