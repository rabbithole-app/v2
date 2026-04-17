/**
 * DSBMTWH Merkle Tree implementation for the Immutable Object Storage protocol.
 *
 * Adapted from @caffeineai/object-storage (source recovered from source maps).
 * Uses domain-separated SHA-256 hashing with three prefixes:
 *   - "icfs-chunk/"    for leaf chunk hashes
 *   - "ynode/"         for internal tree nodes
 *   - "icfs-metadata/" for file metadata hashing
 *
 * @see https://github.com/dfinity/immutable-object-storage-example
 */

const SHA256_PREFIX = 'sha256:';
const DOMAIN_SEPARATOR_FOR_CHUNKS = new TextEncoder().encode('icfs-chunk/');
const DOMAIN_SEPARATOR_FOR_METADATA = new TextEncoder().encode('icfs-metadata/');
const DOMAIN_SEPARATOR_FOR_NODES = new TextEncoder().encode('ynode/');
const UNBALANCED_BYTES = new TextEncoder().encode('UNBALANCED');

// -------------------------------------------------------------------
// YHash — domain-separated SHA-256 wrapper (always 32 bytes)
// -------------------------------------------------------------------

export interface BlobHashTreeJSON {
  chunk_hashes: string[];
  headers: string[];
  tree: TreeNodeJSON;
  tree_type: 'DSBMTWH';
}

// -------------------------------------------------------------------
// BlobHashTree — the full DSBMTWH tree sent to the blob storage gateway
// -------------------------------------------------------------------

export interface TreeNode {
  hash: YHash;
  left: TreeNode | null;
  right: TreeNode | null;
}

export interface TreeNodeJSON {
  hash: string;
  left: TreeNodeJSON | null;
  right: TreeNodeJSON | null;
}

