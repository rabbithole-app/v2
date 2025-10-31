/// <reference lib="webworker" />

import { AnonymousIdentity, HttpAgent, uint8ToBuf } from '@dfinity/agent';
import { arrayBufferToUint8Array } from '@dfinity/utils';
import {
  crop,
  PhotonImage,
  resize,
} from '@silvia-odwyer/photon';
import { type } from 'arktype';
import { isNonNull } from 'remeda';
import { defer, EMPTY, from, Observable, of, Subject, Subscription } from 'rxjs';
import {
  audit,
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
import { AssetManager, EncryptedStorage, Entry } from '@rabbithole/encrypted-storage';

const postMessage = (message: CoreWorkerMessageOut) =>
  self.postMessage(message);

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
            errorMessage: 'offscreenCanvas must be an instance of OffscreenCanvas',
          },
        });
      } else {
        imageCrop.next({ ...imageCropData, offscreenCanvas: imageCropData.offscreenCanvas as OffscreenCanvas });
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
      } else if (file.offscreenCanvas !== undefined && !(file.offscreenCanvas instanceof OffscreenCanvas)) {
        // offscreenCanvas is optional for upload:add-file, but if provided must be OffscreenCanvas
        postMessage({
          action: 'upload:progress-file',
          payload: {
            id: data.payload.id,
            status: UploadState.FAILED,
            errorMessage: 'offscreenCanvas must be an instance of OffscreenCanvas',
          },
        });
      } else {
        uploadFiles.next({ ...file, offscreenCanvas: file.offscreenCanvas as OffscreenCanvas });
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
const imageCrop = new Subject<ImageCropPayload>();

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
    mergeMap(([{ id, bytes, config, offscreenCanvas }, encryptedStorage]) => {
      return new Observable<UploadStatus>((subscriber) => {
        const controller = new AbortController();
        const cancelSub = cancelUpload
          .asObservable()
          .pipe(filter((_id) => id === _id))
          .subscribe(() => {
            controller.abort();
          });
        // Generate thumbnail for image files (non-blocking for upload progress)
        const created = new Subject<boolean>();
        let thumbnailSub: Subscription | undefined;
        if (config.contentType?.startsWith('image/') && offscreenCanvas) {
          const entry: Entry = ['File', [config.path ?? '', config.fileName].join('/')];
          const imageThumbnailArgs = { image: new File([bytes], config.fileName, { type: config.contentType }), offscreenCanvas };
          thumbnailSub = from(processImageThumbnail(imageThumbnailArgs)).pipe(
            audit(() => created.asObservable().pipe(filter(v => v))),
            switchMap(blob => encryptedStorage.saveThumbnail(entry, blob)),
            catchError(() => EMPTY)
          ).subscribe(value => {
            const thumbnailKey = match(value)
              .with({ metadata: { File: { thumbnailKey: [P.optional(P.string.select())] }} }, v => v)
              .otherwise(() => undefined);
            postMessage({ action: 'upload:thumbnail', payload: { id, thumbnailKey } });
          });
        }

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
            next: (value) => {
              if ([UploadState.IN_PROGRESS, UploadState.REQUESTING_VETKD].includes(value.status)) {
                created.next(true);
              }

              subscriber.next(value);
            },
            complete: () => subscriber.complete(),
          });

        return () => {
          cancelSub.unsubscribe();
          uploadSub.unsubscribe();
          thumbnailSub?.unsubscribe();
        };
      });
    }),
  )
  .subscribe((payload) => {
    postMessage({ action: 'upload:progress-file', payload });
  });

imageCrop.asObservable()
  .pipe(
    mergeMap(payload => 
      from(processImageCrop(payload)).pipe(
        map((blob) => <CoreWorkerMessageOut>({
          action: 'image:crop-done',
          payload: { id: payload.id, blob }
        })),
        catchError(error => 
          of<CoreWorkerMessageOut>({
            action: 'image:crop-failed',
            payload: { id: payload.id, errorMessage: (error as Error)?.message ?? 'Unknown error' }
          })
        )
      )
    )
  ).subscribe(message => {
    postMessage(message);
  });

async function photonImageToBlob({ photonImage, imageType, offscreenCanvas }: { imageType: string, offscreenCanvas: OffscreenCanvas; photonImage: PhotonImage }) {
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

async function processImageCrop({ image, cropper, offscreenCanvas }: ImageCropPayload) {
  const buffer = await image.arrayBuffer();
  let photonImage = PhotonImage.new_from_byteslice(arrayBufferToUint8Array(buffer));
  const [width, height] = [photonImage.get_width(), photonImage.get_height()];
  const ratioW = width / cropper.maxSize.width;
  const ratioH = height / cropper.maxSize.height;
  photonImage = crop(
    photonImage,
    Math.round(cropper.position.x1 * ratioW),
    Math.round(cropper.position.y1 * ratioH),
    Math.round(cropper.position.x2 * ratioW),
    Math.round(cropper.position.y2 * ratioH)
  );
  // Resize to avatar size (512x512) only if the cropped image is larger than the max
  const [croppedWidth, croppedHeight] = [photonImage.get_width(), photonImage.get_height()];
  if (croppedWidth > MAX_AVATAR_WIDTH || croppedHeight > MAX_AVATAR_HEIGHT) {
    photonImage = resize(photonImage, MAX_AVATAR_WIDTH, MAX_AVATAR_HEIGHT, 5);
  }
  return photonImageToBlob({ photonImage, imageType: image.type, offscreenCanvas });
}

async function processImageThumbnail({ image, offscreenCanvas }: { image: File; offscreenCanvas: OffscreenCanvas }) {
  const buffer = await image.arrayBuffer();
  let photonImage = PhotonImage.new_from_byteslice(arrayBufferToUint8Array(buffer));
  const [width, height] = [photonImage.get_width(), photonImage.get_height()];
  const ratio = Math.min(MAX_THUMBNAIL_WIDTH / width, MAX_THUMBNAIL_HEIGHT / height);
  if (ratio < 1) {
    const newWidth = width * ratio;
    const newHeight = height * ratio;
    photonImage = resize(photonImage, newWidth, newHeight, 5);
  }
  return photonImageToBlob({ photonImage, imageType: image.type, offscreenCanvas });
}
