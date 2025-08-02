/// <reference lib="webworker" />

import { AnonymousIdentity, HttpAgent } from '@dfinity/agent';
import { type } from 'arktype';
import { isNonNull } from 'remeda';
import { defer, from, Observable, of, ReplaySubject, Subject } from 'rxjs';
import {
  audit,
  catchError,
  combineLatestWith,
  connect,
  filter,
  map,
  mergeMap,
  mergeWith,
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
  switchMap(([identity, { httpAgentOptions }]) =>
    HttpAgent.create({ ...httpAgentOptions, identity }),
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
    // some logic for retry upload
    connect(
      (shared) =>
        shared.pipe(
          mergeWith(
            shared.pipe(
              audit((item) =>
                retryFileUpload
                  .asObservable()
                  .pipe(filter((id) => item.id === id)),
              ),
            ),
          ),
        ),
      {
        connector: () => new ReplaySubject(1),
      },
    ),
    withLatestFrom(assetManager$),
    mergeMap(([{ id, bytes, config }, assetManager]) => {
      return new Observable<UploadStatus>((subscriber) => {
        const controller = new AbortController();
        const cancelSub = cancelFileUpload
          .asObservable()
          .pipe(filter((_id) => id === _id))
          .subscribe(() => {
            controller.abort();
          });
        subscriber.next({ id, status: 'calchash' });
        const uploadSub = from(
          assetManager.store(bytes, {
            ...config,
            signal: controller.signal,
            onProgress: (progress) => {
              subscriber.next({ id, status: 'processing', ...progress });
            },
          }),
        )
          .pipe(
            map(() => <UploadStatus>{ id, status: 'done' }),
            catchError((err) =>
              of<UploadStatus>({
                id,
                status: 'failed',
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
    postMessage({ action: 'upload:progress', payload });
  });
