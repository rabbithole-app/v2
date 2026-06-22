import { computed, inject, Injectable, resource } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import {
  EncryptedStorage,
} from '@rabbithole/encrypted-storage';

import { MAX_THUMBNAIL_HEIGHT, MAX_THUMBNAIL_WIDTH } from '../constants';
import { injectCoreWorker } from '../injectors/core-worker';
import { injectEncryptedStorage } from '../injectors/encrypted-storage';
import { ENCRYPTED_STORAGE_CANISTER_ID, UPLOAD_SERVICE_TOKEN } from '../tokens';
import {
  IUploadService,
  UploadFile,
  UploadId,
  UploadServiceState,
  UploadState,
} from '../types';
import { isPhotonSupportedMimeType } from '../utils';
import { UploadRegistryService } from './upload-registry.service';

const EMPTY_STATE: UploadServiceState = {
  overallProgress: 0,
  isProcessing: false,
  files: [],
  completedCount: 0,
};

type UploadInput = {
  file: File;
  path?: string;
};

@Injectable()
export class UploadFilesService implements IUploadService {
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  encryptedStorage = injectEncryptedStorage();
  showTree = resource<string, EncryptedStorage>({
    params: () => this.encryptedStorage(),
    loader: async ({ params: encryptedStorage }) => {
      return await encryptedStorage.showTree();
    },
    defaultValue: '',
  });
  #canisterIdText = computed(() => this.canisterId.toText());
  #registry = inject(UploadRegistryService);
  state = computed<UploadServiceState>(
    () => this.#registry.getStorageState(this.#canisterIdText()) ?? EMPTY_STATE,
  );
  #coreWorkerService = injectCoreWorker();

  async add(item: UploadInput) {
    await this.addMany([item]);
  }

  async addMany(items: UploadInput[]) {
    if (items.length === 0) return;

    const storageId = this.#canisterIdText();
    const pendingItems = items.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    }));
    for (const item of pendingItems) {
      this.#registry.addUpload(storageId, {
        ...item,
        status: UploadState.NOT_STARTED,
      });
    }

    const payloads = pendingItems.map((item): UploadFile => {
      const payload: UploadFile = {
        id: item.id,
        storageId,
        file: item.file,
        config: {
          fileName: item.file.name,
          contentType: item.file.type,
        },
      };

      if (isPhotonSupportedMimeType(item.file.type)) {
        payload.offscreenCanvas = new OffscreenCanvas(
          MAX_THUMBNAIL_WIDTH,
          MAX_THUMBNAIL_HEIGHT,
        );
      }

      if (item.path) {
        payload.config.path = item.path;
      }

      return payload;
    });
    const transfer = payloads
      .map(({ offscreenCanvas }) => offscreenCanvas)
      .filter((value): value is OffscreenCanvas => value !== undefined)
      .map((value) => value as Transferable);

    if (payloads.length === 1) {
      this.#coreWorkerService.postMessage(
        { action: 'upload:add-file', payload: payloads[0] },
        transfer.length ? { transfer } : undefined,
      );
    } else {
      this.#coreWorkerService.postMessage(
        {
          action: 'upload:add-files',
          payload: {
            groupId: crypto.randomUUID(),
            files: payloads,
          },
        },
        transfer.length ? { transfer } : undefined,
      );
    }
  }

  cancel(id: UploadId) {
    this.#coreWorkerService.postMessage({
      action: 'upload:cancel',
      payload: { id },
    });
  }

  clear() {
    this.#registry.clearStorage(this.#canisterIdText());
  }


  remove(id: UploadId) {
    this.#registry.removeUpload(id);
  }

  retry(id: UploadId) {
    this.#coreWorkerService.postMessage({
      action: 'upload:retry',
      payload: { id },
    });
  }
}

export const [injectUploadFilesService, provideUploadFilesService] =
  createInjectionToken(() => inject(UPLOAD_SERVICE_TOKEN), {
    isRoot: false,
    extraProviders: [
      { provide: UPLOAD_SERVICE_TOKEN, useClass: UploadFilesService },
    ],
  });
