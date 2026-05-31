import { Principal } from '@icp-sdk/core/principal';

import { ExtractVariantKeys } from '@rabbithole/core';
import { type StorageBackendType } from '@rabbithole/core/storage-runtime';
import { DirectoryColor as DirectoryColorRaw } from '@rabbithole/declarations/encrypted-storage';
import { StoragePermission } from '@rabbithole/encrypted-storage';

export type CommonAttrs = {
  callerPermission?: StoragePermission;
  createdAt: Date;
  id: bigint;
  keyId: [Principal, Uint8Array];
  modifiedAt?: Date;
  name: string;
  parentId?: bigint;
  parentPath?: string;
  sharedWith?: number;
};

export type DirectoryColor = ExtractVariantKeys<DirectoryColorRaw>;

export type DirectoryNode = {
  color?: DirectoryColor;
  defaultThumbnailStorageBackend: StorageBackendType;
  thumbnailStoragePolicy: ThumbnailStoragePolicy;
  type: 'directory';
} & CommonAttrs;

export type DirectoryNodeExtended = DirectoryNode & ItemsCommonAttrs;

export type FileNode = {
  chunkCount: number;
  contentType: string;
  currentVersion: number;
  sha256?: string;
  size: bigint;
  storageBackend: StorageBackendType;
  thumbnailRef?: FileThumbnailRef;
  type: 'file';
  versionCount: number;
} & CommonAttrs;

export type FileNodeExtended = FileNode & ItemsCommonAttrs;

export type FileThumbnailRef =
  | {
      contentType: string;
      encryption: ThumbnailEncryptionRef;
      key: string;
      sha256?: string;
      size: bigint;
      storageBackend: 'OnChain';
    }
  | {
      contentType: string;
      encryption: ThumbnailEncryptionRef;
      rootHash: string;
      sha256?: string;
      size: bigint;
      storageBackend: 'BlobStorage';
    };

export type NodeItem = DirectoryNodeExtended | FileNodeExtended;

export type ThumbnailEncryptionRef = {
  algorithm: string;
  blobIv: Uint8Array;
  scopeKeyId: [Principal, Uint8Array];
  wrappedKey: Uint8Array;
};

export type ThumbnailStoragePolicy = 'blobStorage' | 'inherit' | 'onChain';

type ItemsCommonAttrs = {
  disabled?: boolean;
  loading?: boolean;
};

export const isDirectory = (node: NodeItem): node is DirectoryNode =>
  node.type === 'directory';

export const isFile = (node: NodeItem): node is FileNode =>
  node.type === 'file';

export type FileListIconsConfig = {
  namespace: string;
  path: string;
  value: Record<string, string[]>;
};
