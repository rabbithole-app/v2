import { computed, effect, inject, Injectable, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { isDeepEqual, isNonNullish } from 'remeda';

import { MAX_THUMBNAIL_HEIGHT, MAX_THUMBNAIL_WIDTH } from '../constants';
import { injectCoreWorker, injectEncryptedStorage } from '../injectors';
import { messageByAction } from '../operators';
import { UPLOAD_SERVICE_TOKEN } from '../tokens';
import { IUploadService, UploadFile, UploadId, UploadState } from '../types';
import { isPhotonSupportedMimeType } from '../utils';
import { UploadBaseService } from './upload-base.service';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  EncryptedStorage,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';

@Injectable()
export class UploadFilesService implements IUploadService {
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
  #uploadBaseService = inject(UploadBaseService, { self: true });
  state = this.#uploadBaseService.state;
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.workerMessage$
      .pipe(messageByAction('upload:progress-file'), takeUntilDestroyed())
      .subscribe(({ payload }) => {
        this.#uploadBaseService.update(payload);
      });

    effect(() => console.log(this.listPermitted.value()));
    effect(() => console.log(this.showTree.value()));
  }

  async add(item: { file: File; path?: string }) {
    const id = crypto.randomUUID();
    // Add file to state with initial parameters
    this.#uploadBaseService.add({
      ...item,
      id,
      status: UploadState.NOT_STARTED,
    });

    const arrayBuffer = await item.file.arrayBuffer();
    const payload: UploadFile = {
      id,
      bytes: arrayBuffer,
      config: {
        fileName: item.file.name,
        contentType: item.file.type,
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
    this.#uploadBaseService.clear();
  }

  reloadPermissions() {
    this.listPermitted.reload();
  }

  remove(id: UploadId) {
    this.#uploadBaseService.remove(id);
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
      UploadBaseService,
    ],
  });
