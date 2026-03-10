import { computed, inject, Injectable, resource } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { isDeepEqual, isNonNullish } from 'remeda';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  EncryptedStorage,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';

import { MAX_THUMBNAIL_HEIGHT, MAX_THUMBNAIL_WIDTH } from '../constants';
import { injectCoreWorker, injectEncryptedStorage } from '../injectors';
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

@Injectable()
export class UploadFilesService implements IUploadService {
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  encryptedStorage = injectEncryptedStorage();
  listPermitted = resource<StoragePermissionItem[], EncryptedStorage>({
    params: () => this.encryptedStorage(),
    loader: async ({ params: encryptedStorage }) =>
      await encryptedStorage.listPermitted(),
    defaultValue: [],
    equal: isDeepEqual,
  });
  #authService = inject(AUTH_SERVICE);
  hasPermission = computed(() => {
    const permitted = this.listPermitted.value();
    const principalId = this.#authService.principalId();
    return isNonNullish(permitted.find((item) => item.user === principalId));
  });
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

  async add(item: {
    encryptionMode?: 'Encrypted' | 'Plaintext';
    file: File;
    path?: string;
  }) {
    const id = crypto.randomUUID();
    // Add file to registry with initial parameters
    this.#registry.addUpload(this.#canisterIdText(), {
      ...item,
      id,
      status: UploadState.NOT_STARTED,
    });

    const arrayBuffer = await item.file.arrayBuffer();
    const payload: UploadFile = {
      id,
      storageId: this.#canisterIdText(),
      bytes: arrayBuffer,
      config: {
        fileName: item.file.name,
        contentType: item.file.type,
        ...(item.encryptionMode && { encryptionMode: item.encryptionMode }),
      },
    };

    // If the file is an image, create an offscreenCanvas
    if (isPhotonSupportedMimeType(item.file.type)) {
      payload.offscreenCanvas = new OffscreenCanvas(
        MAX_THUMBNAIL_WIDTH,
        MAX_THUMBNAIL_HEIGHT,
      );
    }

    // Add path if present
    if (item.path) {
      payload.config.path = item.path;
    }

    // If we have an offscreenCanvas, add it to the transfer list
    const transferList: Transferable[] = [payload.bytes];
    if (payload.offscreenCanvas) {
      transferList.push(payload.offscreenCanvas as Transferable);
    }

    // Send message to coreWorker
    this.#coreWorkerService.postMessage(
      { action: 'upload:add-file', payload },
      { transfer: transferList },
    );
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

  reloadPermissions() {
    this.listPermitted.reload();
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
