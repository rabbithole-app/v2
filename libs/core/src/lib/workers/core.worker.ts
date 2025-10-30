/// <reference lib="webworker" />

import { AnonymousIdentity, HttpAgent } from '@dfinity/agent';
import { type } from 'arktype';
import { isNonNull } from 'remeda';
import { defer, from, Observable, of, Subject } from 'rxjs';
import {
  catchError,
  combineLatestWith,
  filter,
  map,
  mergeMap,
  retry,
  shareReplay,
  switchMap,
  withLatestFrom,
} from 'rxjs/operators';

import { customRepeatWhen } from '../operators';
import {
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  fileIdSchema,
  UploadAsset,
  uploadAssetSchema,
  UploadFile,
  uploadFileSchema,
  UploadId,
  UploadState,
  UploadStatus,
  WorkerConfig,
  workerConfigSchema,
} from '../types';
import { loadIdentity } from '../utils';
import { AssetManager, EncryptedStorage } from '@rabbithole/encrypted-storage';

const postMessage = (message: CoreWorkerMessageOut) =>
  self.postMessage(message);

addEventListener('message', ({ data }: MessageEvent<CoreWorkerMessageIn>) => {
  switch (data.action) {
    case 'upload:add-asset': {
      const asset = uploadAssetSchema(data.payload);
      if (asset instanceof type.errors) {
        console.error(asset.summary);
        postMessage({
          action: 'upload:progress-asset',
          payload: {
            id: data.payload.id,
            status: UploadState.FAILED,
            errorMessage: asset.summary,
          },
        });
      } else {
        uploadAssets.next(asset);
      }
      break;
    }
    case 'upload:add-file': {
      const file = uploadFileSchema(data.payload);
      if (file instanceof type.errors) {
        console.error(file.summary);
        postMessage({
          action: 'upload:progress-file',
          payload: {
            id: data.payload.id,
            status: UploadState.FAILED,
            errorMessage: file.summary,
          },
        });
      } else {
        uploadFiles.next(file);
      }
      break;
    }
    case 'upload:cancel':
    case 'upload:retry': {
      const payload = fileIdSchema(data.payload);
      if (payload instanceof type.errors) {
        console.error(payload.summary);
      } else if (data.action === 'upload:cancel') {
        cancelUpload.next(payload.id);
      } else {
        retryUpload.next(payload.id);
      }
      break;
    }
    case 'worker:config': {
      const config = workerConfigSchema(data.payload);
      if (config instanceof type.errors) {
        console.error(config.summary);
      } else {
        workerConfig.next(config);
      }
      break;
    } 
    case 'worker:ping': {
      postMessage({ action: 'worker:pong' });
      break;
    }
    default:
      break;
  }
});

postMessage({ action: 'worker:init' });

const identity$ = defer(() => loadIdentity()).pipe(
  filter(isNonNull),
  retry({ delay: 500, count: 3 }),
  catchError(() => of(new AnonymousIdentity())),
  shareReplay(1),
);
const workerConfig = new Subject<WorkerConfig>();
const agent$ = identity$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  switchMap(([identity, { httpAgentOptions }]) =>
    HttpAgent.create({ ...httpAgentOptions, identity }),
  ),
  shareReplay(1),
);

const encryptedStorage$ = agent$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  map(
    ([agent, config]) =>
      new EncryptedStorage({
        agent,
        canisterId: config.canisters.encryptedStorage,
        origin: `https://${config.canisters.encryptedStorage}.localhost`,
      }),
  ),
  shareReplay(1),
);

const assetManager$ = agent$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  map(
    ([agent, config]) =>
      new AssetManager({
        agent,
        canisterId: config.canisters.encryptedStorage,
      }),
  ),
  shareReplay(1),
);

const uploadAssets = new Subject<UploadAsset>();
const uploadFiles = new Subject<UploadFile>();
const cancelUpload = new Subject<UploadId>();
const retryUpload = new Subject<UploadId>();

uploadAssets
  .asObservable()
  .pipe(
    customRepeatWhen((item) =>
      retryUpload.asObservable().pipe(filter((id) => item.id === id)),
    ),
    withLatestFrom(assetManager$),
    mergeMap(([{ id, bytes, config }, assetManager]) => {
      return new Observable<UploadStatus>((subscriber) => {
        const controller = new AbortController();
        const cancelSub = cancelUpload
          .asObservable()
          .pipe(filter((_id) => id === _id))
          .subscribe(() => {
            controller.abort();
          });
        const uploadSub = from(
          assetManager.store([
            bytes,
            {
              ...config,
              signal: controller.signal,
              onProgress: (progress) => {
                subscriber.next({
                  id,
                  ...progress,
                });
              },
            },
          ]),
        )
          .pipe(
            map(() => <UploadStatus>{ id, status: UploadState.COMPLETED }),
            catchError((err) =>
              of<UploadStatus>({
                id,
                status: UploadState.FAILED,
                errorMessage: (err as Error).message,
              }),
            ),
          )
          .subscribe({
            next: (value) => subscriber.next(value),
            complete: () => subscriber.complete(),
          });

        return () => {
          cancelSub.unsubscribe();
          uploadSub.unsubscribe();
        };
      });
    }),
  )
  .subscribe((payload) => {
    postMessage({ action: 'upload:progress-asset', payload });
  });

uploadFiles
  .asObservable()
  .pipe(
    customRepeatWhen((item) =>
      retryUpload.asObservable().pipe(filter((id) => item.id === id)),
    ),
    withLatestFrom(encryptedStorage$),
    mergeMap(([{ id, bytes, config }, encryptedStorage]) => {
      return new Observable<UploadStatus>((subscriber) => {
        const controller = new AbortController();
        const cancelSub = cancelUpload
          .asObservable()
          .pipe(filter((_id) => id === _id))
          .subscribe(() => {
            controller.abort();
          });
        const uploadSub = from(
          encryptedStorage.store([
            bytes,
            {
              ...config,
              signal: controller.signal,
              onProgress: (progress) => {
                subscriber.next({
                  id,
                  ...progress,
                });
              },
            },
          ]),
        )
          .pipe(
            map(() => <UploadStatus>{ id, status: UploadState.COMPLETED }),
            catchError((err) =>
              of<UploadStatus>({
                id,
                status: UploadState.FAILED,
                errorMessage: (err as Error).message,
              }),
            ),
          )
          .subscribe({
            next: (value) => subscriber.next(value),
            complete: () => subscriber.complete(),
          });

        return () => {
          cancelSub.unsubscribe();
          uploadSub.unsubscribe();
        };
      });
    }),
  )
  .subscribe((payload) => {
    postMessage({ action: 'upload:progress-file', payload });
  });
