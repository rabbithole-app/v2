import { CAFFEINE_CHUNK_SIZE } from './constants';
import { BlobStorageGatewayClient } from './gateway-client';
import {
  verifiedBlobTreeChunkHashes,
  verifyBlobIntegrity,
  YHash,
} from './merkle-tree';

export interface BlobStorageBlobInfo {
  blobHash: string;
  contentType: string;
  size: number;
}

export interface BlobStorageDownloadOptions {
  client: BlobStorageGatewayClient;
  decryptChunk: (chunkBytes: Uint8Array) => Promise<ArrayBuffer | Uint8Array>;
  info: BlobStorageBlobInfo;
  onProgress?: (chunkIndex: number, totalChunks: number) => void;
  signal?: AbortSignal;
}

export async function* downloadBlobStorageStream(
  options: BlobStorageDownloadOptions,
): AsyncGenerator<Uint8Array> {
  const { client, info, signal } = options;
  if (signal?.aborted) throw new Error('Download aborted');

  const totalEncryptedChunks = Math.max(1, Math.ceil(info.size / CAFFEINE_CHUNK_SIZE));
  let verifiedChunkHashes: string[] | null = null;
  try {
    const blobTree = await client.getBlobTree(info.blobHash, signal);
    verifiedChunkHashes = await verifiedBlobTreeChunkHashes(
      blobTree,
      info.blobHash,
      info.contentType,
      info.size,
      CAFFEINE_CHUNK_SIZE,
    );
  } catch {
    verifiedChunkHashes = null;
  }

  const response = await fetch(client.getDownloadUrl(info.blobHash), { signal });
  if (!response.ok) {
    throw new Error(`Blob storage download failed: ${response.status} ${response.statusText}`);
  }

  if (verifiedChunkHashes) {
    yield* streamVerifiedBlobResponse(response, {
      chunkHashes: verifiedChunkHashes,
      decryptChunk: options.decryptChunk,
      onProgress: options.onProgress,
      signal,
      totalBytes: info.size,
    });
    return;
  }

  let lastDownloadProgressChunk = -1;
  const encryptedBytes = await readResponseBodyWithProgress(
    response,
    info.size,
    (downloadedBytes, totalBytes) => {
      const chunkIndex = totalBytes > 0
        ? Math.min(
            totalEncryptedChunks,
            Math.ceil((downloadedBytes / totalBytes) * totalEncryptedChunks),
          )
        : totalEncryptedChunks;
      if (chunkIndex !== lastDownloadProgressChunk) {
        lastDownloadProgressChunk = chunkIndex;
        options.onProgress?.(chunkIndex, totalEncryptedChunks);
      }
    },
    signal,
  );

  const isValid = await verifyBlobIntegrity(
    encryptedBytes,
    info.blobHash,
    info.contentType,
    CAFFEINE_CHUNK_SIZE,
  );
  if (!isValid) {
    throw new Error(
      'Blob integrity verification failed: downloaded data does not match on-chain hash',
    );
  }

  const totalChunks = Math.max(1, Math.ceil(encryptedBytes.byteLength / CAFFEINE_CHUNK_SIZE));

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) throw new Error('Download aborted');

    const start = i * CAFFEINE_CHUNK_SIZE;
    const end = Math.min(start + CAFFEINE_CHUNK_SIZE, encryptedBytes.byteLength);
    const chunkBytes = encryptedBytes.slice(start, end);

    yield toUint8Array(await options.decryptChunk(chunkBytes));
  }
}

function blobChunkSizeAt(
  chunkIndex: number,
  totalChunks: number,
  totalBytes: number,
): number {
  if (chunkIndex < totalChunks - 1) return CAFFEINE_CHUNK_SIZE;
  return Math.max(0, totalBytes - CAFFEINE_CHUNK_SIZE * (totalChunks - 1));
}

function concatByteChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function* decryptVerifiedBlobChunks(
  encryptedBytes: Uint8Array,
  options: {
    chunkHashes: string[];
    decryptChunk: (chunkBytes: Uint8Array) => Promise<ArrayBuffer | Uint8Array>;
    onProgress?: (chunkIndex: number, totalChunks: number) => void;
    totalBytes: number;
  },
): AsyncGenerator<Uint8Array> {
  let offset = 0;
  for (let chunkIndex = 0; chunkIndex < options.chunkHashes.length; chunkIndex++) {
    const chunkSize = blobChunkSizeAt(
      chunkIndex,
      options.chunkHashes.length,
      options.totalBytes,
    );
    const chunkBytes = encryptedBytes.slice(offset, offset + chunkSize);
    offset += chunkSize;
    const decrypted = await verifyAndDecryptBlobChunk(
      chunkBytes,
      options.chunkHashes[chunkIndex],
      chunkIndex,
      options.decryptChunk,
    );
    options.onProgress?.(chunkIndex + 1, options.chunkHashes.length);
    yield decrypted;
  }

  if (offset !== encryptedBytes.byteLength) {
    throw new Error('Blob integrity verification failed: unexpected blob size');
  }
}

