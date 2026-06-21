import { sha256 } from '@noble/hashes/sha2';

import type { Readable } from '../readable/readable';
import { createBlobUploadSpool } from './blob-upload-spool';
import {
  AES_GCM_OVERHEAD,
  CAFFEINE_PLAINTEXT_CHUNK_SIZE,
} from './constants';
import { BlobStorageGatewayClient } from './gateway-client';
import { BlobHashTree, YHash } from './merkle-tree';

export interface BlobStorageUploadOptions {
  client: BlobStorageGatewayClient;
  contentType: string;
  encryptChunk: (plain: Uint8Array) => Promise<ArrayBuffer | Uint8Array>;
  onProgress?: (completedChunks: number, totalChunks: number) => void;
  readable: Readable;
  signal?: AbortSignal;
  sourceSize: number;
}

export interface BlobStorageUploadResult {
  rootHash: string;
  sha256: Uint8Array;
  size: number;
}

export function blobStorageDeclaredUploadBytes(sourceSize: number): bigint {
  const chunkCount = blobStoragePlaintextChunkCount(sourceSize);
  return BigInt(sourceSize) + BigInt(chunkCount) * BigInt(AES_GCM_OVERHEAD);
}

export async function uploadBlobStorageFile(
  options: BlobStorageUploadOptions,
): Promise<BlobStorageUploadResult> {
  const chunkCount = blobStoragePlaintextChunkCount(options.sourceSize);
  const spool = createBlobUploadSpool(chunkCount);

  try {
    const chunkHashes: YHash[] = [];
    const contentHash = sha256.create();
    let totalEncryptedSize = 0;

    for (let i = 0; i < chunkCount; i++) {
      if (options.signal?.aborted) throw new Error('Upload aborted');
      const plain = await options.readable.slice(
        i * CAFFEINE_PLAINTEXT_CHUNK_SIZE,
        Math.min((i + 1) * CAFFEINE_PLAINTEXT_CHUNK_SIZE, options.sourceSize),
      );
      const encrypted = toUint8Array(await options.encryptChunk(plain));
      contentHash.update(encrypted);
      totalEncryptedSize += encrypted.byteLength;
      chunkHashes.push(await YHash.fromChunk(encrypted));
      await spool.writeChunk(i, encrypted);
    }

    const blobTree = await BlobHashTree.build(chunkHashes, {
      'Content-Type': options.contentType,
      'Content-Length': totalEncryptedSize.toString(),
    });
    const rootHash = blobTree.tree.hash.toShaString();
    const certificate = await options.client.createCertificate(rootHash);

    await options.client.uploadBlobTree({
      blobTree,
      certificate,
      signal: options.signal,
      totalSize: totalEncryptedSize,
    });

    await options.client.uploadChunkSource(
      spool,
      chunkHashes,
      rootHash,
      options.onProgress,
      options.signal,
    );

    return {
      rootHash,
      sha256: new Uint8Array(contentHash.digest()),
      size: totalEncryptedSize,
    };
  } finally {
    await spool.clear();
  }
}

function blobStoragePlaintextChunkCount(sourceSize: number): number {
  return Math.max(1, Math.ceil(sourceSize / CAFFEINE_PLAINTEXT_CHUNK_SIZE));
}

function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes);
}
