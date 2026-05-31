import { Principal } from '@icp-sdk/core/principal';
import { type } from 'arktype';

import { isPhotonSupportedMimeType } from '../utils/is-photon-supported-mime-type';
import { UploadState } from './upload-state';
import type { Prettify } from './utility';

export { UploadState } from './upload-state';

const uploadIdSchema = type('string.uuid.v4');

export const principalSchema = type('string').narrow((value, ctx) => {
  try {
    Principal.fromText(value);
    return true;
  } catch (error) {
    return ctx.reject((error as Error).message);
  }
});

export const uploadSchema = type({
  id: uploadIdSchema,
  storageId: principalSchema,
  config: {
    'contentType?': 'string',
    fileName: 'string>=1',
    'path?': 'string',
  },
});

export const uploadAssetSchema = uploadSchema.and(
  type({
    bytes: 'ArrayBuffer',
    config: {
      'contentEncoding?': "'br' | 'compress' | 'deflate' | 'gzip' | 'identity'",
      'headers?': type(['string', 'string']).array(),
      'isAliased?': 'boolean',
    },
  }),
);

export const uploadFileSchema = uploadSchema.and(
  type({
    file: 'object',
    'offscreenCanvas?': 'object',
  }),
);

export const downloadRequestSchema = type({
  id: uploadIdSchema,
  storageId: principalSchema,
  entry: type(["'Directory' | 'File'", 'string>=1']),
  fileName: 'string>=1',
  'contentType?': 'string',
  totalChunks: 'number',
  'keyId?': type(['string', type('number').array()]),
  'storageBackend?': "'OnChain' | 'BlobStorage'",
});

export const downloadCancelSchema = downloadRequestSchema.pick('id');

export const fileIdSchema = uploadFileSchema.pick('id');

const bytesSchema = type('number').array();

export const thumbnailEncryptionRefSchema = type({
  algorithm: 'string>=1',
  blobIv: bytesSchema,
  scopeKeyId: type([principalSchema, bytesSchema]),
  wrappedKey: bytesSchema,
});

const thumbnailRefBaseSchema = type({
  contentType: 'string',
  encryption: thumbnailEncryptionRefSchema,
  'sha256?': bytesSchema,
  size: 'string>=1',
});

export const thumbnailRefSchema = thumbnailRefBaseSchema.and(type({
  key: 'string>=1',
  storageBackend: "'OnChain'",
}).or({
  rootHash: 'string>=1',
  storageBackend: "'BlobStorage'",
}));

export const thumbnailRewrapRequestSchema = type({
  entry: type(["'File'", 'string>=1']),
  storageId: principalSchema,
  thumbnailRef: thumbnailRefSchema,
});

export const downloadProgressSchema = fileIdSchema.and(
  type({
    status: "'downloading'",
    chunkIndex: 'number',
    totalChunks: 'number',
  }).or({
    status: "'failed'",
    errorMessage: 'string',
  }).or({
    status: "'canceled' | 'completed' | 'decrypting' | 'queued'",
  }),
);

export const downloadChunkSchema = downloadRequestSchema.pick('id', 'fileName', 'totalChunks').and({
  chunk: 'ArrayBuffer',
  chunkIndex: 'number',
  contentType: 'string',
});

export const archiveDownloadRequestSchema = type({
  id: 'string.uuid.v4',
  storageId: principalSchema,
  archiveName: 'string>=1',
  files: type({
    entry: type(["'File'", 'string>=1']),
    fileName: 'string>=1',
    'contentType?': 'string',
    totalChunks: 'number',
    fileSize: 'number',
    'keyId?': type(['string', type('number').array()]),
    'storageBackend?': "'OnChain' | 'BlobStorage'",
  }).array().atLeastLength(1),
});

export const archiveDownloadProgressSchema = type({
  id: 'string.uuid.v4',
}).and(
  type({
    status: "'downloading'",
    currentFileIndex: 'number',
    totalFiles: 'number',
    currentFileName: 'string',
  }).or({
    status: "'failed'",
    errorMessage: 'string',
  }).or({
    status: "'canceled' | 'completed'",
  }),
);

const httpAgentOptionsSchema = type({
  'host?': 'string',
  'retryTimes?': 'number',
  'verifyQuerySignatures?': 'boolean',
});

// .pipe(Principal.fromText);

export const workerConfigSchema = type({
  httpAgentOptions: httpAgentOptionsSchema.and({
    'shouldFetchRootKey?': 'boolean',
  }),
  'concurrentUploads?': 'number',
  'concurrentDownloads?': 'number',
  'concurrentThumbnailRewraps?': 'number',
  'blobStorageGatewayUrl?': 'string',
  'storageBackend?': "'OnChain' | 'BlobStorage'",
  // canisters: type.Record("'encryptedStorage'", principalSchema),
});

export type ArchiveDownloadProgress = typeof archiveDownloadProgressSchema.infer;

export type ArchiveDownloadRequest = typeof archiveDownloadRequestSchema.infer;

