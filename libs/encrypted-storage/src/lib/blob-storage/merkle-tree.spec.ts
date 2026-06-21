import { describe, expect, it } from 'vitest';

import {
  BlobHashTree,
  verifiedBlobTreeChunkHashes,
  verifyBlobIntegrity,
  YHash,
} from './merkle-tree';

describe('YHash', () => {
  it('should create from 32 bytes', () => {
    const bytes = new Uint8Array(32).fill(0xab);
    const hash = new YHash(bytes);
    expect(hash.bytes).toEqual(bytes);
    expect(hash.bytes).not.toBe(bytes); // defensive copy
  });

  it('fromChunk hashes with "icfs-chunk/" domain separator', async () => {
    const chunk = new Uint8Array([1, 2, 3]);
    const hash = await YHash.fromChunk(chunk);
    expect(hash.bytes.length).toBe(32);

    // Verify domain separator: SHA-256("icfs-chunk/" + [1,2,3])
    const prefix = new TextEncoder().encode('icfs-chunk/');
    const combined = new Uint8Array(prefix.length + chunk.length);
    combined.set(prefix);
    combined.set(chunk, prefix.length);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    expect(hash.bytes).toEqual(expected);
  });

  it('fromNodes hashes with "ynode/" domain separator', async () => {
    const left = await YHash.fromChunk(new Uint8Array([1]));
    const right = await YHash.fromChunk(new Uint8Array([2]));
    const node = await YHash.fromNodes(left, right);
    expect(node.bytes.length).toBe(32);

    // Verify: SHA-256("ynode/" + left.bytes + right.bytes)
    const prefix = new TextEncoder().encode('ynode/');
    const combined = new Uint8Array(prefix.length + 32 + 32);
    combined.set(prefix);
    combined.set(left.bytes, prefix.length);
    combined.set(right.bytes, prefix.length + 32);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    expect(node.bytes).toEqual(expected);
  });

  it('fromNodes uses "UNBALANCED" for null children', async () => {
    const left = await YHash.fromChunk(new Uint8Array([1]));
    const node = await YHash.fromNodes(left, null);
    expect(node.bytes.length).toBe(32);

    // Verify: SHA-256("ynode/" + left.bytes + "UNBALANCED")
    const prefix = new TextEncoder().encode('ynode/');
    const unbalanced = new TextEncoder().encode('UNBALANCED');
    const combined = new Uint8Array(prefix.length + 32 + unbalanced.length);
    combined.set(prefix);
    combined.set(left.bytes, prefix.length);
    combined.set(unbalanced, prefix.length + 32);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    expect(node.bytes).toEqual(expected);
  });

  it('fromHeaders sorts and hashes with "icfs-metadata/" separator', async () => {
    const hash = await YHash.fromHeaders({
      'Content-Type': 'text/plain',
      'Content-Length': '42',
    });
    expect(hash.bytes.length).toBe(32);

    // Headers sorted: Content-Length < Content-Type
    const headerStr = 'Content-Length: 42\nContent-Type: text/plain\n';
    const prefix = new TextEncoder().encode('icfs-metadata/');
    const data = new TextEncoder().encode(headerStr);
    const combined = new Uint8Array(prefix.length + data.length);
    combined.set(prefix);
    combined.set(data, prefix.length);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
    expect(hash.bytes).toEqual(expected);
  });

  it('toShaString formats as "sha256:<64 hex chars>"', async () => {
    const hash = await YHash.fromChunk(new Uint8Array([0]));
    const str = hash.toShaString();
    expect(str).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fromHex decodes hex string to bytes', () => {
    const hex = 'ab'.repeat(32);
    const hash = YHash.fromHex(hex);
    expect(hash.bytes).toEqual(new Uint8Array(32).fill(0xab));
  });
});

