import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BlobStorageGatewayClient } from './gateway-client';
import { BlobHashTree, YHash } from './merkle-tree';

// Mock global fetch
const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

const CANISTER_ID = 'aaaaa-aa';
const GATEWAY_URL = 'https://dev-blob.caffeine.ai';
const DEFAULT_PROJECT_ID = '0000000-0000-0000-0000-00000000000';

function createClient(agentOverride?: unknown) {
  const agent = agentOverride ?? {
    call: vi.fn().mockResolvedValue({
      response: {
        body: {
          certificate: new Uint8Array([1, 2, 3, 4]),
        },
      },
    }),
  };

  return {
    client: new BlobStorageGatewayClient({
      agent: agent as never,
      canisterId: CANISTER_ID,
      gatewayUrl: GATEWAY_URL,
    }),
    agent,
  };
}

describe('BlobStorageGatewayClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('getDownloadUrl', () => {
    it('constructs correct gateway URL', () => {
      const { client } = createClient();
      const url = client.getDownloadUrl('sha256:abc123');
      expect(url).toContain(`${GATEWAY_URL}/v1/blob/`);
      expect(url).toContain(`blob_hash=${encodeURIComponent('sha256:abc123')}`);
      expect(url).toContain(`owner_id=${encodeURIComponent(CANISTER_ID)}`);
      expect(url).toContain(`project_id=${encodeURIComponent(DEFAULT_PROJECT_ID)}`);
    });
  });

  describe('createCertificate', () => {
    it('calls agent.call with correct method and extracts certificate', async () => {
      const certificate = new Uint8Array([10, 20, 30]);
      const mockAgent = {
        call: vi.fn().mockResolvedValue({
          response: {
            body: { certificate },
          },
        }),
      };
      const { client } = createClient(mockAgent);

      const result = await client.createCertificate('sha256:' + 'ab'.repeat(32));

      expect(mockAgent.call).toHaveBeenCalledWith(
        CANISTER_ID,
        expect.objectContaining({
          methodName: '_immutableObjectStorageCreateCertificate',
        }),
      );
      expect(result).toBe(certificate);
    });

    it('throws when response body has no certificate', async () => {
      const mockAgent = {
        call: vi.fn().mockResolvedValue({
          response: { body: null },
        }),
      };
      const { client } = createClient(mockAgent);

      await expect(
        client.createCertificate('sha256:' + 'ab'.repeat(32)),
      ).rejects.toThrow('v4 response body');
    });
  });

  describe('uploadBlobTree', () => {
    it('sends PUT to /v1/blob-tree/ with correct body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const { client } = createClient();

      const chunkHash = await YHash.fromChunk(new Uint8Array([1]));
      const blobTree = await BlobHashTree.build([chunkHash], {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '100',
      });
      const certificate = new Uint8Array([5, 6, 7]);

      await client.uploadBlobTree({ blobTree, certificate, totalSize: 100 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${GATEWAY_URL}/v1/blob-tree/`);
      expect(options.method).toBe('PUT');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Caffeine-Project-ID']).toBe(DEFAULT_PROJECT_ID);

      const body = JSON.parse(options.body);
      expect(body.blob_tree.tree_type).toBe('DSBMTWH');
      expect(body.bucket_name).toBe('default-bucket');
      expect(body.num_blob_bytes).toBe(100);
      expect(body.owner).toBe(CANISTER_ID);
      expect(body.project_id).toBe(DEFAULT_PROJECT_ID);
      expect(body.auth.OwnerEgressSignature).toEqual([5, 6, 7]);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'invalid tree',
      });
      const { client } = createClient();

      const chunkHash = await YHash.fromChunk(new Uint8Array([1]));
      const blobTree = await BlobHashTree.build([chunkHash]);

      await expect(
        client.uploadBlobTree({
          blobTree,
          certificate: new Uint8Array([1]),
          totalSize: 1,
        }),
      ).rejects.toThrow('400');
    });
  });

  describe('uploadChunk', () => {
    it('sends PUT to /v1/chunk/ with correct query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });
      const { client } = createClient();

      const result = await client.uploadChunk({
        chunkBytes: new Uint8Array([1, 2, 3]),
        blobHash: 'sha256:' + 'aa'.repeat(32),
        chunkHash: 'sha256:' + 'bb'.repeat(32),
        chunkIndex: 0,
      });

      expect(result.isComplete).toBe(false);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/chunk/');
      expect(url).toContain(`owner_id=${CANISTER_ID}`);
      expect(url).toContain('chunk_index=0');
      expect(url).toContain('bucket_name=default-bucket');
      expect(options.method).toBe('PUT');
      expect(options.headers['Content-Type']).toBe('application/octet-stream');
      expect(options.body).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('returns isComplete=true when gateway says blob_complete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'blob_complete' }),
      });
      const { client } = createClient();

      const result = await client.uploadChunk({
        chunkBytes: new Uint8Array([1]),
        blobHash: 'sha256:' + 'aa'.repeat(32),
        chunkHash: 'sha256:' + 'bb'.repeat(32),
        chunkIndex: 0,
      });

      expect(result.isComplete).toBe(true);
    });
  });

  describe('uploadChunks', () => {
    it('uploads all chunks and reports progress', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });
      const { client } = createClient();

      const chunks = [
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
      ];
      const hashes = await Promise.all(chunks.map((c) => YHash.fromChunk(c)));
      const blobHash = 'sha256:' + 'cc'.repeat(32);

      const progress: Array<[number, number]> = [];
      await client.uploadChunks(chunks, hashes, blobHash, (done, total) => {
        progress.push([done, total]);
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(progress).toHaveLength(3);
      expect(progress[progress.length - 1]).toEqual([3, 3]);
    });
  });
});
