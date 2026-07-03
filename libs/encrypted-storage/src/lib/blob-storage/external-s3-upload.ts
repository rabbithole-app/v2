import { sha256 } from '@noble/hashes/sha2';

import type { Readable } from '../readable/readable';
import { toUint8Array } from '../utils/bytes';
import { toBareHex } from './blob-hash';
import { createBlobUploadSpool } from './blob-upload-spool';
import {
  blobPlaintextChunkCount,
  CAFFEINE_PLAINTEXT_CHUNK_SIZE,
} from './constants';
import { BlobHashTree, YHash } from './merkle-tree';

export interface ExternalS3PresignedUrl {
  method: string;
  requestHeaders: Array<[string, string]>;
  url: string;
}

export interface ExternalS3UploadOptions {
  contentType: string;
  encryptChunk: (plain: Uint8Array) => Promise<ArrayBuffer | Uint8Array>;
  onProgress?: (completedChunks: number, totalChunks: number) => void;
  prepareUpload: (args: {
    rootHashHex: string;
    size: number;
  }) => Promise<{
    blobUpload: ExternalS3PresignedUrl;
    treeUpload: ExternalS3PresignedUrl;
  }>;
  readable: Readable;
  signal?: AbortSignal;
  sourceSize: number;
}

export interface ExternalS3UploadResult {
  rootHashHex: string;
  sha256: Uint8Array;
  size: number;
}

export async function uploadExternalS3BlobFile(
  options: ExternalS3UploadOptions,
): Promise<ExternalS3UploadResult> {
  const chunkCount = blobPlaintextChunkCount(options.sourceSize);
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
    const rootHashHex = toBareHex(blobTree.tree.hash.toShaString());
    const prepared = await options.prepareUpload({
      rootHashHex,
      size: totalEncryptedSize,
    });

    await putPresignedObject(
      prepared.treeUpload,
      JSON.stringify(blobTree.toJSON()),
      {
        contentType: 'application/json',
        signal: options.signal,
      },
    );

    const blobBytes = new Uint8Array(totalEncryptedSize);
    let offset = 0;
    for (let i = 0; i < chunkCount; i++) {
      if (options.signal?.aborted) throw new Error('Upload aborted');
      const chunk = await spool.getChunk(i);
      blobBytes.set(chunk, offset);
      offset += chunk.byteLength;
      await spool.releaseChunk(i);
      options.onProgress?.(i + 1, chunkCount);
    }

    await putPresignedObject(prepared.blobUpload, blobBytes, {
      contentType: 'application/octet-stream',
      signal: options.signal,
    });

    return {
      rootHashHex,
      sha256: new Uint8Array(contentHash.digest()),
      size: totalEncryptedSize,
    };
  } finally {
    await spool.clear();
  }
}

function headersFromPairs(
  pairs: Array<[string, string]>,
  contentType: string,
): Headers {
  const headers = new Headers();
  for (const [name, value] of pairs) {
    headers.set(name, value);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }
  return headers;
}

async function putPresignedObject(
  presigned: ExternalS3PresignedUrl,
  body: BodyInit,
  options: {
    contentType: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (presigned.method !== 'PUT') {
    throw new Error(`Expected PUT presigned URL, got ${presigned.method}`);
  }

  const response = await fetch(presigned.url, {
    body,
    headers: headersFromPairs(presigned.requestHeaders, options.contentType),
    method: 'PUT',
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      `External S3 upload failed: ${response.status} ${response.statusText}${message ? ` - ${message}` : ''}`,
    );
  }
}
