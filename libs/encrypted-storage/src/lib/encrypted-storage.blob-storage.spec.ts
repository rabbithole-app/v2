import { Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThumbnailRef } from '@rabbithole/declarations/encrypted-storage';

const vetkeyMocks = vi.hoisted(() => {
  const encryptMessage = vi.fn(async (bytes: Uint8Array) => {
    const encrypted = new Uint8Array(bytes.byteLength + 28);
    encrypted.set(bytes);
    return encrypted;
  });
  const decryptMessage = vi.fn(async (bytes: Uint8Array) =>
    bytes.slice(0, Math.max(0, bytes.byteLength - 28)));
  const derivedKeyMaterial = {
    decryptMessage,
    encryptMessage,
    getCryptoKey: vi.fn(() => ({})),
  };
  return { decryptMessage, derivedKeyMaterial, encryptMessage };
});

vi.mock('@rabbithole/declarations', () => ({
  encryptedStorageIdlFactory: () => ({}),
}));

vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock('@dfinity/vetkeys', () => ({
  DerivedKeyMaterial: {
    fromCryptoKey: () => vetkeyMocks.derivedKeyMaterial,
  },
  DerivedPublicKey: {
    deserialize: () => ({}),
  },
  EncryptedVetKey: {
    deserialize: () => ({
      decryptAndVerify: () => ({
        asDerivedKeyMaterial: () => vetkeyMocks.derivedKeyMaterial,
      }),
    }),
  },
  TransportSecretKey: {
    random: () => ({
      publicKeyBytes: () => new Uint8Array([1, 2, 3]),
    }),
  },
}));

vi.mock('./utils/verify-ic-certificate', () => ({
  verifyIcCertificate: vi.fn(async (response: { body: number[] | Uint8Array }) =>
    response.body instanceof Uint8Array ? response.body : new Uint8Array(response.body)),
}));

import {
  AES_GCM_OVERHEAD,
  CAFFEINE_PLAINTEXT_CHUNK_SIZE,
} from './blob-storage/constants';
import { BlobHashTree, YHash } from './blob-storage/merkle-tree';
import { MockBlobGateway } from './blob-storage/mock-gateway';
import { EncryptedStorage } from './encrypted-storage';
import { type Progress, UploadState } from './types';

