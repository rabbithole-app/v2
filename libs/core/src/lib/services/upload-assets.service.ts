import { computed, inject, Injectable, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Principal } from '@dfinity/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';
import { match, P } from 'ts-pattern';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { AssetManager } from '@rabbithole/encrypted-storage';

import {
  injectAssetManager,
  injectCoreWorker,
  provideAssetManager,
} from '../injectors';
import { messageByAction } from '../operators';
import { ENCRYPTED_STORAGE_CANISTER_ID, UPLOAD_SERVICE_TOKEN } from '../tokens';
import { IUploadService, UploadAsset, UploadId, UploadState } from '../types';
import { UploadBaseService } from './upload-base.service';

@Injectable()
export class UploadAssetsService implements IUploadService {
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #assetManager = injectAssetManager();
  listPermitted = resource<Principal[], AssetManager>({
    params: () => this.#assetManager(),
    loader: async ({ params: assetManager }) =>
      await assetManager.listPermitted('Commit'),
    defaultValue: [],
  });
  #authService = inject(AUTH_SERVICE);
  hasPermission = computed(() => {
    const permitted = this.listPermitted.value().map((item) => item.toText());
    const principalId = this.#authService.principalId();

    return permitted.includes(principalId);
  });
  #uploadBaseService = inject(UploadBaseService, { self: true });
  state = this.#uploadBaseService.state;
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.workerMessage$
      .pipe(messageByAction('upload:progress-asset'), takeUntilDestroyed())
      .subscribe(({ payload }) => {
        this.#uploadBaseService.update(payload);
      });
  }

  async add(item: { file: File; path?: string }) {
    const id = crypto.randomUUID();
    this.#uploadBaseService.add({
      ...item,
      id,
      status: UploadState.NOT_STARTED,
    });
    const arrayBuffer = await item.file.arrayBuffer();
    let config = match(item.file)
      .returnType<UploadAsset['config']>()
      .with(
        {
          type: P.union('application/gzip', 'application/x-gzip', ''),
          name: P.when((name) => name.endsWith('.gz')),
        },
        ({ name }) => ({ fileName: name, contentEncoding: 'gzip' }),
      )
      .with(
        {
          type: P.union('application/octet-stream', ''),
          name: P.when((name) => name.endsWith('.br')),
        },
        ({ name }) => ({ fileName: name, contentEncoding: 'br' }),
      )
      .otherwise(({ name }) => ({ fileName: name }));

    // Add isAliased: true if file name is index.html
    if (item.file.name === 'index.html') {
      config = {
        ...config,
        isAliased: true,
      };
    }

    const payload: UploadAsset = {
      id,
      storageId: this.canisterId.toText(),
      bytes: arrayBuffer,
      config,
    };
    if (item.path) {
      payload.config.path = item.path;
    }

    this.#coreWorkerService.postMessage(
      { action: 'upload:add-asset', payload },
      { transfer: [payload.bytes] },
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

export const [injectUploadAssetsService, provideUploadAssetsService] =
  createInjectionToken(() => inject(UPLOAD_SERVICE_TOKEN), {
    isRoot: false,
    extraProviders: [
      { provide: UPLOAD_SERVICE_TOKEN, useClass: UploadAssetsService },
      UploadBaseService,
    ],
  });

export const UPLOAD_ASSETS_SERVICE_PROVIDERS = [
  { provide: UPLOAD_SERVICE_TOKEN, useClass: UploadAssetsService },
  UploadBaseService,
  provideAssetManager(),
];