describe('BlobHashTree', () => {
  it('builds tree with 1 chunk', async () => {
    const chunk = new Uint8Array([10, 20, 30]);
    const chunkHash = await YHash.fromChunk(chunk);
    const tree = await BlobHashTree.build([chunkHash]);

    const json = tree.toJSON();
    expect(json.tree_type).toBe('DSBMTWH');
    expect(json.chunk_hashes).toHaveLength(1);
    expect(json.chunk_hashes[0]).toBe(chunkHash.toShaString());
    // Single chunk = leaf is root
    expect(json.tree.hash).toBe(chunkHash.toShaString());
    expect(json.tree.left).toBeNull();
    expect(json.tree.right).toBeNull();
  });

  it('builds tree with 2 chunks', async () => {
    const h1 = await YHash.fromChunk(new Uint8Array([1]));
    const h2 = await YHash.fromChunk(new Uint8Array([2]));
    const tree = await BlobHashTree.build([h1, h2]);

    const json = tree.toJSON();
    expect(json.chunk_hashes).toHaveLength(2);
    // Root = ynode(h1, h2)
    expect(json.tree.left?.hash).toBe(h1.toShaString());
    expect(json.tree.right?.hash).toBe(h2.toShaString());
    const expectedRoot = await YHash.fromNodes(h1, h2);
    expect(json.tree.hash).toBe(expectedRoot.toShaString());
  });

  it('builds tree with 3 chunks (odd — uses UNBALANCED)', async () => {
    const h1 = await YHash.fromChunk(new Uint8Array([1]));
    const h2 = await YHash.fromChunk(new Uint8Array([2]));
    const h3 = await YHash.fromChunk(new Uint8Array([3]));
    const tree = await BlobHashTree.build([h1, h2, h3]);

    const json = tree.toJSON();
    expect(json.chunk_hashes).toHaveLength(3);
    // Level 1: node(h1,h2), node(h3,UNBALANCED)
    // Level 2: root = node(level1[0], level1[1])
    expect(json.tree.left).not.toBeNull();
    expect(json.tree.right).not.toBeNull();
    // Left child has h1 and h2 as children
    expect(json.tree.left!.left?.hash).toBe(h1.toShaString());
    expect(json.tree.left!.right?.hash).toBe(h2.toShaString());
    // Right child has h3 as left, null (no right node in JSON)
    expect(json.tree.right!.left?.hash).toBe(h3.toShaString());
    expect(json.tree.right!.right).toBeNull();
  });

  it('builds tree with headers — combined root', async () => {
    const h1 = await YHash.fromChunk(new Uint8Array([1]));
    const tree = await BlobHashTree.build([h1], {
      'Content-Type': 'application/octet-stream',
      'Content-Length': '100',
    });

    const json = tree.toJSON();
    expect(json.headers).toEqual([
      'Content-Length: 100',
      'Content-Type: application/octet-stream',
    ]);
    // Root should be combined: ynode(chunksRoot, metadataRoot)
    // Left = chunks root (h1), right = metadata leaf
    expect(json.tree.left?.hash).toBe(h1.toShaString());
    expect(json.tree.right).not.toBeNull();
    // Root hash differs from chunk hash (combined with metadata)
    expect(json.tree.hash).not.toBe(h1.toShaString());
  });

  it('builds tree with empty chunk list (sentinel hash)', async () => {
    const tree = await BlobHashTree.build([]);

    const json = tree.toJSON();
    expect(json.chunk_hashes).toHaveLength(1);
    // Sentinel hash from reference implementation
    expect(json.tree.left).toBeNull();
    expect(json.tree.right).toBeNull();
  });

  it('toJSON produces correct structure', async () => {
    const h1 = await YHash.fromChunk(new Uint8Array([1]));
    const tree = await BlobHashTree.build([h1]);
    const json = tree.toJSON();

    expect(json).toHaveProperty('tree_type', 'DSBMTWH');
    expect(json).toHaveProperty('chunk_hashes');
    expect(json).toHaveProperty('tree');
    expect(json).toHaveProperty('headers');
    expect(Array.isArray(json.chunk_hashes)).toBe(true);
    expect(Array.isArray(json.headers)).toBe(true);
  });
});

