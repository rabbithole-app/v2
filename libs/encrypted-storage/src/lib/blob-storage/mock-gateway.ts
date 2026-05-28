import { uint8ArrayToArrayBuffer } from '../utils/bytes';
import { YHash } from './merkle-tree';

interface BlobRecord {
  chunkHashes: string[];
  headers: string[];
  owner: string;
  projectId: string;
  totalSize: number;
  uploadedChunks: Map<number, Uint8Array>;
}

interface BlobTreePayload {
  blob_tree: {
    chunk_hashes: string[];
    headers: string[];
    tree: { hash: string };
    tree_type: 'DSBMTWH';
  };
  num_blob_bytes: number;
  owner: string;
  project_id: string;
}

export class MockBlobGateway {
  readonly url = 'https://blob-gateway.test';
  readonly #blobs = new Map<string, BlobRecord>();

  readonly #tampered = new Set<string>();

  async fetch(input: Request | URL | string, init?: RequestInit): Promise<Response> {
    const requestUrl =
      typeof input === 'string' || input instanceof URL
        ? new URL(input.toString())
        : new URL(input.url);
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');

    if (method === 'PUT' && requestUrl.pathname === '/v1/blob-tree/') {
      return this.#handleBlobTree(init?.body);
    }

    if (method === 'PUT' && requestUrl.pathname === '/v1/chunk/') {
      return this.#handleChunk(requestUrl, init?.body);
    }

    if (method === 'GET' && requestUrl.pathname === '/v1/blob/') {
      return this.#handleBlobDownload(requestUrl);
    }

    return new Response('Not found', { status: 404 });
  }

  getRecord(blobHash: string): BlobRecord | undefined {
    return this.#blobs.get(blobHash);
  }

  reset(): void {
    this.#tampered.clear();
    this.#blobs.clear();
  }

  tamperDownload(blobHash: string): void {
    this.#tampered.add(blobHash);
  }

  #handleBlobDownload(requestUrl: URL): Response {
    const blobHash = requestUrl.searchParams.get('blob_hash');
    if (!blobHash) {
      return new Response('Missing blob_hash', { status: 400 });
    }

    const record = this.#blobs.get(blobHash);
    if (!record) {
      return new Response('Unknown blob hash', { status: 404 });
    }

    const bytes = concatChunks(record.uploadedChunks);
    const payload = this.#tampered.has(blobHash) ? tamper(bytes) : bytes;

    return new Response(uint8ArrayToArrayBuffer(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  async #handleBlobTree(bodyInit: BodyInit | null | undefined): Promise<Response> {
    const body = JSON.parse(await bodyToString(bodyInit)) as BlobTreePayload;
    const blobHash = body.blob_tree.tree.hash;

    this.#blobs.set(blobHash, {
      chunkHashes: body.blob_tree.chunk_hashes,
      headers: body.blob_tree.headers,
      owner: body.owner,
      projectId: body.project_id,
      totalSize: body.num_blob_bytes,
      uploadedChunks: new Map(),
    });

    return new Response(null, { status: 200 });
  }

  async #handleChunk(
    requestUrl: URL,
    bodyInit: BodyInit | null | undefined,
  ): Promise<Response> {
    const blobHash = requestUrl.searchParams.get('blob_hash');
    const chunkHash = requestUrl.searchParams.get('chunk_hash');
    const chunkIndexRaw = requestUrl.searchParams.get('chunk_index');

    if (!blobHash || !chunkHash || !chunkIndexRaw) {
      return new Response('Missing chunk query params', { status: 400 });
    }

    const record = this.#blobs.get(blobHash);
    if (!record) {
      return new Response('Unknown blob hash', { status: 404 });
    }

    const chunkBytes = await bodyToUint8Array(bodyInit);
    const expectedHash = (await YHash.fromChunk(chunkBytes)).toShaString();
    if (expectedHash !== chunkHash) {
      return new Response('Chunk hash mismatch', { status: 400 });
    }

    const chunkIndex = Number.parseInt(chunkIndexRaw, 10);
    record.uploadedChunks.set(chunkIndex, chunkBytes);

    const isComplete = record.uploadedChunks.size === record.chunkHashes.length;
    return Response.json({ status: isComplete ? 'blob_complete' : 'ok' });
  }
}

async function bodyToString(bodyInit: BodyInit | null | undefined): Promise<string> {
  const bytes = await bodyToUint8Array(bodyInit);
  return new TextDecoder().decode(bytes);
}

async function bodyToUint8Array(bodyInit: BodyInit | null | undefined): Promise<Uint8Array> {
  if (!bodyInit) return new Uint8Array();
  if (typeof bodyInit === 'string') return new TextEncoder().encode(bodyInit);
  if (bodyInit instanceof Uint8Array) return bodyInit;
  if (bodyInit instanceof ArrayBuffer) return new Uint8Array(bodyInit);
  if (ArrayBuffer.isView(bodyInit)) return new Uint8Array(bodyInit.buffer, bodyInit.byteOffset, bodyInit.byteLength);
  if (bodyInit instanceof Blob) return new Uint8Array(await bodyInit.arrayBuffer());
  throw new Error(`Unsupported mock gateway body type: ${typeof bodyInit}`);
}

function concatChunks(chunks: Map<number, Uint8Array>): Uint8Array {
  const ordered = [...chunks.entries()].sort(([a], [b]) => a - b);
  const total = ordered.reduce((sum, [, value]) => sum + value.byteLength, 0);
  const combined = new Uint8Array(total);

  let offset = 0;
  for (const [, chunk] of ordered) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

function tamper(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  if (copy.length > 0) {
    copy[copy.length - 1] ^= 0xff;
  }
  return copy;
}
