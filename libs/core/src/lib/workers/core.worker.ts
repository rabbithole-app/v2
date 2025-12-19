/// <reference lib="webworker" />

import { AnonymousIdentity, HttpAgent, uint8ToBuf } from '@icp-sdk/core/agent';
import { arrayBufferToUint8Array } from '@dfinity/utils';
import photonInit, { crop, PhotonImage, resize } from '@silvia-odwyer/photon';
import { type } from 'arktype';
import { isNonNull } from 'remeda';
import {
  defer,
  EMPTY,
  from,
  Observable,
  of,
  ReplaySubject,
  Subject,
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
  switchMap,
  withLatestFrom,
} from 'rxjs/operators';
import { match, P } from 'ts-pattern';

import {
  MAX_AVATAR_HEIGHT,
  MAX_AVATAR_WIDTH,
  MAX_THUMBNAIL_HEIGHT,
  MAX_THUMBNAIL_WIDTH,
} from '../constants/images';
import { customRepeatWhen } from '../operators';
import {
  CoreWorkerMessageIn,
  CoreWorkerMessageOut,
  fileIdSchema,
  ImageCropPayload,
  imageCropSchema,
  principalSchema,
  PrincipalString,
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
import {
  isPhotonSupportedMimeType,
  loadIdentity,
  parseCanisterRejectError,
} from '../utils';
import {
  AssetManager,
  EncryptedStorage,
  Entry,
} from '@rabbithole/encrypted-storage';

const postMessage = (message: CoreWorkerMessageOut) =>
  self.postMessage(message);

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
          offscreenCanvas: file.offscreenCanvas as OffscreenCanvas,
        });
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
const encryptedStorage = new Subject<PrincipalString>();
const encryptedStorageInstances$ = encryptedStorage.asObservable().pipe(
  combineLatestWith(agent$),
  scan((acc, [canisterId, agent]) => {
    const encryptedStorage = new EncryptedStorage({
      agent,
      canisterId,
      origin: `https://${canisterId}.localhost`,
    });
    const assetManager = new AssetManager({
      agent,
      canisterId,
    });
    acc.set(canisterId, { encryptedStorage, assetManager });
    return acc;
  }, new Map<PrincipalString, { assetManager: AssetManager; encryptedStorage: EncryptedStorage }>()),
  shareReplay(1),
);

const uploadAssets = new Subject<UploadAsset>();
const uploadFiles = new Subject<UploadFile>();
const cancelUpload = new Subject<UploadId>();
const retryUpload = new Subject<UploadId>();
const imageCrop = new Subject<ImageCropPayload>();

function getEncryptedStorageInstance(
  instancesMap: Map<
    PrincipalString,
    { assetManager: AssetManager; encryptedStorage: EncryptedStorage }
  >,
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

uploadAssets
  .asObservable()
  .pipe(
    customRepeatWhen((item) =>
      retryUpload.asObservable().pipe(filter((id) => item.id === id)),
    ),
    withLatestFrom(encryptedStorageInstances$),
    mergeMap(([{ id, storageId, bytes, config }, instancesMap]) => {
      const { assetManager } = getEncryptedStorageInstance(
        instancesMap,
        storageId,
      );
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
    withLatestFrom(encryptedStorageInstances$),
    mergeMap(
      ([{ id, storageId, bytes, config, offscreenCanvas }, instancesMap]) => {
        const { encryptedStorage } = getEncryptedStorageInstance(
          instancesMap,
          storageId,
        );
        return new Observable<UploadStatus>((subscriber) => {
          const controller = new AbortController();
          const cancelSub = cancelUpload
            .asObservable()
            .pipe(filter((_id) => id === _id))
            .subscribe(() => {
              controller.abort();
            });
          // Generate thumbnail for image files (non-blocking for upload progress)
          const created = new ReplaySubject<boolean>();
          let thumbnailSub: Subscription | undefined;
          if (
            isPhotonSupportedMimeType(config.contentType) &&
            offscreenCanvas
          ) {
            const entry: Entry = [
              'File',
              [config.path ?? '', config.fileName].join('/'),
            ];
            const imageThumbnailArgs = {
              bytes,
              imageType: config.contentType as string,
              offscreenCanvas,
            };
            thumbnailSub = from(processImageThumbnail(imageThumbnailArgs))
              .pipe(
                audit(() => created.asObservable().pipe(filter((v) => v))),
                switchMap((blob) =>
                  encryptedStorage.saveThumbnail(entry, blob),
                ),
                catchError(() => EMPTY),
              )
              .subscribe((value) => {
                const thumbnailKey = match(value)
                  .with(
                    {
                      metadata: {
                        File: { thumbnailKey: [P.optional(P.string.select())] },
                      },
                    },
                    (v) => v,
                  )
                  .otherwise(() => undefined);
                postMessage({
                  action: 'upload:thumbnail',
                  payload: { id, thumbnailKey },
                });
              });
          }

          const uploadSub = from(
            encryptedStorage.store([
              bytes,
              {
                ...config,
                signal: controller.signal,
                onProgress: (progress) => {
                  if (
                    [
                      UploadState.IN_PROGRESS,
                      UploadState.REQUESTING_VETKD,
                    ].includes(progress.status)
                  ) {
                    created.next(true);
                  }
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
                  errorMessage:
                    parseCanisterRejectError(err) ?? 'Unknown error',
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
            thumbnailSub?.unsubscribe();
          };
        });
      },
    ),
  )
  .subscribe((payload) => {
    postMessage({ action: 'upload:progress-file', payload });
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
