import { Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@rabbithole/declarations', () => ({
  encryptedStorageIdlFactory: () => ({}),
}));

vi.mock('./utils/verify-ic-certificate', () => ({
  verifyIcCertificate: vi.fn(async (response: { body: number[] | Uint8Array }) =>
    response.body instanceof Uint8Array ? response.body : new Uint8Array(response.body)),
}));

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
    getStorageBackendType: ReturnType<typeof vi.fn>;
    http_request: ReturnType<typeof vi.fn>;
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
          File: {
            encryptionMode: { Plaintext: null },
          },
        },
      })),
      getStorageBackendType: vi.fn(async () => ({ BlobStorage: null })),
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

  it('uploads plaintext bytes through blob-tree/chunk flow and commits metadata on-chain', async () => {
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
      encryptionMode: 'Plaintext',
    }]);

    expect(actorMock.create).toHaveBeenCalledOnce();
    expect(agentMock.call).toHaveBeenCalledOnce();
    expect(actorMock.commitCaffeineUpload).toHaveBeenCalledOnce();

    const commitArgs = actorMock.commitCaffeineUpload.mock.calls[0][0];
    const record = gateway.getRecord(commitArgs.rootHash);
    expect(record).toBeDefined();
    expect(record?.headers).toEqual([
      `Content-Length: ${bytes.byteLength}`,
      'Content-Type: text/plain',
    ]);
    expect(record?.uploadedChunks.size).toBe(1);

    const chunkHash = await YHash.fromChunk(bytes);
    const expectedTree = await BlobHashTree.build([chunkHash], {
      'Content-Type': 'text/plain',
      'Content-Length': bytes.byteLength.toString(),
    });

    expect(commitArgs.rootHash).toBe(expectedTree.tree.hash.toShaString());
    expect(Number(commitArgs.size)).toBe(bytes.byteLength);
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
      encryptionMode: 'Plaintext',
    }]);

    const chunks: Uint8Array[] = [];
    for await (const chunk of storage.downloadStream(['File', 'download.txt'], {
      encrypted: false,
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
      encryptionMode: 'Plaintext',
    }]);

    const { rootHash } = actorMock.commitCaffeineUpload.mock.calls[0][0];
    gateway.tamperDownload(rootHash);

    const readAll = async () => {
      const output: Uint8Array[] = [];
      for await (const chunk of storage.downloadStream(['File', 'tampered.txt'], {
        encrypted: false,
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
