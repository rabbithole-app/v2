/// <reference lib="webworker" />

import { arrayBufferToUint8Array } from '@dfinity/utils';
import { AnonymousIdentity, HttpAgent, uint8ToBuf } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import photonInit, { crop, PhotonImage, resize } from '@silvia-odwyer/photon';
import { type } from 'arktype';
import { Zip, ZipPassThrough } from 'fflate';
import {
    defer,
    EMPTY,
    from,
    Observable,
    of,
    ReplaySubject,
    Subject,
    Subscriber,
    Subscription,
} from 'rxjs';
import {
    audit,
    catchError,
    combineLatestWith,
    filter,
    map,
    mergeMap,
    retry,
    scan,
    shareReplay,
    startWith,
    switchMap,
    take,
    withLatestFrom,
} from 'rxjs/operators';
import { match, P } from 'ts-pattern';

import type { ThumbnailEncryptionRef } from '@rabbithole/declarations/encrypted-storage';
import {
    AssetManager,
    EncryptedStorage,
    Entry,
    StorageThumbnailRef,
    uint8ArrayToArrayBuffer,
} from '@rabbithole/encrypted-storage';

import {
    MAX_AVATAR_HEIGHT,
    MAX_AVATAR_WIDTH,
    MAX_THUMBNAIL_HEIGHT,
    MAX_THUMBNAIL_WIDTH,
} from '../constants/images';
import { repeatItemWhen } from '../operators';
import {
    ArchiveDownloadProgress,
    ArchiveDownloadRequest,
    archiveDownloadRequestSchema,
    CoreWorkerMessageIn,
    CoreWorkerMessageOut,
    downloadCancelSchema,
    DownloadProgress,
    DownloadRequest,
    downloadRequestSchema,
    fileIdSchema,
    ImageCropPayload,
    imageCropSchema,
    principalSchema,
    PrincipalString,
    ThumbnailRewrapRequest,
    thumbnailRewrapRequestSchema,
    UploadAsset,
    uploadAssetSchema,
    UploadFile,
    uploadFileBatchSchema,
    uploadFileSchema,
    UploadId,
    UploadState,
    UploadStatus,
    WorkerConfig,
    workerConfigSchema,
} from '../types';
import {
    isPhotonSupportedMimeType,
    loadIdentity,
    parseCanisterRejectError,
} from '../utils';

const postMessage = (message: CoreWorkerMessageOut, transfer?: Transferable[]) =>
  transfer ? self.postMessage(message, transfer) : self.postMessage(message);
const ANONYMOUS_PRINCIPAL_ID = Principal.anonymous().toText();
const WORKER_IDENTITY_UNAVAILABLE_MESSAGE =
  'Your signed-in session is not available to uploads. Sign out and sign in again, then retry.';
const MAX_THUMBNAIL_SOURCE_BYTES = 64 * 1024 * 1024;
const DEFAULT_CONCURRENT_UPLOADS = 3;

type EncryptedStorageWorkerInstance = {
  assetManager: AssetManager;
  encryptedStorage: EncryptedStorage;
  principalId: string;
};

// Initialize WASM module - required for worker context
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        // Use absolute path as import.meta.url in dev points to source file
        await photonInit({ module_or_path: '/photon_rs_bg.wasm' });
        wasmInitialized = true;
      } catch (error) {
        wasmInitPromise = null;
        throw error;
      }
    })();
  }

  return wasmInitPromise;
}

