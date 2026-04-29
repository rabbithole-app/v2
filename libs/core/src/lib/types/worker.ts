import { Principal } from '@icp-sdk/core/principal';
import { type } from 'arktype';

import { isPhotonSupportedMimeType } from '../utils';
import { Prettify } from './utility';

export enum UploadState {
  NOT_STARTED,
  REQUESTING_VETKD,
  INITIALIZING,
  IN_PROGRESS,
  PAUSED,
  COMPLETED,
  FAILED,
  CANCELED,
  FINALIZING,
}

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
  bytes: 'ArrayBuffer',
  config: {
    'contentType?': 'string',
    'encryptionMode?': "'Encrypted' | 'Plaintext'",
    fileName: 'string>=1',
    'path?': 'string',
  },
});

export const uploadAssetSchema = uploadSchema.and(
  type({
    config: {
      'contentEncoding?': "'br' | 'compress' | 'deflate' | 'gzip' | 'identity'",
      'headers?': type(['string', 'string']).array(),
      'isAliased?': 'boolean',
    },
  }),
);

export const uploadFileSchema = uploadSchema.and(
  type({
    'offscreenCanvas?': 'object',
  }),
);

export const downloadRequestSchema = type({
  id: uploadIdSchema,
  storageId: principalSchema,
  encrypted: 'boolean',
  entry: type(["'Directory' | 'File'", 'string>=1']),
  fileName: 'string>=1',
  'contentType?': 'string',
  totalChunks: 'number',
  'keyId?': type(['string', type('number').array()]),
  'storageBackend?': "'OnChain' | 'BlobStorage'",
});

export const downloadCancelSchema = downloadRequestSchema.pick('id');

export const fileIdSchema = uploadFileSchema.pick('id');

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
    encrypted: 'boolean',
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
    'upload:thumbnail': { payload: { id: string; thumbnailKey?: string } };
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

export type UploadFile = { offscreenCanvas?: OffscreenCanvas } & Omit<
  typeof uploadFileSchema.infer,
  'offscreenCanvas'
>;

export type UploadId = typeof uploadIdSchema.infer;

export type UploadStatus = {
  id: string;
} & (
  | { current: number; status: UploadState.IN_PROGRESS; total: number }
  | { errorMessage: string; status: UploadState.FAILED }
  | {
      status: Exclude<
        UploadState,
        UploadState.FAILED | UploadState.IN_PROGRESS
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