export class YHash {
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = new Uint8Array(bytes);
  }

  /** SHA-256( domainSeparator || data ). */
  static async fromBytes(domainSeparator: Uint8Array, data: Uint8Array): Promise<YHash> {
    const combined = new Uint8Array(domainSeparator.length + data.length);
    combined.set(domainSeparator);
    combined.set(data, domainSeparator.length);
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    return new YHash(new Uint8Array(hashBuffer));
  }

  /** Hash raw chunk data with the chunk domain separator. */
  static async fromChunk(data: Uint8Array): Promise<YHash> {
    return YHash.fromBytes(DOMAIN_SEPARATOR_FOR_CHUNKS, data);
  }

  /** Hash sorted header lines with the metadata domain separator. */
  static async fromHeaders(headers: Record<string, string>): Promise<YHash> {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`${key.trim()}: ${value.trim()}\n`);
    }
    lines.sort();
    return YHash.fromBytes(
      DOMAIN_SEPARATOR_FOR_METADATA,
      new TextEncoder().encode(lines.join('')),
    );
  }

  /** Decode a hex string into a YHash (32 bytes). */
  static fromHex(hexString: string): YHash {
    const bytes = new Uint8Array(
      hexString.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
    );
    return new YHash(bytes);
  }

  /** Hash two child nodes.  `null` is encoded as literal "UNBALANCED" bytes. */
  static async fromNodes(left: YHash | null, right: YHash | null): Promise<YHash> {
    const leftBytes = left instanceof YHash ? left.bytes : UNBALANCED_BYTES;
    const rightBytes = right instanceof YHash ? right.bytes : UNBALANCED_BYTES;
    return YHash.fromBytes(DOMAIN_SEPARATOR_FOR_NODES, concat(leftBytes, rightBytes));
  }

  /** "sha256:<64 hex chars>" */
  toShaString(): string {
    return `${SHA256_PREFIX}${this.toHex()}`;
  }

  private toHex(): string {
    return Array.from(this.bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

export class BlobHashTree {
  readonly chunkHashes: YHash[];
  readonly headers: string[];
  readonly tree: TreeNode;
  readonly treeType = 'DSBMTWH' as const;

  private constructor(chunkHashes: YHash[], tree: TreeNode, headers: string[]) {
    this.chunkHashes = chunkHashes;
    this.tree = tree;
    this.headers = headers;
  }

  /**
   * Build a DSBMTWH Merkle tree from chunk hashes and optional file headers.
   *
   * Headers are formatted as `"Key: Value"` strings, sorted alphabetically.
   * If headers are provided the tree root is a combined node of the chunks
   * sub-tree and the metadata hash.
   */
  static async build(
    chunkHashes: YHash[],
    headers: Record<string, string> = {},
  ): Promise<BlobHashTree> {
    const hashes = [...chunkHashes];

    // Empty file sentinel (matches Rust reference implementation)
    if (hashes.length === 0) {
      const hex = '8b8e620f084e48da0be2287fd12c5aaa4dbe14b468fd2e360f48d741fe7628a0';
      hashes.push(new YHash(new TextEncoder().encode(hex)));
    }

    // Create leaf nodes
    let level: TreeNode[] = hashes.map((hash) => ({ hash, left: null, right: null }));

    // Build tree bottom-up
    while (level.length > 1) {
      const nextLevel: TreeNode[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? null;
        const parentHash = await YHash.fromNodes(
          left.hash,
          right ? right.hash : null,
        );
        nextLevel.push({ hash: parentHash, left, right });
      }
      level = nextLevel;
    }

    const chunksRoot = level[0];

    // Normalise header strings
    const headerStrings = Object.entries(headers)
      .map(([k, v]) => `${k.trim()}: ${v.trim()}`)
      .sort();

    // If headers exist, combine chunks root with metadata root
    if (Object.keys(headers).length > 0) {
      const metadataRootHash = await YHash.fromHeaders(headers);
      const metadataRoot: TreeNode = { hash: metadataRootHash, left: null, right: null };
      const combinedRootHash = await YHash.fromNodes(chunksRoot.hash, metadataRoot.hash);
      const combinedRoot: TreeNode = { hash: combinedRootHash, left: chunksRoot, right: metadataRoot };
      return new BlobHashTree(hashes, combinedRoot, headerStrings);
    }

    return new BlobHashTree(hashes, chunksRoot, headerStrings);
  }

  /** Serialise for the gateway PUT /v1/blob-tree/ request. */
  toJSON(): BlobHashTreeJSON {
    return {
      tree_type: this.treeType,
      chunk_hashes: this.chunkHashes.map((h) => h.toShaString()),
      tree: nodeToJSON(this.tree),
      headers: this.headers,
    };
  }
}

// -------------------------------------------------------------------
// Verification
// -------------------------------------------------------------------

/**
 * Verify the integrity of a blob downloaded from the storage gateway.
 *
 * Re-computes the DSBMTWH Merkle root from the raw bytes (splitting into
 * `chunkSize`-byte chunks) and compares it against the on-chain `blobHash`.
 * This catches any tampering by the gateway or an intermediary CDN.
 *
 * @param allBytes    - The complete downloaded blob (encrypted ciphertext).
 * @param blobHash    - The expected root hash from the canister (`"sha256:…"`).
 * @param contentType - The file content-type (used in the metadata header).
 * @param chunkSize   - Protocol chunk size (default 1 MiB).
 * @returns `true` if the root hash matches; `false` otherwise.
 */
export async function verifyBlobIntegrity(
  allBytes: Uint8Array,
  blobHash: string,
  contentType: string,
  chunkSize = 1_048_576,
): Promise<boolean> {
  const chunkCount = Math.max(1, Math.ceil(allBytes.byteLength / chunkSize));

  const chunkHashes = await Promise.all(
    Array.from({ length: chunkCount }, (_, i) => {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, allBytes.byteLength);
      return YHash.fromChunk(allBytes.subarray(start, end));
    }),
  );

  const tree = await BlobHashTree.build(chunkHashes, {
    'Content-Type': contentType,
    'Content-Length': allBytes.byteLength.toString(),
  });

  return tree.tree.hash.toShaString() === blobHash;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

function nodeToJSON(node: TreeNode): TreeNodeJSON {
  return {
    hash: node.hash.toShaString(),
    left: node.left ? nodeToJSON(node.left) : null,
    right: node.right ? nodeToJSON(node.right) : null,
  };
}
