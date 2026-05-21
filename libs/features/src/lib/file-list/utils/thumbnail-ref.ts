import { ThumbnailRef as StorageThumbnailRef } from '@rabbithole/declarations/encrypted-storage';
import type { ThumbnailRewrapRequest } from '@rabbithole/core';

import { FileThumbnailRef } from '../types';

function hexStringToUint8Array(value: string): Uint8Array {
  const bytes = value.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16));
  return new Uint8Array(bytes ?? []);
}

function bytes(value: Uint8Array): number[] {
  return [...value];
}

function optionalSha256(value?: string): number[] | undefined {
  return value ? bytes(hexStringToUint8Array(value)) : undefined;
}

export function toStorageThumbnailRef(ref: FileThumbnailRef): StorageThumbnailRef {
  const encryption =
    ref.encryption.kind === 'Plaintext'
      ? { Plaintext: null }
      : {
          Encrypted: {
            scopeKeyId: ref.encryption.scopeKeyId,
            wrappedKey: ref.encryption.wrappedKey,
            blobIv: ref.encryption.blobIv,
            algorithm: ref.encryption.algorithm,
          },
        };

  if (ref.storageBackend === 'OnChain') {
    return {
      OnChain: {
        key: ref.key,
        sha256: ref.sha256 ? [hexStringToUint8Array(ref.sha256)] : [],
        contentType: ref.contentType,
        size: ref.size,
        encryption,
      },
    };
  }

  return {
    BlobStorage: {
      rootHash: ref.rootHash,
      blobId: new TextEncoder().encode(ref.rootHash),
      sha256: ref.sha256 ? [hexStringToUint8Array(ref.sha256)] : [],
      contentType: ref.contentType,
      size: ref.size,
      encryption,
    },
  };
}

export function toWorkerThumbnailRef(
  ref: FileThumbnailRef,
): ThumbnailRewrapRequest['thumbnailRef'] {
  const encryption =
    ref.encryption.kind === 'Plaintext'
      ? { kind: 'Plaintext' as const }
      : {
          kind: 'Encrypted' as const,
          scopeKeyId: [
            ref.encryption.scopeKeyId[0].toText(),
            bytes(ref.encryption.scopeKeyId[1]),
          ] satisfies [string, number[]],
          wrappedKey: bytes(ref.encryption.wrappedKey),
          blobIv: bytes(ref.encryption.blobIv),
          algorithm: ref.encryption.algorithm,
        };

  if (ref.storageBackend === 'OnChain') {
    return {
      storageBackend: 'OnChain',
      key: ref.key,
      contentType: ref.contentType,
      size: ref.size.toString(),
      sha256: optionalSha256(ref.sha256),
      encryption,
    };
  }

  return {
    storageBackend: 'BlobStorage',
    rootHash: ref.rootHash,
    contentType: ref.contentType,
    size: ref.size.toString(),
    sha256: optionalSha256(ref.sha256),
    encryption,
  };
}
