import {
  createStore,
  del,
  get,
  set,
  type UseStore,
} from 'idb-keyval';

export interface BlobUploadSpool {
  readonly chunkCount: number;
  clear(): Promise<void>;
  getChunk(index: number): Promise<Uint8Array>;
  releaseChunk(index: number): Promise<void>;
  writeChunk(index: number, bytes: Uint8Array): Promise<void>;
}

const DB_NAME = 'rabbithole-blob-upload-spool';
const STORE_NAME = 'chunks';

let sharedStore: UseStore | undefined;

class IndexedDbBlobUploadSpool implements BlobUploadSpool {
  constructor(
    readonly chunkCount: number,
    private readonly id: string,
    private readonly store: UseStore,
  ) {}

  async clear(): Promise<void> {
    await Promise.all(
      Array.from({ length: this.chunkCount }, (_, index) =>
        del(this.#key(index), this.store),
      ),
    );
  }

  async getChunk(index: number): Promise<Uint8Array> {
    const chunk = await get<Uint8Array>(this.#key(index), this.store);
    if (!chunk) {
      throw new Error(`Blob upload spool chunk ${index} is missing`);
    }
    return chunk;
  }

  async releaseChunk(index: number): Promise<void> {
    await del(this.#key(index), this.store);
  }

  async writeChunk(index: number, bytes: Uint8Array): Promise<void> {
    await set(this.#key(index), new Uint8Array(bytes), this.store);
  }

  #key(index: number): string {
    return `${this.id}:${index}`;
  }
}

class MemoryBlobUploadSpool implements BlobUploadSpool {
  readonly #chunks = new Map<number, Uint8Array>();

  constructor(readonly chunkCount: number) {}

  async clear(): Promise<void> {
    this.#chunks.clear();
  }

  async getChunk(index: number): Promise<Uint8Array> {
    const chunk = this.#chunks.get(index);
    if (!chunk) {
      throw new Error(`Blob upload spool chunk ${index} is missing`);
    }
    return chunk;
  }

  async releaseChunk(index: number): Promise<void> {
    this.#chunks.delete(index);
  }

  async writeChunk(index: number, bytes: Uint8Array): Promise<void> {
    this.#chunks.set(index, new Uint8Array(bytes));
  }
}

export function createBlobUploadSpool(chunkCount: number): BlobUploadSpool {
  if (typeof globalThis.indexedDB === 'undefined') {
    return new MemoryBlobUploadSpool(chunkCount);
  }

  sharedStore ??= createStore(DB_NAME, STORE_NAME);
  return new IndexedDbBlobUploadSpool(chunkCount, randomSpoolId(), sharedStore);
}

function randomSpoolId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