export type CoreWorkerActionsIn = Prettify<
  {
    'download:archive': { payload: ArchiveDownloadRequest };
    'download:cancel': { payload: Pick<DownloadRequest, 'id'> };
    'download:start': { payload: DownloadRequest };
    'fs:load-list': unknown;
    'image:crop': { payload: ImageCropPayload };
    'thumbnail:rewrap': { payload: ThumbnailRewrapRequest };
    'upload:add-asset': { payload: UploadAsset };
    'upload:add-file': { payload: UploadFile };
    'upload:cancel': { payload: Pick<UploadFile, 'id'> };
    'upload:remove': { payload: Pick<UploadFile, 'id'> };
    'upload:retry': { payload: Pick<UploadFile, 'id'> };
    'worker:auth-sync': unknown;
    'worker:config': { payload: WorkerConfigIn };
    'worker:init-storage': { payload: PrincipalString };
  } & WorkerActionsIn
>;

export type CoreWorkerActionsOut = Prettify<
  {
    'download:archive-chunk': { payload: { chunk: ArrayBuffer; id: string; } };
    'download:archive-progress': { payload: ArchiveDownloadProgress };
    'download:chunk': { payload: DownloadChunk };
    'download:progress': { payload: DownloadProgress };
    'fs:list': { payload: unknown };
    'image:crop-done': {
      payload: { bytes: ArrayBuffer; id: string; imageType: string };
    };
    'image:crop-failed': { payload: { errorMessage: string; id: string } };
    'upload:progress-asset': { payload: UploadStatus };
    'upload:progress-file': { payload: UploadStatus };
    'upload:thumbnail': { payload: { id: string; thumbnailRef?: unknown } };
  } & WorkerActionsOut
>;

export type CoreWorkerMessageIn = Message<CoreWorkerActionsIn>;

export type CoreWorkerMessageOut = Message<CoreWorkerActionsOut>;

export type CoreWorkerMessages = CoreWorkerMessageIn | CoreWorkerMessageOut;

export type DownloadChunk = typeof downloadChunkSchema.infer;

export type DownloadProgress = typeof downloadProgressSchema.infer;

export type DownloadRequest = typeof downloadRequestSchema.infer;

export type EventName<
  Namespace extends string,
  Action extends string,
> = `${Namespace}:${Action}`;

// export type MessagePayload<
//   T extends Record<string, unknown>,
//   K extends keyof T,
// > = T[K] extends { payload: infer P } ? P : never;

export type ExtractPayloadByAction<T, A> = T extends {
  action: A;
  payload: infer P;
}
  ? P
  : never;

export type PrincipalString = typeof principalSchema.infer;

export type ThumbnailRewrapRequest =
  typeof thumbnailRewrapRequestSchema.infer;

export const imageCropSchema = type({
  id: uploadIdSchema,
  cropper: {
    maxSize: {
      width: 'number',
      height: 'number',
    },
    position: {
      x1: 'number',
      y1: 'number',
      x2: 'number',
      y2: 'number',
    },
  },
  bytes: 'ArrayBuffer',
  imageType: type('string').narrow(
    (mimeType, ctx) =>
      isPhotonSupportedMimeType(mimeType) ||
      ctx.reject('not a supported image type'),
  ),
  /**
   * OffscreenCanvas does not have a built-in arktype type. Use 'object' for validation,
   * and specify OffscreenCanvas in the TypeScript type for better type safety.
   */
  offscreenCanvas: 'object',
});

export type ImageCropPayload = { offscreenCanvas: OffscreenCanvas } & Omit<
  typeof imageCropSchema.infer,
  'offscreenCanvas'
>;

export type Message<T extends Record<string, any>> = Prettify<
  {
    [K in keyof T]: { action: K } & T[K];
  }[keyof T]
>;

export type UploadAsset = typeof uploadAssetSchema.infer;

export type UploadFile = { file: File; offscreenCanvas?: OffscreenCanvas } & Omit<
  typeof uploadFileSchema.infer,
  'file' | 'offscreenCanvas'
>;

export type UploadId = typeof uploadIdSchema.infer;

export type UploadStatus = {
  id: string;
} & (
  | {
      current: number;
      message?: string;
      retryAt?: number;
      status: UploadState.WAITING_FOR_FUNDING;
      total: number;
    }
  | { current: number; status: UploadState.IN_PROGRESS; total: number }
  | { errorMessage: string; status: UploadState.FAILED }
  | {
      status: Exclude<
        UploadState,
        UploadState.FAILED | UploadState.IN_PROGRESS | UploadState.WAITING_FOR_FUNDING
      >;
    }
);

export type WorkerActionsIn = {
  'worker:config': { payload?: any };
  'worker:ping': unknown;
};

export type WorkerActionsOut = {
  'worker:init': unknown;
  'worker:pong': unknown;
  'worker:signOut': unknown;
};

export type WorkerConfig = typeof workerConfigSchema.infer;

export type WorkerConfigIn = typeof workerConfigSchema.inferIn;

export type WorkerMessageIn = Message<WorkerActionsIn>;

export type WorkerMessageOut = Message<WorkerActionsOut>;

export type WorkerMessages = WorkerMessageIn | WorkerMessageOut;
