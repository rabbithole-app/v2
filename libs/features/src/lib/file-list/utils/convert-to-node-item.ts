import { fromNullable, uint8ArrayToHexString } from '@dfinity/utils';
import { match, P } from 'ts-pattern';

import { timeInNanosToDate } from '@rabbithole/core';
import { type StorageBackendType } from '@rabbithole/core/storage-runtime';
import {
  NodeDetails,
  ThumbnailEncryptionRef as ThumbnailEncryptionRefRaw,
  ThumbnailRef as ThumbnailRefRaw,
} from '@rabbithole/declarations/encrypted-storage';
import { StoragePermission } from '@rabbithole/encrypted-storage';

import {
  CommonAttrs,
  DirectoryColor,
  DirectoryNode,
  FileNode,
  FileThumbnailRef,
  NodeItem,
  ThumbnailEncryptionRef,
  ThumbnailStoragePolicy,
} from '../types';

function variantKey<T extends object>(variant: T): keyof T & string {
  return Object.keys(variant)[0] as keyof T & string;
}

const thumbnailStoragePolicyMap = {
  Inherit: 'inherit',
  OnChain: 'onChain',
  BlobStorage: 'blobStorage',
} as const satisfies Record<string, ThumbnailStoragePolicy>;

export function convertToNodeItem(
  node: NodeDetails,
  parentPath?: string,
): NodeItem {
  const callerPermissionRaw = fromNullable(node.callerPermission);
  const sharingRaw = fromNullable(node.sharing);
  const commonAttrs: CommonAttrs = {
    id: node.id,
    keyId: [node.keyId[0], new Uint8Array(node.keyId[1])],
    createdAt: timeInNanosToDate(node.createdAt),
    name: node.name,
    callerPermission: callerPermissionRaw
      ? (Object.keys(callerPermissionRaw)[0] as StoragePermission)
      : undefined,
    sharedWith: sharingRaw ? Number(sharingRaw.sharedWith) : undefined,
  };

  const parentId = fromNullable(node.parentId);
  if (parentId) {
    commonAttrs.parentId = parentId;
  }

  if (parentPath) {
    commonAttrs.parentPath = parentPath;
  }

  const modifiedAt = fromNullable(node.modifiedAt);
  if (modifiedAt) {
    commonAttrs.modifiedAt = timeInNanosToDate(modifiedAt);
  }

  return match(node.metadata)
    .returnType<DirectoryNode | FileNode>()
    .with({ File: P.select() }, (file) => {
      const hash = fromNullable(file.sha256);
      const thumbnailRef = fromNullable(file.thumbnailRef);
      return {
        ...commonAttrs,
        type: 'file',
        chunkCount: Number(file.chunkCount),
        contentType: file.contentType,
        sha256: hash ? uint8ArrayToHexString(hash) : undefined,
        size: file.size,
        thumbnailRef: thumbnailRef
          ? convertThumbnailRef(thumbnailRef)
          : undefined,
        versionCount: Number(file.versionCount),
        currentVersion: Number(file.currentVersion),
        storageBackend: Object.keys(file.storageBackend)[0] as StorageBackendType,
      };
    })
    .with({ Directory: P.select() }, (directory) => {
      const color = fromNullable(directory.color);
      const thumbnailStoragePolicy =
        variantKey(
          directory.thumbnailStoragePolicy,
        ) as keyof typeof thumbnailStoragePolicyMap;
      const dir: DirectoryNode = {
        ...commonAttrs,
        type: 'directory',
        defaultThumbnailStorageBackend: variantKey(
          directory.defaultThumbnailStorageBackend,
        ) as StorageBackendType,
        thumbnailStoragePolicy:
          thumbnailStoragePolicyMap[thumbnailStoragePolicy],
      };

      if (color) {
        dir.color = Object.keys(color)[0] as DirectoryColor;
      }

      return dir;
    })
    .exhaustive();
}

function convertThumbnailEncryptionRef(
  value: ThumbnailEncryptionRefRaw,
): ThumbnailEncryptionRef {
  return {
    scopeKeyId: [
      value.scopeKeyId[0],
      new Uint8Array(value.scopeKeyId[1]),
    ],
    wrappedKey: new Uint8Array(value.wrappedKey),
    blobIv: new Uint8Array(value.blobIv),
    algorithm: value.algorithm,
  };
}

function convertThumbnailRef(value: ThumbnailRefRaw): FileThumbnailRef {
  if ('OnChain' in value) {
    const sha256 = fromNullable(value.OnChain.sha256);
    return {
      storageBackend: 'OnChain',
      key: value.OnChain.key,
      contentType: value.OnChain.contentType,
      size: value.OnChain.size,
      sha256: sha256 ? uint8ArrayToHexString(sha256) : undefined,
      encryption: convertThumbnailEncryptionRef(value.OnChain.encryption),
    };
  }

  const sha256 = fromNullable(value.BlobStorage.sha256);
  return {
    storageBackend: 'BlobStorage',
    rootHash: value.BlobStorage.rootHash,
    contentType: value.BlobStorage.contentType,
    size: value.BlobStorage.size,
    sha256: sha256 ? uint8ArrayToHexString(sha256) : undefined,
    encryption: convertThumbnailEncryptionRef(value.BlobStorage.encryption),
  };
}
