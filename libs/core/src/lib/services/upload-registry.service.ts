import { computed, Injectable } from '@angular/core';
import { SignalMap } from 'ngxtension/collections';

import {
  FileUploadWithStatus,
  UploadServiceState,
} from '../types/upload';
import { UploadState } from '../types/upload-state';
import {
  UploadId,
  UploadStatus,
} from '../types/worker';

const calculateOverallProgress = (files: FileUploadWithStatus[]) => {
  if (files.length === 0) return 0;

  const { current, total } = files.reduce(
    (acc, value) => {
      let current = acc.current;
      let total = acc.total;
      switch (value.status) {
        case UploadState.CANCELED:
        case UploadState.FAILED:
        case UploadState.INITIALIZING:
        case UploadState.NOT_STARTED:
        case UploadState.REQUESTING_VETKD:
          total += value.file.size;
          break;
        case UploadState.COMPLETED:
          current += value.file.size;
          total += value.file.size;
          break;
        case UploadState.IN_PROGRESS:
        case UploadState.WAITING_FOR_FUNDING:
          current += value.current;
          total += value.total;
          break;
      }

      return { current, total };
    },
    { current: 0, total: 0 },
  );

  return total > 0 ? Math.round((current / total) * 100) : 0;
};

const isProcessingFn = (files: FileUploadWithStatus[]) =>
  files.some(
    ({ status }) =>
      ![
        UploadState.CANCELED,
        UploadState.COMPLETED,
        UploadState.FAILED,
      ].includes(status),
  );

export interface StorageUploadState extends UploadServiceState {
  canisterId: string;
}

@Injectable({ providedIn: 'root' })
export class UploadRegistryService {
  /** canisterId -> StorageUploadState */
  readonly #storages = new SignalMap<string, StorageUploadState>();

  activeUploadCount = computed(() => {
    let count = 0;
    for (const [, state] of this.#storages) {
      if (state.isProcessing) {
        count += state.files.filter(
          ({ status }) =>
            ![
              UploadState.CANCELED,
              UploadState.COMPLETED,
              UploadState.FAILED,
            ].includes(status),
        ).length;
      }
    }
    return count;
  });

  storagesWithUploads = computed(() => {
    const result: string[] = [];
    for (const [canisterId, state] of this.#storages) {
      if (state.files.length > 0) {
        result.push(canisterId);
      }
    }
    return result;
  });

  /** uploadId -> canisterId (for routing progress messages) */
  readonly #uploadToStorage = new SignalMap<string, string>();

  addUpload(canisterId: string, item: FileUploadWithStatus) {
    this.#uploadToStorage.set(item.id, canisterId);
    const current = this.#storages.get(canisterId);
    const files = current ? [...current.files, item] : [item];
    this.#storages.set(canisterId, {
      canisterId,
      files,
      overallProgress: calculateOverallProgress(files),
      isProcessing: true,
      completedCount: current?.completedCount ?? 0,
    });
  }

  clearStorage(canisterId: string) {
    const current = this.#storages.get(canisterId);
    if (!current) return;

    for (const file of current.files) {
      this.#uploadToStorage.delete(file.id);
    }
    this.#storages.delete(canisterId);
  }

  getStorageState(canisterId: string): StorageUploadState | undefined {
    return this.#storages.get(canisterId);
  }

  removeUpload(uploadId: UploadId) {
    const canisterId = this.#uploadToStorage.get(uploadId);
    if (!canisterId) return;

    this.#uploadToStorage.delete(uploadId);
    const current = this.#storages.get(canisterId);
    if (!current) return;

    const files = current.files.filter((item) => item.id !== uploadId);
    if (files.length === 0) {
      this.#storages.delete(canisterId);
      return;
    }

    this.#storages.set(canisterId, {
      canisterId,
      files,
      overallProgress: calculateOverallProgress(files),
      isProcessing: isProcessingFn(files),
      completedCount: current.completedCount,
    });
  }

  updateUpload(value: UploadStatus) {
    const canisterId = this.#uploadToStorage.get(value.id);
    if (!canisterId) return;

    const current = this.#storages.get(canisterId);
    if (!current) return;

    const files = current.files.map((item) =>
      item.id === value.id ? { ...item, ...value } : item,
    );
    const completedCount =
      value.status === UploadState.COMPLETED
        ? current.completedCount + 1
        : current.completedCount;

    this.#storages.set(canisterId, {
      canisterId,
      files,
      overallProgress: calculateOverallProgress(files),
      isProcessing: isProcessingFn(files),
      completedCount,
    });
  }
}