describe('EncryptedStorage BlobStorage integration', () => {
  const keyId: [Principal, Uint8Array] = [
    Principal.fromText('aaaaa-aa'),
    new TextEncoder().encode('blob-file-id'),
  ];
  const canisterId = Principal.fromText('aaaaa-aa');

  let gateway: MockBlobGateway;
  let actorMock: {
    commitCaffeineUpload: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    getEncryptedVetkey: ReturnType<typeof vi.fn>;
    getStorageBackendType: ReturnType<typeof vi.fn>;
    getVetkeyVerificationKey: ReturnType<typeof vi.fn>;
    http_request: ReturnType<typeof vi.fn>;
    preflightCaffeineUpload: ReturnType<typeof vi.fn>;
    preflightCaffeineUploadBatch: ReturnType<typeof vi.fn>;
  };
  let agentMock: {
    call: ReturnType<typeof vi.fn>;
    rootKey: Uint8Array;
  };

  beforeEach(async () => {
    gateway = new MockBlobGateway();
    vi.stubGlobal('fetch', vi.fn((input: Request | URL | string, init?: RequestInit) =>
      gateway.fetch(input, init)));

    actorMock = {
      create: vi.fn(async () => ({
        keyId,
        metadata: {
          File: {},
        },
      })),
      getEncryptedVetkey: vi.fn(async () => new Uint8Array([1])),
      getStorageBackendType: vi.fn(async () => ({ BlobStorage: null })),
      getVetkeyVerificationKey: vi.fn(async () => new Uint8Array([2])),
      preflightCaffeineUpload: vi.fn(async () => undefined),
      preflightCaffeineUploadBatch: vi.fn(async () => undefined),
      commitCaffeineUpload: vi.fn(async () => undefined),
      http_request: vi.fn(async () => {
        const commit = actorMock.commitCaffeineUpload.mock.calls.at(-1)?.[0];
        if (!commit) {
          throw new Error('Blob info requested before commit');
        }

        const body = new TextEncoder().encode(
          JSON.stringify({
            blobHash: commit.rootHash,
            contentType: commit.contentType,
            size: Number(commit.size),
          }),
        );

        return {
          status_code: 200,
          headers: [['IC-Certificate', 'certificate=:ZmFrZQ==:, tree=:ZmFrZQ==:']],
          body,
        };
      }),
    };

    agentMock = {
      rootKey: new Uint8Array([1, 2, 3]),
      call: vi.fn(async () => ({
        response: {
          body: {
            certificate: new Uint8Array([9, 8, 7]),
          },
        },
      })),
    };

    vi.spyOn(Actor, 'createActor').mockReturnValue(actorMock as never);
    vi.spyOn(Actor, 'agentOf').mockReturnValue(agentMock as never);
    vi.spyOn(Actor, 'canisterIdOf').mockReturnValue(canisterId);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    gateway.reset();
  });

  it('uploads encrypted bytes through blob-tree/chunk flow and commits metadata on-chain', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const bytes = new TextEncoder().encode('Blob storage integration upload');

    await storage.store([bytes, {
      fileName: 'blob.txt',
      contentType: 'text/plain',
    }]);

    expect(actorMock.create).toHaveBeenCalledOnce();
    expect(actorMock.preflightCaffeineUpload).toHaveBeenCalledOnce();
    expect(agentMock.call).toHaveBeenCalledOnce();
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledOnce();

    const commitArgs = actorMock.commitCaffeineUpload.mock.calls[0][0];
    const record = gateway.getRecord(commitArgs.rootHash);
    const encryptedBytes = new Uint8Array(bytes.byteLength + AES_GCM_OVERHEAD);
    encryptedBytes.set(bytes);
    expect(record).toBeDefined();
    expect(record?.headers).toEqual([
      `Content-Length: ${encryptedBytes.byteLength}`,
      'Content-Type: text/plain',
    ]);
    expect(record?.uploadedChunks.size).toBe(1);

    const chunkHash = await YHash.fromChunk(encryptedBytes);
    const expectedTree = await BlobHashTree.build([chunkHash], {
      'Content-Type': 'text/plain',
      'Content-Length': encryptedBytes.byteLength.toString(),
    });

    expect(commitArgs.rootHash).toBe(expectedTree.tree.hash.toShaString());
    expect(Number(commitArgs.size)).toBe(encryptedBytes.byteLength);
  });

  it('stops BlobStorage upload before gateway work when preflight rejects', async () => {
    actorMock.preflightCaffeineUpload.mockResolvedValueOnce({
      err: { message: 'File exceeds storage license quota' },
    });
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });

    await expect(storage.store([
      new TextEncoder().encode('too large'),
      { fileName: 'too-large.txt' },
    ])).rejects.toThrow('File exceeds storage license quota');

    expect(actorMock.create).toHaveBeenCalledOnce();
    expect(actorMock.preflightCaffeineUpload).toHaveBeenCalledOnce();
    expect(agentMock.call).not.toHaveBeenCalled();
    expect(actorMock.commitCaffeineUpload).not.toHaveBeenCalled();
  });

  it('retries transient BlobStorage Cashier self-call failures during preflight', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    actorMock.preflightCaffeineUpload
      .mockResolvedValueOnce({
        err: {
          message: 'Blob Storage Cashier top-up failed: could not perform self call',
        },
      })
      .mockResolvedValueOnce(undefined);
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const progress: Progress[] = [];

    await storage.store([
      new TextEncoder().encode('retry after cashier backpressure'),
      {
        fileName: 'cashier-retry.txt',
        onProgress: (state) => progress.push(state),
      },
    ]);

    expect(actorMock.preflightCaffeineUpload).toHaveBeenCalledTimes(2);
    expect(progress.some((state) => state.status === UploadState.WAITING_FOR_FUNDING)).toBe(true);
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledOnce();
  });

  it('retries transient BlobStorage remote-call failures during preflight', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    actorMock.preflightCaffeineUpload
      .mockResolvedValueOnce({
        err: {
          message: 'Blob Storage Cashier top-up failed: could not perform remote call',
        },
      })
      .mockResolvedValueOnce(undefined);
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });

    await storage.store([
      new TextEncoder().encode('retry after cashier remote call'),
      { fileName: 'cashier-remote-retry.txt' },
    ]);

    expect(actorMock.preflightCaffeineUpload).toHaveBeenCalledTimes(2);
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledOnce();
  });

  it('retries while BlobStorage Cashier top-up is already in progress', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    actorMock.preflightCaffeineUpload
      .mockResolvedValueOnce({
        err: {
          message: 'Blob Storage Cashier top-up failed: Blob Storage Cashier top-up is already in progress',
        },
      })
      .mockResolvedValueOnce(undefined);
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });

    await storage.store([
      new TextEncoder().encode('retry after cashier top-up guard'),
      { fileName: 'cashier-guard-retry.txt' },
    ]);

    expect(actorMock.preflightCaffeineUpload).toHaveBeenCalledTimes(2);
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledOnce();
  });

  it('retries while BlobStorage storage funding is already in progress', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    actorMock.preflightCaffeineUpload
      .mockResolvedValueOnce({
        err: {
          code: { FundingPending: null },
          message: 'Storage funding is already in progress',
        },
      })
      .mockResolvedValueOnce(undefined);
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const progress: Progress[] = [];

    await storage.store([
      new TextEncoder().encode('retry after storage funding guard'),
      {
        fileName: 'storage-funding-guard-retry.txt',
        onProgress: (state) => progress.push(state),
      },
    ]);

    expect(actorMock.preflightCaffeineUpload).toHaveBeenCalledTimes(2);
    expect(progress.some((state) => state.status === UploadState.WAITING_FOR_FUNDING)).toBe(true);
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledOnce();
  });

  it('uses one shared BlobStorage preflight for files in the same upload group', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const first = new TextEncoder().encode('one');
    const second = new TextEncoder().encode('two files');
    const blobStoragePreflight = storage.preflightBlobStorageUploads([
      { entry: ['File', 'batch-one.txt'], sourceSize: first.byteLength },
      { entry: ['File', 'batch-two.txt'], sourceSize: second.byteLength },
    ]);

    await Promise.all([
      storage.store([first, {
        fileName: 'batch-one.txt',
        blobStoragePreflight,
      }]),
      storage.store([second, {
        fileName: 'batch-two.txt',
        blobStoragePreflight,
      }]),
    ]);

    expect(actorMock.preflightCaffeineUpload).not.toHaveBeenCalled();
    expect(actorMock.preflightCaffeineUploadBatch).toHaveBeenCalledOnce();
    expect(actorMock.preflightCaffeineUploadBatch.mock.calls[0][0]).toEqual([
      {
        entry: [{ File: null }, 'batch-one.txt'],
        size: BigInt(first.byteLength + AES_GCM_OVERHEAD),
      },
      {
        entry: [{ File: null }, 'batch-two.txt'],
        size: BigInt(second.byteLength + AES_GCM_OVERHEAD),
      },
    ]);
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledTimes(2);
  });

  it('uploads multi-chunk encrypted blobs through a bounded readable source', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const bytes = new Uint8Array(CAFFEINE_PLAINTEXT_CHUNK_SIZE + 17);
    bytes.fill(7, 0, CAFFEINE_PLAINTEXT_CHUNK_SIZE);
    bytes.fill(11, CAFFEINE_PLAINTEXT_CHUNK_SIZE);

    const readable = {
      close: vi.fn(async () => undefined),
      contentType: 'application/octet-stream',
      fileName: 'large.bin',
      length: bytes.byteLength,
      open: vi.fn(async () => undefined),
      slice: vi.fn(async (start: number, end: number) => bytes.slice(start, end)),
    };

    await storage.store([readable, {}]);

    const commitArgs = actorMock.commitCaffeineUpload.mock.calls[0][0];
    const record = gateway.getRecord(commitArgs.rootHash);

    expect(readable.open).toHaveBeenCalledOnce();
    expect(readable.close).toHaveBeenCalledOnce();
    expect(readable.slice).toHaveBeenCalledTimes(2);
    expect(record?.uploadedChunks.size).toBe(2);
    expect(Number(commitArgs.size)).toBe(bytes.byteLength + 2 * AES_GCM_OVERHEAD);
  });

  it('reports preparing between vetKey request and gateway upload', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const progress: Progress[] = [];

    await storage.store([
      new TextEncoder().encode('Blob progress state order'),
      {
        fileName: 'progress.txt',
        contentType: 'text/plain',
        onProgress: (state) => progress.push(state),
      },
    ]);

    const statuses = progress.map((state) => state.status);
    const requestingVetkeysIndex = statuses.indexOf(UploadState.REQUESTING_VETKD);
    const preparingIndex = statuses.indexOf(UploadState.PREPARING);
    const uploadingIndex = statuses.indexOf(UploadState.IN_PROGRESS);
    const finalizingIndex = statuses.indexOf(UploadState.FINALIZING);

    expect(requestingVetkeysIndex).toBeGreaterThanOrEqual(0);
    expect(preparingIndex).toBeGreaterThan(requestingVetkeysIndex);
    expect(uploadingIndex).toBeGreaterThan(preparingIndex);
    expect(finalizingIndex).toBeGreaterThan(uploadingIndex);
  });

  it('downloads blob bytes through certified metadata + gateway flow', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const bytes = new TextEncoder().encode('Blob storage integration download');

    await storage.store([bytes, {
      fileName: 'download.txt',
      contentType: 'text/plain',
    }]);

    const chunks: Uint8Array[] = [];
    for await (const chunk of storage.downloadStream(['File', 'download.txt'], {
      storageBackend: 'BlobStorage',
      keyId,
      totalChunks: 1,
    })) {
      chunks.push(chunk);
    }

    expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))).toEqual(
      Buffer.from(bytes),
    );
    expect(actorMock.http_request).toHaveBeenCalledOnce();
  });

  it('reports BlobStorage download progress while reading gateway bytes', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const bytes = new Uint8Array(CAFFEINE_PLAINTEXT_CHUNK_SIZE + 29);
    bytes.fill(3);

    await storage.store([bytes, {
      fileName: 'download-progress.bin',
      contentType: 'application/octet-stream',
    }]);

    const events: string[] = [];
    for await (const chunk of storage.downloadStream(['File', 'download-progress.bin'], {
      storageBackend: 'BlobStorage',
      keyId,
      totalChunks: 2,
      onProgress: (chunkIndex, totalChunks) => events.push(`progress:${chunkIndex}/${totalChunks}`),
    })) {
      expect(chunk.byteLength).toBeGreaterThan(0);
      events.push('chunk');
    }

    expect(events[0]).toMatch(/^progress:/);
    const firstChunkIndex = events.indexOf('chunk');
    expect(firstChunkIndex).toBeGreaterThan(0);
    expect(events).toEqual([
      'progress:1/2',
      'chunk',
      'progress:2/2',
      'chunk',
    ]);
  });

  it('includes gateway response body when thumbnail download fails', async () => {
    const gatewayError = 'Owner does not have sufficient balance: aaaaa-aa';
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(gatewayError, {
        status: 403,
        statusText: 'Forbidden',
      })));
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const thumbnailRef: ThumbnailRef = {
      BlobStorage: {
        rootHash: 'sha256:' + 'aa'.repeat(32),
        blobId: new Uint8Array(),
        sha256: [],
        contentType: 'image/jpeg',
        size: 1n,
        encryption: {
          algorithm: 'AES-GCM-256+vetkey-wrap-v1',
          wrappedKey: new Uint8Array(),
          blobIv: new Uint8Array(12),
          scopeKeyId: keyId,
        },
      },
    };

    await expect(storage.getThumbnailUrl(thumbnailRef)).rejects.toThrow(
      `Thumbnail download failed: 403 Forbidden - ${gatewayError}`,
    );
  });

  it('streams verified BlobStorage chunks before a later tampered chunk fails', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const bytes = new Uint8Array(CAFFEINE_PLAINTEXT_CHUNK_SIZE + 37);
    bytes.fill(5);

    await storage.store([bytes, {
      fileName: 'stream-before-tamper.bin',
      contentType: 'application/octet-stream',
    }]);

    const { rootHash } = actorMock.commitCaffeineUpload.mock.calls[0][0];
    gateway.tamperDownloadChunk(rootHash, 1);

    const iterator = storage.downloadStream(['File', 'stream-before-tamper.bin'], {
      storageBackend: 'BlobStorage',
      keyId,
      totalChunks: 2,
    })[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toHaveLength(CAFFEINE_PLAINTEXT_CHUNK_SIZE);

    await expect(iterator.next()).rejects.toThrow(
      'Blob integrity verification failed: chunk 1 does not match blob tree',
    );
  });

  it('fails download when gateway blob is tampered', async () => {
    const storage = new EncryptedStorage({
      canisterId,
      agent: agentMock as never,
      origin: 'https://example.test',
      blobStorageGatewayUrl: gateway.url,
    });
    const bytes = new TextEncoder().encode('Tamper detection for blob storage');

    await storage.store([bytes, {
      fileName: 'tampered.txt',
      contentType: 'text/plain',
    }]);

    const { rootHash } = actorMock.commitCaffeineUpload.mock.calls[0][0];
    gateway.tamperDownload(rootHash);

    const readAll = async () => {
      const output: Uint8Array[] = [];
      for await (const chunk of storage.downloadStream(['File', 'tampered.txt'], {
        storageBackend: 'BlobStorage',
        keyId,
        totalChunks: 1,
      })) {
        output.push(chunk);
      }
      return output;
    };

    await expect(readAll()).rejects.toThrow(
      'Blob integrity verification failed',
    );
  });
});
