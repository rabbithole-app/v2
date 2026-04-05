/**
 * Blob Storage gateway client (Caffeine Immutable Object Storage protocol).
 *
 * Handles:
 * - IC response certificate extraction via `agent.call()`
 * - Blob tree upload (PUT /v1/blob-tree/)
 * - Chunk upload with parallel workers (PUT /v1/chunk/)
 * - Download URL construction
 *
 * Adapted from @caffeineai/object-storage StorageClient (source recovered
 * from source maps), updated for @icp-sdk/core v5 (isV4ResponseBody).
 */

import type { HttpAgent } from '@icp-sdk/core/agent';
import { isV4ResponseBody } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';

import type { BlobHashTree, YHash } from './merkle-tree';

const GATEWAY_VERSION = 'v1';
const MAX_CONCURRENT_UPLOADS = 10;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const DEFAULT_BUCKET_NAME = 'default-bucket';
const DEFAULT_PROJECT_ID = '0000000-0000-0000-0000-00000000000';

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

export interface BlobStorageGatewayClientConfig {
  agent: HttpAgent;
  /** Storage bucket name. Defaults to "default-bucket". */
  bucketName?: string;
  canisterId: string;
  gatewayUrl: string;
  /** Caffeine project ID. Defaults to zeroed UUID for standalone usage. */
  projectId?: string;
}

export class BlobStorageGatewayClient {
  readonly #agent: HttpAgent;
  readonly #bucketName: string;
  readonly #canisterId: string;
  readonly #gatewayUrl: string;
  readonly #projectId: string;

  constructor(config: BlobStorageGatewayClientConfig) {
    this.#agent = config.agent;
    this.#canisterId = config.canisterId;
    this.#gatewayUrl = config.gatewayUrl;
    this.#bucketName = config.bucketName ?? DEFAULT_BUCKET_NAME;
    this.#projectId = config.projectId ?? DEFAULT_PROJECT_ID;
  }

  /**
   * Call `_immutableObjectStorageCreateCertificate` on the canister and
   * extract the IC response certificate from the v4 response body.
   */
  async createCertificate(rootHash: string): Promise<Uint8Array> {
    const arg = IDL.encode([IDL.Text], [rootHash]);
    const result = await this.#agent.call(this.#canisterId, {
      methodName: '_immutableObjectStorageCreateCertificate',
      arg,
    });
    const body = result.response.body;
    if (isV4ResponseBody(body)) {
      return body.certificate;
    }
    throw new Error(
      'Expected v4 response body with certificate from IC update call',
    );
  }

  /** Construct a download URL for a blob on the storage gateway. */
  getDownloadUrl(blobHash: string): string {
    return `${this.#gatewayUrl}/${GATEWAY_VERSION}/blob/?blob_hash=${encodeURIComponent(blobHash)}&owner_id=${encodeURIComponent(this.#canisterId)}&project_id=${encodeURIComponent(this.#projectId)}`;
  }

  /** Upload the blob tree + IC certificate to the blob storage gateway. */
  async uploadBlobTree(params: {
    blobTree: BlobHashTree;
    certificate: Uint8Array;
    totalSize: number;
  }): Promise<void> {
    const treeJSON = params.blobTree.toJSON();
    const url = `${this.#gatewayUrl}/${GATEWAY_VERSION}/blob-tree/`;
    const body = JSON.stringify({
      blob_tree: treeJSON,
      bucket_name: this.#bucketName,
      num_blob_bytes: params.totalSize,
      owner: this.#canisterId,
      project_id: this.#projectId,
      headers: params.blobTree.headers,
      auth: {
        OwnerEgressSignature: Array.from(params.certificate),
      },
    });

    await withRetry(async () => {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Caffeine-Project-ID': this.#projectId,
        },
        body,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throwHttpError(`Failed to upload blob tree: ${response.status} ${response.statusText} - ${errorText}`, response.status);
      }
    });
  }

  /** Upload a single chunk to the gateway. */
  async uploadChunk(params: {
    blobHash: string;
    chunkBytes: Uint8Array;
    chunkHash: string;
    chunkIndex: number;
  }): Promise<{ isComplete: boolean }> {
    return withRetry(async () => {
      const queryParams = new URLSearchParams({
        owner_id: this.#canisterId,
        blob_hash: params.blobHash,
        chunk_hash: params.chunkHash,
        chunk_index: params.chunkIndex.toString(),
        bucket_name: this.#bucketName,
        project_id: this.#projectId,
      });
      const url = `${this.#gatewayUrl}/${GATEWAY_VERSION}/chunk/?${queryParams}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Caffeine-Project-ID': this.#projectId,
        },
        body: params.chunkBytes as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throwHttpError(`Failed to upload chunk ${params.chunkIndex}: ${response.status} ${response.statusText} - ${errorText}`, response.status);
      }

      const result = (await response.json()) as { status: string };
      return { isComplete: result.status === 'blob_complete' };
    });
  }

  /**
   * Upload all chunks in parallel using `MAX_CONCURRENT_UPLOADS` workers.
   * Each worker processes every Nth chunk (round-robin), matching the
   * reference implementation's fan-out pattern.
   */
  async uploadChunks(
    encryptedChunks: Uint8Array[],
    chunkHashes: YHash[],
    blobHash: string,
    onProgress?: (completedChunks: number, totalChunks: number) => void,
  ): Promise<void> {
    let completedChunks = 0;
    const total = encryptedChunks.length;

    const uploadSingle = async (index: number) => {
      await this.uploadChunk({
        chunkBytes: encryptedChunks[index],
        blobHash,
        chunkHash: chunkHashes[index].toShaString(),
        chunkIndex: index,
      });
      completedChunks++;
      onProgress?.(completedChunks, total);
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, total) }, async (_, workerId) => {
        for (let i = workerId; i < total; i += MAX_CONCURRENT_UPLOADS) {
          await uploadSingle(i);
        }
      }),
    );
  }
}

// -------------------------------------------------------------------
// Retry logic (from @caffeineai/object-storage reference)
// -------------------------------------------------------------------

function isRetriableError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status !== undefined) {
    if (status === 408 || status === 429) return true;
    if (status >= 400 && status < 500) return false;
    if (status >= 500) return true;
  }

  const msg = (error instanceof Error ? error.message : '').toLowerCase();
  if (/ssl|tls|network error|connection|timeout|fetch/.test(msg)) return true;
  if (/validation|invalid|malformed|unauthorized|forbidden|not found/.test(msg)) return false;

  return true;
}

function throwHttpError(message: string, status: number): never {
  const error = new Error(message);
  (error as { response: { status: number } } & Error).response = { status };
  throw error;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === MAX_RETRIES || !isRetriableError(error)) {
        throw error;
      }

      const delay = Math.min(
        BASE_DELAY_MS * 2 ** attempt + Math.random() * 1000,
        MAX_DELAY_MS,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Unknown error during retry');
}
