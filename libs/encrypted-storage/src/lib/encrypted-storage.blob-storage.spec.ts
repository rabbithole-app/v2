import { Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
