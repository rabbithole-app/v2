import { ActorConfig } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';

import {
  Entry as EntryRaw,
  Permission as PermissionRaw,
} from './canisters/encrypted-storage.did';
import { Readable } from './readable/readable';

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

/**
 * Configuration that can be passed to set the canister id of the
 * assets canister to be managed, inherits actor configuration and
 * has additional asset manager specific configuration options.
 */
export interface AssetManagerConfig extends ActorConfig {
  /**
   * Max number of concurrent requests to the Internet Computer
   * @default 16
   */
  concurrency?: number;
  /**
   * Size of each chunk in bytes when the asset manager has to chunk a file
   * @default 1900000
   */
  maxChunkSize?: number;
  /**
   * Max file size in bytes that the asset manager shouldn't chunk
   * @default 1900000
   */
  maxSingleFileSize?: number;
}

/**
 * Arguments to commit batch in asset manager
 */
export interface CommitBatchArgs {
  onProgress?: (progress: Progress) => void;
}

/**
 * Supported content encodings by asset canister
 */
export type ContentEncoding =
  | 'br'
  | 'compress'
  | 'deflate'
  | 'gzip'
  | 'identity';

export type EncryptedStorageConfig = {
  origin: string;
} & AssetManagerConfig;

export type EncryptedStorageStoreConfig = Omit<StoreConfig, 'contentEncoding'>;

export type Entry = [ExtractVariantKeys<EntryKind>, string];

export type EntryKind = EntryRaw[0];

export type GrantPermission = {
  entry?: Entry;
  permission: Permission;
  user: Principal | string;
};

export type Permission = ExtractVariantKeys<PermissionRaw>;

export type PermissionItem = {
  permission: Permission;
  user: string;
};

/**
 * Upload progress in bytes
 */
export type Progress =
  | { current: number; status: UploadState.IN_PROGRESS; total: number }
  | { errorMessage: string; status: UploadState.FAILED }
  | {
      status: Exclude<
        UploadState,
        UploadState.FAILED | UploadState.IN_PROGRESS
      >;
    };

/**
 * Upload progress in bytes
 */
// export interface Progress {
//   current: number;
//   total: number;
// }

export type RevokePermission = {
  entry?: Entry;
  user: Principal | string;
};

/**
 * Arguments to store an asset in asset manager
 */
export type StoreArgs =
  | StoreBlobArgs
  | StoreBytesArgs
  | StoreFileArgs
  | StorePathArgs
  | StoreReadableArgs;

export type StoreBlobArgs = [
  blob: Blob,
  config: Omit<StoreConfig, 'fileName'> &
    Required<Pick<StoreConfig, 'fileName'>>,
];

export type StoreBytesArgs = [
  bytes: ArrayBuffer | number[] | Uint8Array,
  config: Omit<StoreConfig, 'fileName'> &
    Required<Pick<StoreConfig, 'fileName'>>,
];

/**
 * Configuration that can be passed to set and override defaults and add progress callback
 */
export type StoreConfig = {
  /**
   * Content encoding
   * @default 'identity'
   */
  contentEncoding?: ContentEncoding;
  /**
   * File content type
   * @default File/Blob object type or type from file name extension
   */
  contentType?: string;
  /**
   * File name
   * @default File object name or name in file path
   */
  fileName?: string;
  /**
   * Custom headers to be sent with the asset
   * @default []
   */
  headers?: Array<[string, string]>;
  /**
   * Callback method to get upload progress in bytes (current / total)
   */
  onProgress?: (progress: Progress) => void;
  /**
   * File path that file will be uploaded to
   * @default '/'
   */
  path?: string;
  /**
   * File hash generation will be skipped if hash is provided
   */
  sha256?: Uint8Array;
  /**
   * AbortSignal to cancel the upload process
   */
  signal?: AbortSignal;
};

export type StoreFileArgs = [file: File, config?: StoreConfig];

export type StorePathArgs = [path: string, config?: StoreConfig];

export type StoreReadableArgs = [readable: Readable, config?: StoreConfig];

export type TreeNode = {
  children?: TreeNode[];
  name: string;
  path?: string;
};

export type {
  Entry as EntryRaw,
  Permission as PermissionRaw,
} from './canisters/encrypted-storage.did';

type ExtractVariantKeys<T> = T extends Record<infer K, unknown> ? K : never;
