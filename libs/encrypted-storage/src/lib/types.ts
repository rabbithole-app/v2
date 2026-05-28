import { ActorConfig } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';

import {
  AccessClass,
  AccessGrantListMode as AccessGrantListModeRaw,
  AccessRequest as AccessRequestRaw,
  AccessRequestStatus as AccessRequestStatusRaw,
  AccessScope,
  AccessSource,
  DirectoryEncryptionPolicy as DirectoryEncryptionPolicyRaw,
  EncryptionMode,
  Entry as EntryRaw,
  PendingAccessGrant,
  EncryptedStorageHttpPermission as PermissionRaw,
  StorageBackend,
  StoragePermission as StoragePermissionRaw,
  ThumbnailEncryptionPolicy as ThumbnailEncryptionPolicyRaw,
  ThumbnailRef as ThumbnailRefRaw,
  ThumbnailStoragePolicy as ThumbnailStoragePolicyRaw,
  Time,
} from '@rabbithole/declarations/encrypted-storage';

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
  WAITING_FOR_FUNDING,
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

export type CreateStorageAccessGrant = {
  entry?: Entry;
  permission: StoragePermission;
  target: StorageAccessTarget;
};

export type CreateStorageAccessGrants = {
  items: CreateStorageAccessGrant[];
};

export type CreateStorageAccessRequest = {
  email?: string;
  message?: string;
};

export type EncryptedStorageConfig = {
  /** Blob storage gateway URL (e.g., "https://blob.caffeine.ai"). Required for BlobStorage backend. */
  blobStorageGatewayUrl?: string;
  origin: string;
  storageBackend?: StorageBackend | 'BlobStorage' | 'OnChain';
} & AssetManagerConfig;

export type EncryptedStorageStoreConfig = Omit<StoreConfig, 'contentEncoding'>;

export type Entry = [ExtractVariantKeys<EntryKind>, string];

export type EntryKind = EntryRaw[0];

export type Permission = ExtractVariantKeys<PermissionRaw>;

/**
 * Upload progress in bytes
 */
export type Progress =
  | { current: number; message?: string; retryAt?: number; status: UploadState.WAITING_FOR_FUNDING; total: number }
  | { current: number; status: UploadState.IN_PROGRESS; total: number }
  | { errorMessage: string; status: UploadState.FAILED }
  | {
      status: Exclude<
        UploadState,
        UploadState.FAILED | UploadState.IN_PROGRESS | UploadState.WAITING_FOR_FUNDING
      >;
    };

export type ResolveStorageAccessRequest =
  | {
      decision: 'approved';
      entry?: Entry;
      permission: StoragePermission;
      requestId: bigint;
    }
  | {
      decision: 'rejected';
      requestId: bigint;
    };

export type RevokeStorageAccessGrant = {
  entry?: Entry;
  principal: Principal | string;
};

export type RevokeStorageAccessGrants = {
  items: RevokeStorageAccessGrant[];
};

export type StorageAccessGrantListMode = ExtractVariantKeys<AccessGrantListModeRaw>;

export type StorageAccessRequest = AccessRequestRaw;

export type StorageAccessRequestStatus = AccessRequestStatusRaw;

export type StorageAccessTarget =
  | { email: string }
  | { principal: Principal | string };

export type StorageClaimedPrincipal = {
  claimedAt: Time;
  origin: StorageClaimedPrincipalOrigin;
  principal: string;
  principalGrantId: bigint;
};

export type StorageClaimedPrincipalOrigin = 'rabbithole' | 'storage';

export type StorageDirectoryEncryptionPolicy =
  ExtractVariantKeys<DirectoryEncryptionPolicyRaw>;

export type StoragePendingAccessGrant = PendingAccessGrant;

export type StoragePermission = ExtractVariantKeys<StoragePermissionRaw>;

export type StoragePermissionItem = {
  accessClass?: AccessClass;
  claimedPrincipals?: StorageClaimedPrincipal[];
  emailCommitment?: Uint8Array;
  grantId?: bigint;
  inheritedFrom?: AccessScope;
  permission: StoragePermission;
  scope?: AccessScope;
  source?: AccessSource;
  status?: 'active' | 'pending';
  targetKind?: 'email' | 'emailCommitment' | 'principal';
  user: string;
};

export type StorageThumbnailEncryptionPolicy =
  ExtractVariantKeys<ThumbnailEncryptionPolicyRaw>;

/**
 * Upload progress in bytes
 */
// export interface Progress {
//   current: number;
//   total: number;
// }

export type StorageThumbnailRef = ThumbnailRefRaw;

export type StorageThumbnailStoragePolicy =
  ExtractVariantKeys<ThumbnailStoragePolicyRaw>;

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
   * Encryption mode for this file
   * @default undefined (inherits from parent directory, defaults to 'Encrypted')
   */
  encryptionMode?: 'Encrypted' | 'Plaintext';
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
  kind?: 'directory' | 'file';
  name: string;
  path?: string;
};

type ExtractVariantKeys<T> =
  T extends Record<infer K, unknown> ? Extract<K, string> : never;

export function toEncryptionMode(mode?: 'Encrypted' | 'Plaintext'): [] | [EncryptionMode] {
  return mode ? [{ [mode]: null } as EncryptionMode] : [];
}

export function toEntryRaw(entry: Entry): EntryRaw {
  return [{ [entry[0]]: null } as EntryRaw[0], entry[1]];
}

export function toOptionalEntryRaw(entry?: Entry): [] | [EntryRaw] {
  return entry ? [toEntryRaw(entry)] : [];
}

export function toStoragePermission(permission: StoragePermission): StoragePermissionRaw {
  return { [permission]: null } as StoragePermissionRaw;
}