addEventListener('message', ({ data }: MessageEvent<CoreWorkerMessageIn>) => {
  switch (data.action) {
    case 'download:archive': {
      const request = archiveDownloadRequestSchema(data.payload);
      if (request instanceof type.errors) {
        console.error(request.summary);
      } else {
        archiveDownloads.next(request);
      }
      break;
    }
    case 'download:cancel': {
      const payload = downloadCancelSchema(data.payload);
      if (payload instanceof type.errors) {
        console.error(payload.summary);
      } else {
        cancelDownload.next(payload.id);
      }
      break;
    }
    case 'download:start': {
      const request = downloadRequestSchema(data.payload);
      if (request instanceof type.errors) {
        console.error(request.summary);
      } else {
        downloadFiles.next(request);
      }
      break;
    }
    case 'image:crop': {
      const imageCropData = imageCropSchema(data.payload);
      if (imageCropData instanceof type.errors) {
        console.error(imageCropData.summary);
        postMessage({
          action: 'image:crop-failed',
          payload: {
            id: data.payload.id,
            errorMessage: imageCropData.summary,
          },
        });
      } else if (!(imageCropData.offscreenCanvas instanceof OffscreenCanvas)) {
        postMessage({
          action: 'image:crop-failed',
          payload: {
            id: data.payload.id,
            errorMessage:
              'offscreenCanvas must be an instance of OffscreenCanvas',
          },
        });
      } else {
        imageCrop.next({
          ...imageCropData,
          offscreenCanvas: imageCropData.offscreenCanvas as OffscreenCanvas,
        });
      }
      break;
    }
    case 'thumbnail:rewrap': {
      const request = thumbnailRewrapRequestSchema(data.payload);
      if (request instanceof type.errors) {
        console.error(request.summary);
      } else {
        rewrapThumbnails.next(request);
      }
      break;
    }
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
      } else if (!(file.file instanceof File)) {
        postMessage({
          action: 'upload:progress-file',
          payload: {
            id: data.payload.id,
            status: UploadState.FAILED,
            errorMessage: 'file must be an instance of File',
          },
        });
      } else if (
        file.offscreenCanvas !== undefined &&
        !(file.offscreenCanvas instanceof OffscreenCanvas)
      ) {
        // offscreenCanvas is optional for upload:add-file, but if provided must be OffscreenCanvas
        postMessage({
          action: 'upload:progress-file',
          payload: {
            id: data.payload.id,
            status: UploadState.FAILED,
            errorMessage:
              'offscreenCanvas must be an instance of OffscreenCanvas',
          },
        });
      } else {
        uploadFiles.next({
          ...file,
          file: file.file as File,
          offscreenCanvas: file.offscreenCanvas as OffscreenCanvas,
        });
      }
      break;
    }
    case 'upload:add-files': {
      const batch = uploadFileBatchSchema(data.payload);
      if (batch instanceof type.errors) {
        console.error(batch.summary);
        for (const file of data.payload.files ?? []) {
          postMessage({
            action: 'upload:progress-file',
            payload: {
              id: file.id,
              status: UploadState.FAILED,
              errorMessage: batch.summary,
            },
          });
        }
      } else {
        const files: UploadFile[] = [];
        for (const file of batch.files) {
          if (!(file.file instanceof File)) {
            postMessage({
              action: 'upload:progress-file',
              payload: {
                id: file.id,
                status: UploadState.FAILED,
                errorMessage: 'file must be an instance of File',
              },
            });
            continue;
          }
          if (
            file.offscreenCanvas !== undefined &&
            !(file.offscreenCanvas instanceof OffscreenCanvas)
          ) {
            postMessage({
              action: 'upload:progress-file',
              payload: {
                id: file.id,
                status: UploadState.FAILED,
                errorMessage:
                  'offscreenCanvas must be an instance of OffscreenCanvas',
              },
            });
            continue;
          }
          files.push({
            ...file,
            uploadGroupId: batch.groupId,
            file: file.file as File,
            offscreenCanvas: file.offscreenCanvas as OffscreenCanvas,
          });
        }
        if (files.length > 0) {
          registerUploadGroup(batch.groupId, files);
          for (const file of files) {
            uploadFiles.next(file);
          }
        }
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
    case 'worker:auth-sync': {
      identityRefresh.next();
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
    case 'worker:init-storage': {
      const payload = principalSchema(data.payload);
      if (payload instanceof type.errors) {
        console.error(payload.summary);
      } else {
        encryptedStorage.next(payload);
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

const identityRefresh = new Subject<void>();
const identity$ = identityRefresh.pipe(
  startWith(undefined),
  switchMap(() =>
    defer(async () => {
      const identity = await loadIdentity();
      if (!identity || identity.getPrincipal().isAnonymous()) {
        throw new Error(WORKER_IDENTITY_UNAVAILABLE_MESSAGE);
      }
      return identity;
    }).pipe(
      retry({ delay: 500, count: 3 }),
      catchError((error) => {
        console.error('[worker:auth-sync] identity unavailable', error);
        return of(new AnonymousIdentity());
      }),
    ),
  ),
  shareReplay(1),
);
const workerConfig = new ReplaySubject<WorkerConfig>(1);
const agent$ = identity$.pipe(
  combineLatestWith(workerConfig.asObservable()),
  switchMap(([identity, { httpAgentOptions }]) =>
    HttpAgent.create({ ...httpAgentOptions, identity }).then((agent) => ({
      agent,
      principalId: identity.getPrincipal().toText(),
    })),
  ),
  shareReplay(1),
);
const encryptedStorage = new ReplaySubject<PrincipalString>(1);
const encryptedStorageInstances$ = encryptedStorage.asObservable().pipe(
  combineLatestWith(agent$, workerConfig.asObservable()),
  scan((acc, [canisterId, { agent, principalId }, config]) => {
    const encryptedStorage = new EncryptedStorage({
      agent,
      canisterId,
      origin: `https://${canisterId}.localhost`,
      blobStorageGatewayUrl: config.blobStorageGatewayUrl,
      storageBackend: config.storageBackend,
    });
    const assetManager = new AssetManager({
      agent,
      canisterId,
    });
    acc.set(canisterId, { encryptedStorage, assetManager, principalId });
    return acc;
  }, new Map<PrincipalString, EncryptedStorageWorkerInstance>()),
  shareReplay(1),
);

const uploadAssets = new Subject<UploadAsset>();
const uploadFiles = new Subject<UploadFile>();
const cancelUpload = new Subject<UploadId>();
const retryUpload = new Subject<UploadId>();
const downloadFiles = new Subject<DownloadRequest>();
const archiveDownloads = new Subject<ArchiveDownloadRequest>();
const cancelDownload = new Subject<string>();
const imageCrop = new Subject<ImageCropPayload>();
const rewrapThumbnails = new Subject<ThumbnailRewrapRequest>();
const uploadTargetLocks = new Map<string, Promise<void>>();
const uploadGroupSetups = new Map<string, {
  files: UploadFile[];
  promise?: Promise<void>;
  remainingIds: Set<string>;
}>();

function getEncryptedStorageInstance(
  instancesMap: Map<PrincipalString, EncryptedStorageWorkerInstance>,
  storageId: PrincipalString,
) {
  const instance = instancesMap.get(storageId);
  if (!instance) {
    throw new Error(
      `Encrypted storage instance not found for storageId: ${storageId}`,
    );
  }
  return instance;
}

function getUploadGroupPreflight(
  item: UploadFile,
  encryptedStorage: EncryptedStorage,
): Promise<void> | undefined {
  const groupId = item.uploadGroupId;
  if (!groupId) return undefined;

  const setup = uploadGroupSetups.get(groupId);
  if (!setup) return undefined;

  setup.promise ??= encryptedStorage.preflightBlobStorageUploads(
    setup.files.map((file) => ({
      entry: uploadEntry(file),
      sourceSize: file.file.size,
    })),
  );

  return setup.promise;
}

function registerUploadGroup(groupId: string, files: UploadFile[]) {
  uploadGroupSetups.set(groupId, {
    files,
    remainingIds: new Set(files.map(({ id }) => id)),
  });
}

function releaseUploadGroupItem(item: UploadFile) {
  const groupId = item.uploadGroupId;
  if (!groupId) return;

  const setup = uploadGroupSetups.get(groupId);
  if (!setup) return;

  setup.remainingIds.delete(item.id);
  if (setup.remainingIds.size === 0) {
    uploadGroupSetups.delete(groupId);
  }
}

function uploadEntry(item: UploadFile): Entry {
  return [
    'File',
    [item.config.path ?? '', item.config.fileName].filter(Boolean).join('/'),
  ];
}

function uploadTargetKey(item: UploadFile): string {
  const path = item.config.path?.replace(/^\/+|\/+$/g, '') ?? '';
  return [item.storageId, path, item.config.fileName].join('/');
}

function waitForEncryptedStorageInstance(
  storageId: PrincipalString,
): Observable<EncryptedStorageWorkerInstance> {
  return encryptedStorageInstances$.pipe(
    map((instancesMap) => instancesMap.get(storageId)),
    filter(
      (instance): instance is EncryptedStorageWorkerInstance =>
        instance !== undefined,
    ),
    take(1),
  );
}

async function withUploadTargetLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = uploadTargetLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  uploadTargetLocks.set(key, next);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (uploadTargetLocks.get(key) === next) {
      uploadTargetLocks.delete(key);
    }
  }
}

uploadAssets.asObservable().pipe(
  repeatItemWhen((item) =>
    retryUpload.asObservable().pipe(filter((id) => item.id === id)),
  ),
  mergeMap((item) =>
    waitForEncryptedStorageInstance(item.storageId).pipe(
      map((instance) => ({ item, instance })),
    ),
  ),
  mergeMap(({ item: { id, bytes, config }, instance }) => {
        const { assetManager, principalId } = instance;
        if (principalId === ANONYMOUS_PRINCIPAL_ID) {
          return of<UploadStatus>({
            id,
            status: UploadState.FAILED,
            errorMessage: WORKER_IDENTITY_UNAVAILABLE_MESSAGE,
          });
        }

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
                  errorMessage: parseCanisterRejectError(err) ?? 'Unknown error',
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
      }, DEFAULT_CONCURRENT_UPLOADS),
).subscribe((payload) => {
  postMessage({ action: 'upload:progress-asset', payload });
});

function postFileUploadProgress(payload: UploadStatus) {
  postMessage({ action: 'upload:progress-file', payload });
}

function uploadErrorMessage(error: unknown) {
  return parseCanisterRejectError(error) ??
    (error instanceof Error ? error.message : 'Unknown error');
}

uploadFiles.asObservable().pipe(
  repeatItemWhen((item) =>
    retryUpload.asObservable().pipe(filter((id) => item.id === id)),
  ),
  mergeMap((item) =>
    waitForEncryptedStorageInstance(item.storageId).pipe(
      map((instance) => ({ item, instance })),
    ),
  ),
  mergeMap(
    ({ item, instance }) => {
      const { id, file, config, offscreenCanvas } = item;
      const { encryptedStorage, principalId } = instance;
      if (principalId === ANONYMOUS_PRINCIPAL_ID) {
        return of<UploadStatus>({
          id,
          status: UploadState.FAILED,
          errorMessage: WORKER_IDENTITY_UNAVAILABLE_MESSAGE,
        });
      }

      return new Observable<UploadStatus>((subscriber) => {
        const controller = new AbortController();
        const cancelSub = cancelUpload
          .asObservable()
          .pipe(filter((_id) => id === _id))
          .subscribe(() => {
            controller.abort();
          });
        const created = new ReplaySubject<boolean>();
        let thumbnailSub: Subscription | undefined;

        if (
          isPhotonSupportedMimeType(config.contentType) &&
          offscreenCanvas &&
          file.size <= MAX_THUMBNAIL_SOURCE_BYTES
        ) {
          const entry: Entry = [
            'File',
            [config.path ?? '', config.fileName].join('/'),
          ];
          thumbnailSub = from(
            file.arrayBuffer().then((bytes) => processImageThumbnail({
              bytes,
              imageType: config.contentType as string,
              offscreenCanvas,
            })),
          )
            .pipe(
              audit(() => created.asObservable().pipe(filter((v) => v))),
              switchMap((blob) =>
                encryptedStorage.saveThumbnail(entry, blob),
              ),
              catchError((error) => {
                console.warn('Failed to save encrypted thumbnail', error);
                return EMPTY;
              }),
            )
            .subscribe((value) => {
              const thumbnailRef = match(value)
                .with(
                  {
                    metadata: {
                      File: { thumbnailRef: [P.select()] },
                    },
                  },
                  (v) => v,
                )
                .otherwise(() => undefined);
              postMessage({
                action: 'upload:thumbnail',
                payload: { id, thumbnailRef },
              });
            });
        }

        const uploadSub = from(
          withUploadTargetLock(uploadTargetKey(item), async () => {
            try {
              return await encryptedStorage.store([
                file,
                {
                  ...config,
                  blobStoragePreflight: getUploadGroupPreflight(item, encryptedStorage),
                  signal: controller.signal,
                  onProgress: (progress) => {
                    if (progress.status === UploadState.IN_PROGRESS) {
                      created.next(true);
                    }
                    subscriber.next({
                      id,
                      ...progress,
                    });
                  },
                },
              ]);
            } finally {
              releaseUploadGroupItem(item);
            }
          }),
        )
          .pipe(
            map(() => <UploadStatus>{ id, status: UploadState.COMPLETED }),
            catchError((err) =>
              of<UploadStatus>(
                controller.signal.aborted
                  ? { id, status: UploadState.CANCELED }
                  : {
                    id,
                    status: UploadState.FAILED,
                    errorMessage: uploadErrorMessage(err),
                  },
              ),
            ),
          )
          .subscribe({
            next: (value) => subscriber.next(value),
            complete: () => subscriber.complete(),
          });

        return () => {
          cancelSub.unsubscribe();
          uploadSub.unsubscribe();
          thumbnailSub?.unsubscribe();
        };
      });
    },
    DEFAULT_CONCURRENT_UPLOADS,
  ),
).subscribe((payload) => {
  postFileUploadProgress(payload);
});

function optionalBytes(value?: number[]): [] | [Uint8Array] {
  return value ? [new Uint8Array(value)] : [];
}

async function processThumbnailRewrap(
  encryptedStorage: EncryptedStorage,
  request: ThumbnailRewrapRequest,
) {
  await encryptedStorage.rewrapThumbnail(
    request.entry,
    toStorageThumbnailRef(request.thumbnailRef),
  );
}

function toStorageThumbnailRef(ref: ThumbnailRewrapRequest['thumbnailRef']): StorageThumbnailRef {
  const encryption: ThumbnailEncryptionRef = {
    scopeKeyId: [
      Principal.fromText(ref.encryption.scopeKeyId[0]),
      new Uint8Array(ref.encryption.scopeKeyId[1]),
    ],
    wrappedKey: new Uint8Array(ref.encryption.wrappedKey),
    blobIv: new Uint8Array(ref.encryption.blobIv),
    algorithm: ref.encryption.algorithm,
  };

  if (ref.storageBackend === 'OnChain') {
    return {
      OnChain: {
        key: ref.key,
        sha256: optionalBytes(ref.sha256),
        contentType: ref.contentType,
        size: BigInt(ref.size),
        encryption,
      },
    };
  }

  return {
    BlobStorage: {
      rootHash: ref.rootHash,
      blobId: new TextEncoder().encode(ref.rootHash),
      sha256: optionalBytes(ref.sha256),
      contentType: ref.contentType,
      size: BigInt(ref.size),
      encryption,
    },
  };
}

workerConfig.pipe(
  take(1),
  switchMap((wc) =>
    rewrapThumbnails.asObservable().pipe(
      mergeMap(
        (request) =>
          encryptedStorageInstances$.pipe(
            take(1),
            switchMap((instancesMap) => {
              try {
                const { encryptedStorage, principalId } = getEncryptedStorageInstance(
                  instancesMap,
                  request.storageId,
                );
                if (principalId === ANONYMOUS_PRINCIPAL_ID) {
                  console.error('[thumbnail:rewrap] identity unavailable');
                  return EMPTY;
                }

                return from(processThumbnailRewrap(encryptedStorage, request)).pipe(
                  catchError((error) => {
                    console.error('[thumbnail:rewrap] failed', error);
                    return EMPTY;
                  }),
                );
              } catch (error) {
                console.error('[thumbnail:rewrap] failed', error);
                return EMPTY;
              }
            }),
          ),
        wc.concurrentThumbnailRewraps ?? 2,
      ),
    ),
  ),
).subscribe();

// Download pipeline
async function processDownload(
  encryptedStorage: EncryptedStorage,
  request: DownloadRequest,
  controller: AbortController,
  subscriber: Subscriber<CoreWorkerMessageOut>,
) {
  try {
    const stream = encryptedStorage.downloadStream(request.entry, {
      totalChunks: request.totalChunks,
      storageBackend: request.storageBackend,
      keyId: request.keyId
        ? [Principal.fromText(request.keyId[0]), new Uint8Array(request.keyId[1])]
        : undefined,
      signal: controller.signal,
      onProgress: (chunkIndex, totalChunks) => {
        subscriber.next({
          action: 'download:progress',
          payload: { id: request.id, chunkIndex, totalChunks, status: 'downloading' } satisfies DownloadProgress,
        });
      },
    });

    let chunkIndex = 0;
    for await (const chunk of stream) {
      subscriber.next({
        action: 'download:chunk',
        payload: {
          id: request.id,
          chunk: uint8ArrayToArrayBuffer(chunk),
          chunkIndex,
          totalChunks: request.totalChunks,
          fileName: request.fileName,
          contentType: request.contentType ?? 'application/octet-stream',
        },
      });
      chunkIndex++;
    }

    subscriber.next({
      action: 'download:progress',
      payload: { id: request.id, status: 'completed' },
    });
  } catch (err) {
    subscriber.next({
      action: 'download:progress',
      payload: controller.signal.aborted
        ? { id: request.id, status: 'canceled' }
        : { id: request.id, status: 'failed', errorMessage: parseCanisterRejectError(err) ?? 'Unknown error' },
    });
  } finally {
    subscriber.complete();
  }
}

workerConfig.pipe(
  take(1),
  switchMap((wc) =>
    downloadFiles.asObservable().pipe(
      withLatestFrom(encryptedStorageInstances$),
      mergeMap(
        ([request, instancesMap]) => {
          const { encryptedStorage } = getEncryptedStorageInstance(instancesMap, request.storageId);
          return new Observable<CoreWorkerMessageOut>((subscriber) => {
            const controller = new AbortController();
            const cancelSub = cancelDownload
              .asObservable()
              .pipe(filter((id) => id === request.id))
              .subscribe(() => controller.abort());

            processDownload(encryptedStorage, request, controller, subscriber);

            return () => {
              cancelSub.unsubscribe();
              controller.abort();
            };
          });
        },
        wc.concurrentDownloads,
      ),
    ),
  ),
).subscribe((message) => {
  if (message.action === 'download:chunk') {
    postMessage(message, [message.payload.chunk]);
  } else {
    postMessage(message);
  }
});

// Archive download pipeline
async function processArchiveDownload(
  encryptedStorage: EncryptedStorage,
  request: ArchiveDownloadRequest,
  controller: AbortController,
  subscriber: Subscriber<CoreWorkerMessageOut>,
) {
  try {
    const zip = new Zip((err, data, _final) => {
      if (err) {
        subscriber.next({
          action: 'download:archive-progress',
          payload: { id: request.id, status: 'failed', errorMessage: err.message } satisfies ArchiveDownloadProgress,
        });
        return;
      }
      const buf = uint8ArrayToArrayBuffer(data);
      subscriber.next({
        action: 'download:archive-chunk',
        payload: { id: request.id, chunk: buf },
      });
    });

    for (let i = 0; i < request.files.length; i++) {
      if (controller.signal.aborted) throw new Error('Canceled');
      const file = request.files[i];

      subscriber.next({
        action: 'download:archive-progress',
        payload: {
          id: request.id,
          status: 'downloading',
          currentFileIndex: i,
          totalFiles: request.files.length,
          currentFileName: file.fileName,
        } satisfies ArchiveDownloadProgress,
      });

      const entry = new ZipPassThrough(file.fileName);
      zip.add(entry);

      const stream = encryptedStorage.downloadStream(file.entry, {
        totalChunks: file.totalChunks,
        storageBackend: file.storageBackend,
        keyId: file.keyId
          ? [Principal.fromText(file.keyId[0]), new Uint8Array(file.keyId[1])]
          : undefined,
        signal: controller.signal,
      });

      for await (const chunk of stream) {
        entry.push(chunk, false);
      }
      entry.push(new Uint8Array(), true);
    }

    zip.end();

    subscriber.next({
      action: 'download:archive-progress',
      payload: { id: request.id, status: 'completed' } satisfies ArchiveDownloadProgress,
    });
  } catch (err) {
    subscriber.next({
      action: 'download:archive-progress',
      payload: controller.signal.aborted
        ? { id: request.id, status: 'canceled' } satisfies ArchiveDownloadProgress
        : { id: request.id, status: 'failed', errorMessage: parseCanisterRejectError(err) ?? 'Unknown error' } satisfies ArchiveDownloadProgress,
    });
  } finally {
    subscriber.complete();
  }
}

workerConfig.pipe(
  take(1),
  switchMap(() =>
    archiveDownloads.asObservable().pipe(
      withLatestFrom(encryptedStorageInstances$),
      mergeMap(
        ([request, instancesMap]) => {
          const { encryptedStorage } = getEncryptedStorageInstance(instancesMap, request.storageId);
          return new Observable<CoreWorkerMessageOut>((subscriber) => {
            const controller = new AbortController();
            const cancelSub = cancelDownload
              .asObservable()
              .pipe(filter((id) => id === request.id))
              .subscribe(() => controller.abort());

            processArchiveDownload(encryptedStorage, request, controller, subscriber);

            return () => {
              cancelSub.unsubscribe();
              controller.abort();
            };
          });
        },
        1,
      ),
    ),
  ),
).subscribe((message) => {
  if (message.action === 'download:archive-chunk') {
    postMessage(message, [message.payload.chunk]);
  } else {
    postMessage(message);
  }
});

imageCrop
  .asObservable()
  .pipe(
    mergeMap((payload) =>
      from(processImageCrop(payload)).pipe(
        switchMap((blob) => blob.arrayBuffer()),
        map(
          (bytes) =>
            <CoreWorkerMessageOut>{
              action: 'image:crop-done',
              payload: {
                id: payload.id,
                bytes,
                imageType: payload.imageType,
              },
            },
        ),
        catchError((error) =>
          of<CoreWorkerMessageOut>({
            action: 'image:crop-failed',
            payload: {
              id: payload.id,
              errorMessage: (error as Error)?.message ?? 'Unknown error',
            },
          }),
        ),
      ),
    ),
  )
  .subscribe((message) => {
    postMessage(message);
  });

async function photonImageToBlob({
  photonImage,
  imageType,
  offscreenCanvas,
}: {
  imageType: string;
  offscreenCanvas: OffscreenCanvas;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  photonImage: any;
}) {
  if (['image/gif', 'image/png'].includes(imageType)) {
    const ctx = offscreenCanvas.getContext('2d');
    const imageData = photonImage.get_image_data();
    offscreenCanvas.width = imageData.width;
    offscreenCanvas.height = imageData.height;
    ctx?.putImageData(imageData, 0, 0);
    return await offscreenCanvas.convertToBlob();
  } else {
    const data = photonImage.get_bytes_jpeg(90);
    return new Blob([uint8ToBuf(data)], { type: imageType });
  }
}

async function processImageCrop({
  bytes,
  imageType,
  cropper,
  offscreenCanvas,
}: ImageCropPayload) {
  await ensureWasmInitialized();

  let photonImage = PhotonImage.new_from_byteslice(
    arrayBufferToUint8Array(bytes),
  );
  const [width, height] = [photonImage.get_width(), photonImage.get_height()];
  // Coordinates are already converted to original image size in the component
  let x1 = cropper.position.x1;
  let y1 = cropper.position.y1;
  let x2 = cropper.position.x2;
  let y2 = cropper.position.y2;

  // Validate and clamp coordinates to image boundaries
  x1 = Math.max(0, Math.min(x1, width - 1));
  y1 = Math.max(0, Math.min(y1, height - 1));
  x2 = Math.max(0, Math.min(x2, width - 1));
  y2 = Math.max(0, Math.min(y2, height - 1));

  // Ensure x1 < x2 and y1 < y2
  if (x1 >= x2) {
    if (x1 === x2) {
      x2 = Math.min(x1 + 1, width - 1);
    } else {
      [x1, x2] = [x2, x1];
    }
  }
  if (y1 >= y2) {
    if (y1 === y2) {
      y2 = Math.min(y1 + 1, height - 1);
    } else {
      [y1, y2] = [y2, y1];
    }
  }

  photonImage = crop(photonImage, x1, y1, x2, y2);
  // Resize to avatar size (512x512) only if the cropped image is larger than the max
  const [croppedWidth, croppedHeight] = [
    photonImage.get_width(),
    photonImage.get_height(),
  ];
  if (croppedWidth > MAX_AVATAR_WIDTH || croppedHeight > MAX_AVATAR_HEIGHT) {
    photonImage = resize(photonImage, MAX_AVATAR_WIDTH, MAX_AVATAR_HEIGHT, 5);
  }
  return photonImageToBlob({
    photonImage,
    imageType,
    offscreenCanvas,
  });
}

async function processImageThumbnail({
  bytes,
  imageType,
  offscreenCanvas,
}: {
  bytes: ArrayBuffer;
  imageType: string;
  offscreenCanvas: OffscreenCanvas;
}) {
  await ensureWasmInitialized();
  let photonImage = PhotonImage.new_from_byteslice(
    arrayBufferToUint8Array(bytes),
  );
  const [width, height] = [photonImage.get_width(), photonImage.get_height()];
  const ratio = Math.min(
    MAX_THUMBNAIL_WIDTH / width,
    MAX_THUMBNAIL_HEIGHT / height,
  );
  if (ratio < 1) {
    const newWidth = width * ratio;
    const newHeight = height * ratio;
    photonImage = resize(photonImage, newWidth, newHeight, 5);
  }
  return photonImageToBlob({
    photonImage,
    imageType,
    offscreenCanvas,
  });
}
