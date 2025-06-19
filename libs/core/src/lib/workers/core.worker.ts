/// <reference lib="webworker" />

import { AnonymousIdentity } from '@dfinity/agent';
import { arrayBufferToUint8Array, createAgent } from '@dfinity/utils';
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

import {
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  fileIdSchema,
  UploadFile,
  uploadFileSchema,
  UploadStatus,
  WorkerConfig,
  workerConfigSchema,
} from '../types';
import { loadIdentity } from '../utils';
import { AssetManager, getAssetsCanister } from '@rabbithole/assets';

const postMessage = (message: CoreWorkerMessageOut) =>
  self.postMessage(message);

addEventListener('message', ({ data }: MessageEvent<CoreWorkerMessageIn>) => {
  switch (data.action) {
    case 'upload:add': {
      const file = uploadFileSchema(data.payload);
      if (file instanceof type.errors) {
        console.error(file.summary);
        postMessage({
          action: 'upload:progress',
          payload: {
            id: data.payload.id,
            status: 'failed',
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
        cancelFileUpload.next(payload.id);
      } else {
        retryFileUpload.next(payload.id);
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
// const assetCanisterId = new Subject<Principal>();
// const agentParams = new Subject<Omit<CreateAgentParams, 'identity'>>();
const agent$ = identity$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  switchMap(([identity, { createAgentParams }]) =>
    createAgent({ ...createAgentParams, identity }),
  ),
  shareReplay(1),
);
const assetManagerActor$ = agent$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  map(([agent, config]) =>
    getAssetsCanister({ agent, canisterId: config.canisters.assets }),
  ),
  shareReplay(1),
);

const assetManager$ = agent$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  map(
    ([agent, config]) =>
      new AssetManager({ agent, canisterId: config.canisters.assets }),
  ),
  shareReplay(1),
);

const uploadFiles = new Subject<UploadFile>();
const cancelFileUpload = new Subject<UploadFile['id']>();
const retryFileUpload = new Subject<UploadFile['id']>();

uploadFiles
  .asObservable()
  .pipe(
    withLatestFrom(assetManager$),
    mergeMap(([{ id, bytes, config }, assetManager]) => {
      return new Observable<UploadStatus>((subscriber) => {
        subscriber.next({ id, status: 'calchash' });
        const sub = from(crypto.subtle.digest('SHA-256', bytes))
          .pipe(
            map(arrayBufferToUint8Array),
            switchMap((sha256) =>
              assetManager.store(bytes, {
                ...config,
                sha256,
                onProgress: (progress) => {
                  subscriber.next({ id, status: 'processing', ...progress });
                },
              }),
            ),
            map((key) => <UploadStatus>{ id, status: 'done' }),
            catchError((err) =>
              of<UploadStatus>({
                id,
                status: 'failed',
                errorMessage: (err as Error).message,
              }),
            ),
          )
          .subscribe((value) => subscriber.next(value));

        return () => sub.unsubscribe();
      });
    }),
  )
  .subscribe((payload) => {
    postMessage({ action: 'upload:progress', payload });
  });