describe('verifyBlobIntegrity', () => {
  it('returns true for unmodified data', async () => {
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const contentType = 'application/octet-stream';

    // Build expected hash the same way upload does
    const chunkHash = await YHash.fromChunk(data);
    const tree = await BlobHashTree.build([chunkHash], {
      'Content-Type': contentType,
      'Content-Length': data.byteLength.toString(),
    });
    const expectedHash = tree.tree.hash.toShaString();

    const result = await verifyBlobIntegrity(data, expectedHash, contentType);
    expect(result).toBe(true);
  });

  it('returns false when data is tampered', async () => {
    const data = new Uint8Array([10, 20, 30, 40, 50]);
    const contentType = 'application/octet-stream';

    const chunkHash = await YHash.fromChunk(data);
    const tree = await BlobHashTree.build([chunkHash], {
      'Content-Type': contentType,
      'Content-Length': data.byteLength.toString(),
    });
    const expectedHash = tree.tree.hash.toShaString();

    // Tamper with one byte
    const tampered = new Uint8Array(data);
    tampered[2] = 0xff;

    const result = await verifyBlobIntegrity(tampered, expectedHash, contentType);
    expect(result).toBe(false);
  });

  it('returns false when content-type differs', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const contentType = 'text/plain';

    const chunkHash = await YHash.fromChunk(data);
    const tree = await BlobHashTree.build([chunkHash], {
      'Content-Type': contentType,
      'Content-Length': data.byteLength.toString(),
    });
    const expectedHash = tree.tree.hash.toShaString();

    const result = await verifyBlobIntegrity(data, expectedHash, 'image/png');
    expect(result).toBe(false);
  });

  it('verifies multi-chunk data correctly', async () => {
    const chunkSize = 16;
    // 2.5 chunks worth of data
    const data = new Uint8Array(40);
    for (let i = 0; i < data.length; i++) data[i] = i;
    const contentType = 'application/octet-stream';

    // Build hash with same chunk size
    const chunks = [data.subarray(0, 16), data.subarray(16, 32), data.subarray(32, 40)];
    const chunkHashes = await Promise.all(chunks.map(c => YHash.fromChunk(c)));
    const tree = await BlobHashTree.build(chunkHashes, {
      'Content-Type': contentType,
      'Content-Length': data.byteLength.toString(),
    });
    const expectedHash = tree.tree.hash.toShaString();

    const result = await verifyBlobIntegrity(data, expectedHash, contentType, chunkSize);
    expect(result).toBe(true);

    // Tamper with last chunk
    const tampered = new Uint8Array(data);
    tampered[35] = 0xff;
    const resultTampered = await verifyBlobIntegrity(tampered, expectedHash, contentType, chunkSize);
    expect(resultTampered).toBe(false);
  });
});

describe('verifiedBlobTreeChunkHashes', () => {
  it('returns chunk hashes when the tree matches trusted metadata', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const chunkHash = await YHash.fromChunk(data);
    const tree = await BlobHashTree.build([chunkHash], {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
    });

    await expect(
      verifiedBlobTreeChunkHashes(
        tree.toJSON(),
        tree.tree.hash.toShaString(),
        'application/octet-stream',
        data.byteLength,
      ),
    ).resolves.toEqual([chunkHash.toShaString()]);
  });

  it('rejects chunk hashes that do not rebuild the trusted root', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const chunkHash = await YHash.fromChunk(data);
    const tree = await BlobHashTree.build([chunkHash], {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
    });
    const json = tree.toJSON();
    json.chunk_hashes = ['sha256:' + 'ff'.repeat(32)];

    await expect(
      verifiedBlobTreeChunkHashes(
        json,
        tree.tree.hash.toShaString(),
        'application/octet-stream',
        data.byteLength,
      ),
    ).resolves.toBeNull();
  });
});