async function readResponseBodyWithProgress(
  response: Response,
  expectedTotalBytes: number,
  onProgress: (downloadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) throw new Error('Download aborted');

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress(bytes.byteLength, expectedTotalBytes || bytes.byteLength);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloadedBytes = 0;
  const totalBytes = expectedTotalBytes ||
    Number(response.headers.get('Content-Length')) ||
    0;

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new Error('Download aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      chunks.push(value);
      downloadedBytes += value.byteLength;
      onProgress(downloadedBytes, totalBytes || downloadedBytes);
    }
  } finally {
    reader.releaseLock();
  }

  return concatByteChunks(chunks, downloadedBytes);
}

async function* streamVerifiedBlobResponse(
  response: Response,
  options: {
    chunkHashes: string[];
    decryptChunk: (chunkBytes: Uint8Array) => Promise<ArrayBuffer | Uint8Array>;
    onProgress?: (chunkIndex: number, totalChunks: number) => void;
    signal?: AbortSignal;
    totalBytes: number;
  },
): AsyncGenerator<Uint8Array> {
  if (options.signal?.aborted) throw new Error('Download aborted');

  if (!response.body) {
    const encryptedBytes = new Uint8Array(await response.arrayBuffer());
    yield* decryptVerifiedBlobChunks(encryptedBytes, options);
    return;
  }

  const reader = response.body.getReader();
  let buffered: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let downloadedBytes = 0;
  let chunkIndex = 0;

  try {
    while (true) {
      if (options.signal?.aborted) {
        await reader.cancel();
        throw new Error('Download aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const responseChunk = new Uint8Array(value);
      downloadedBytes += responseChunk.byteLength;
      buffered = concatByteChunks(
        [buffered, responseChunk],
        buffered.byteLength + responseChunk.byteLength,
      );

      while (chunkIndex < options.chunkHashes.length - 1) {
        const nextChunkSize = blobChunkSizeAt(
          chunkIndex,
          options.chunkHashes.length,
          options.totalBytes,
        );
        if (buffered.byteLength < nextChunkSize) break;

        const chunkBytes = buffered.slice(0, nextChunkSize);
        buffered = buffered.slice(nextChunkSize);
        const decrypted = await verifyAndDecryptBlobChunk(
          chunkBytes,
          options.chunkHashes[chunkIndex],
          chunkIndex,
          options.decryptChunk,
        );
        chunkIndex++;
        options.onProgress?.(chunkIndex, options.chunkHashes.length);
        yield decrypted;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (downloadedBytes !== options.totalBytes) {
    throw new Error('Blob integrity verification failed: unexpected blob size');
  }

  while (chunkIndex < options.chunkHashes.length) {
    const nextChunkSize = blobChunkSizeAt(
      chunkIndex,
      options.chunkHashes.length,
      options.totalBytes,
    );
    if (buffered.byteLength < nextChunkSize) break;

    const chunkBytes = buffered.slice(0, nextChunkSize);
    buffered = buffered.slice(nextChunkSize);
    const decrypted = await verifyAndDecryptBlobChunk(
      chunkBytes,
      options.chunkHashes[chunkIndex],
      chunkIndex,
      options.decryptChunk,
    );
    chunkIndex++;
    options.onProgress?.(chunkIndex, options.chunkHashes.length);
    yield decrypted;
  }

  if (
    buffered.byteLength !== 0 ||
    chunkIndex !== options.chunkHashes.length
  ) {
    throw new Error('Blob integrity verification failed: incomplete blob download');
  }
}

function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes);
}

async function verifyAndDecryptBlobChunk(
  chunkBytes: Uint8Array,
  expectedHash: string,
  chunkIndex: number,
  decryptChunk: (chunkBytes: Uint8Array) => Promise<ArrayBuffer | Uint8Array>,
): Promise<Uint8Array> {
  const actualHash = await YHash.fromChunk(chunkBytes);
  if (actualHash.toShaString() !== expectedHash) {
    throw new Error(
      `Blob integrity verification failed: chunk ${chunkIndex} does not match blob tree`,
    );
  }

  return toUint8Array(await decryptChunk(chunkBytes));
}
