import { arrayBufferToUint8Array } from '@dfinity/utils';
import {
  DerivedKeyMaterial,
  DerivedPublicKey,
  EncryptedVetKey,
  TransportSecretKey,
} from '@dfinity/vetkeys';
import { Actor, ActorSubclass, HttpAgent } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { sha256 } from '@noble/hashes/sha2';
import { Derived, Store } from '@tanstack/store';
import { get, set } from 'idb-keyval';
import mime from 'mime/lite';
import { isMatching, match, P } from 'ts-pattern';

import {
  EncryptedStorageActorService,
  encryptedStorageIdlFactory,
  Entry as EntryRaw,
  StorageBackend,
} from '@rabbithole/declarations';

import { BlobStorageGatewayClient } from './blob-storage/gateway-client';
import { BlobHashTree, verifyBlobIntegrity, YHash } from './blob-storage/merkle-tree';
import {
  EncryptedStorageConfig,
  Entry,
  GrantStoragePermission,
  Progress,
  RevokeStoragePermission,
  StoragePermission,
  StoragePermissionItem,
  StoreArgs,
  StorePathArgs,
  StoreReadableArgs,
  toEncryptionMode,
  toEntryRaw,
  toOptionalEntryRaw,
  toStoragePermission,
  UploadState,
} from './types';
import { convertTreeNodes } from './utils';
import { limit, LimitFn } from './utils/limit';
import { verifyIcCertificate } from './utils/verify-ic-certificate';

/** Blob storage protocol chunk size: 1 MiB */
const CAFFEINE_CHUNK_SIZE = 1_048_576;
/** AES-GCM overhead per chunk: 12 bytes IV + 16 bytes auth tag */
const AES_GCM_OVERHEAD = 28;
/** Max plaintext that fits in one blob storage chunk after AES-GCM encryption */
const CAFFEINE_PLAINTEXT_CHUNK_SIZE = CAFFEINE_CHUNK_SIZE - AES_GCM_OVERHEAD;

export class EncryptedStorage {
  readonly #actor: ActorSubclass<EncryptedStorageActorService>;
  readonly #blobStorageClient?: BlobStorageGatewayClient;
  readonly #domainSeparator = 'file_storage_dapp';
  readonly #limit: LimitFn;
  readonly #maxChunkSize: number;
  readonly #origin: string;
  #progress = new Store<Record<string, Progress>>({});
  #sha256: Record<string, ReturnType<typeof sha256.create>> = {};
  #storageBackend?: StorageBackend;

  /**
   * Create assets canister manager instance
   * @param config Additional configuration options, canister id is required
   */
  constructor(config: EncryptedStorageConfig) {
    const { concurrency, maxChunkSize, origin, blobStorageGatewayUrl, ...actorConfig } = config;
    this.#actor = Actor.createActor<EncryptedStorageActorService>(encryptedStorageIdlFactory, actorConfig);
    this.#origin = origin;
    this.#maxChunkSize = maxChunkSize ?? 1_900_000;
    this.#limit = limit(concurrency ?? 16);

    if (blobStorageGatewayUrl && actorConfig.canisterId) {
      this.#blobStorageClient = new BlobStorageGatewayClient({
        agent: actorConfig.agent as HttpAgent,
        canisterId: typeof actorConfig.canisterId === 'string'
          ? actorConfig.canisterId
          : actorConfig.canisterId.toText(),
        gatewayUrl: blobStorageGatewayUrl,
      });
    }
  }

  async createDirectory(
    path: string,
    options?: { encryptionMode?: 'Encrypted' | 'Plaintext' },
  ) {
    const entry: EntryRaw = [{ Directory: null }, path];
    return await this.#actor.create({
      entry,
      createMode: { CreateNew: null },
      encryptionMode: toEncryptionMode(options?.encryptionMode),
    });
  }

  delete(entry: Entry) {
    return this.#actor.delete({
      entry: toEntryRaw(entry),
      recursive: true,
    });
  }

  async #fetchCertifiedBlobInfo(
    keyId: [Principal, Uint8Array],
  ): Promise<{ blobHash: string; contentType: string; size: number }> {
    const keyName = new TextDecoder().decode(keyId[1]);
    const path = `/blob-info/${keyId[0].toText()}/${keyName}`;

    // Call http_request via actor (Candid query — returns response with IC-Certificate headers)
    const response = await this.#actor.http_request({
      method: 'GET',
      url: path,
      headers: [],
      body: new Uint8Array(),
      certificate_version: [], // [] → v1 branch in certified-assets@0.6.0
    });

    if (response.status_code !== 200) {
      throw new Error(
        `Blob info HTTP request failed: ${response.status_code}`,
      );
    }

    // Verify IC certificate and get trusted body
    const agent = Actor.agentOf(this.#actor) as HttpAgent;
    const canisterId = Actor.canisterIdOf(this.#actor);
    const verifiedBody = await verifyIcCertificate(
      response,
      path,
      agent,
      canisterId,
    );

    return JSON.parse(new TextDecoder().decode(verifiedBody));
  }

  /**
   * Download a file as a stream of decrypted chunks.
   *
   * @param entry The file entry to download
   * @param options Download options. `keyId` is required when `storageBackend === 'BlobStorage'`.
   */
  async *downloadStream(
    entry: Entry,
    options?: {
      encrypted?: boolean;
      /** Required for BlobStorage downloads — used to construct certified HTTP path. */
      keyId?: [Principal, Uint8Array];
      onProgress?: (chunkIndex: number, totalChunks: number) => void;
      signal?: AbortSignal;
      storageBackend?: 'BlobStorage' | 'OnChain';
      totalChunks: number;
      version?: number;
    },
  ): AsyncGenerator<Uint8Array> {
    const isEncrypted = options?.encrypted !== false;

    let derivedKeyMaterial: DerivedKeyMaterial | undefined;
    if (isEncrypted && options?.keyId) {
      derivedKeyMaterial = await this.#getDerivedKeyMaterialOrFetchIfNeeded(
        ...options.keyId,
      );
    }

    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);

    // ── BlobStorage download flow ──
    if (options?.storageBackend === 'BlobStorage' && this.#blobStorageClient) {
      if (!options.keyId) {
        throw new Error('keyId is required for BlobStorage downloads');
      }

      const info = await this.#fetchCertifiedBlobInfo(options.keyId);

      if (options.signal?.aborted) throw new Error('Download aborted');

      const url = this.#blobStorageClient.getDownloadUrl(info.blobHash);
      const response = await fetch(url, { signal: options.signal });
      if (!response.ok) {
        throw new Error(`Blob storage download failed: ${response.status} ${response.statusText}`);
      }

      const allBytes = new Uint8Array(await response.arrayBuffer());

      // Verify Merkle root against the on-chain hash before decryption
      const isValid = await verifyBlobIntegrity(
        allBytes,
        info.blobHash,
        info.contentType,
        CAFFEINE_CHUNK_SIZE,
      );
      if (!isValid) {
        throw new Error(
          'Blob integrity verification failed: downloaded data does not match on-chain hash',
        );
      }

      const encChunkSize = CAFFEINE_CHUNK_SIZE;
      const totalChunks = Math.max(1, Math.ceil(allBytes.byteLength / encChunkSize));

      for (let i = 0; i < totalChunks; i++) {
        if (options.signal?.aborted) throw new Error('Download aborted');

        const start = i * encChunkSize;
        const end = Math.min(start + encChunkSize, allBytes.byteLength);
        const chunkBytes = allBytes.slice(start, end);

        if (isEncrypted && derivedKeyMaterial) {
          const decrypted = await derivedKeyMaterial.decryptMessage(chunkBytes, domainSeparator);
          yield Uint8Array.from(decrypted);
        } else {
          yield chunkBytes;
        }

        options.onProgress?.(i + 1, totalChunks);
      }
      return;
    }

    // ── Inline (on-chain) download flow ──
    const totalChunks = options?.totalChunks ?? 1;

    for (let i = 0; i < totalChunks; i++) {
      if (options?.signal?.aborted) {
        throw new Error('Download aborted');
      }

      const chunkResult = await this.getChunkAtVersion(
        entry,
        i,
        options?.version,
      );
      const chunkBytes = chunkResult.content as Uint8Array;

      if (isEncrypted && derivedKeyMaterial) {
        const decrypted = await derivedKeyMaterial.decryptMessage(
          chunkBytes,
          domainSeparator,
        );
        yield Uint8Array.from(decrypted);
      } else {
        yield chunkBytes;
      }

      options?.onProgress?.(i + 1, totalChunks);
    }
  }

  async fsTree() {
    const fsTree = await this.#actor.fsTree();
    return convertTreeNodes(fsTree);
  }

  /**
   * Getting the decrypted file from the storage
   *
   * @param keyId A unique identifier for a vetKey, consisting of the owner and key name.
   * @returns Blob with decrypted content of the file
   */
  async get(
    keyId: [Principal, Uint8Array],
    options?: { encrypted?: boolean },
  ) {
    const url = new URL(
      `/encrypted/${keyId[0].toText()}/${new TextDecoder().decode(keyId[1])}`,
      this.#origin,
    );

    const response = await fetch(url);
    const bytes = await response.bytes();

    // Skip decryption for plaintext files
    if (options?.encrypted === false) {
      return new Blob([bytes]);
    }

    // get derivedKeyMaterial for created file
    const derivedKeyMaterial = await this.#getDerivedKeyMaterialOrFetchIfNeeded(
      ...keyId,
    );
    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);
    const decryptedContent = await derivedKeyMaterial.decryptMessage(
      bytes,
      domainSeparator,
    );

    return new Blob([Uint8Array.from(decryptedContent)]);
  }

  async getChunkAtVersion(
    entry: Entry,
    chunkIndex: number,
    version?: number,
  ) {
    return await this.#actor.getStorageChunk({
      entry: toEntryRaw(entry),
      chunkIndex: BigInt(chunkIndex),
      version: version !== undefined ? [BigInt(version)] : [],
    });
  }

  async getDerivedKeyMaterial(
    keyOwner: Principal,
    keyName: Uint8Array,
  ): Promise<DerivedKeyMaterial> {
    const tsk = TransportSecretKey.random();
    const encryptedVetkey = await this.#actor.getEncryptedVetkey(
      [keyOwner, keyName],
      tsk.publicKeyBytes(),
    );
    const encryptedKeyBytes = Uint8Array.from(encryptedVetkey);
    const verificationKey = await this.#actor.getVetkeyVerificationKey();
    const input = new Uint8Array([
      keyOwner.toUint8Array().length,
      ...keyOwner.toUint8Array(),
      ...keyName,
    ]);
    const encryptedVetKey = EncryptedVetKey.deserialize(encryptedKeyBytes);
    const derivedPublicKey = DerivedPublicKey.deserialize(
      Uint8Array.from(verificationKey),
    );
    const vetkey = encryptedVetKey.decryptAndVerify(
      tsk,
      derivedPublicKey,
      input,
    );

    return vetkey.asDerivedKeyMaterial();
  }

  /** Query and cache the storage backend type for this canister. */
  async getStorageBackend(): Promise<StorageBackend> {
    if (!this.#storageBackend) {
      this.#storageBackend = await this.#actor.getStorageBackendType();
    }
    return this.#storageBackend;
  }

  async grantPermission({ user, permission, entry }: GrantStoragePermission) {
    return await this.#actor.grantStoragePermission({
      entry: toOptionalEntryRaw(entry),
      user: typeof user === 'string' ? Principal.fromText(user) : user,
      permission: toStoragePermission(permission),
    });
  }

  async hasPermission({
    user,
    permission,
    entry,
  }: {
    entry?: Entry;
    permission: StoragePermission;
    user: Principal | string;
  }) {
    return await this.#actor.hasStoragePermission({
      entry: toOptionalEntryRaw(entry),
      user: typeof user === 'string' ? Principal.fromText(user) : user,
      permission: toStoragePermission(permission),
    });
  }

  async list(entry?: Entry) {
    const response = await this.#actor.listStorage(toOptionalEntryRaw(entry));
    return response;
  }

  async listPermitted(entry?: Entry): Promise<StoragePermissionItem[]> {
    const list = await this.#actor.listPermitted(toOptionalEntryRaw(entry));

    return list.map(([principal, permission]) => ({
      user: principal.toString(),
      permission: Object.keys(permission)[0] as StoragePermission,
    }));
  }

  async listVersions(entry: Entry) {
    return await this.#actor.listStorageVersions({
      entry: toEntryRaw(entry),
    });
  }

  async move(entry: Entry, target?: Entry) {
    return await this.#actor.move({
      entry: toEntryRaw(entry),
      target: toOptionalEntryRaw(target),
    });
  }

  async rename(entry: Entry, newName: string) {
    return await this.#actor.rename({
      entry: toEntryRaw(entry),
      newName,
    });
  }

  async restoreVersion(entry: Entry, version: number) {
    return await this.#actor.restoreStorageVersion({
      entry: toEntryRaw(entry),
      version: BigInt(version),
    });
  }

  async revokePermission({ user, entry }: RevokeStoragePermission) {
    return await this.#actor.revokeStoragePermission({
      entry: toOptionalEntryRaw(entry),
      user: typeof user === 'string' ? Principal.fromText(user) : user,
    });
  }

  async saveThumbnail(entry: Entry, blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const content = arrayBufferToUint8Array(buffer);
    return await this.#actor.saveThumbnail({
      entry: toEntryRaw(entry),
      thumbnail: {
        content,
        contentType: blob.type ?? 'image/jpeg',
      },
    });
  }

  async showTree(entry?: Entry) {
    return await this.#actor.showTree(toOptionalEntryRaw(entry));
  }

  /**
   * The file is saved to the storage in several steps:
   * 1) creating a file in the file system
   * 2) derivation of the encrypted key for the keyId of the newly created file from the previous step
   * 3) content encryption using the received vetKeys
   * 4) creating a batch and then uploading encrypted chunks to this batch
   * 5) updating the file with information about chunks, content type and hash
   *
   * @param args StoreBlobArgs or StoreBytesArgs or StoreFileArgs
   * @see {@link StoreBlobArgs}
   * @see {@link StoreBytesArgs}
   * @see {@link StoreFileArgs}
   */
  async store(args: Exclude<StoreArgs, StorePathArgs | StoreReadableArgs>) {
    const { bytes, config } = await match(args)
      .with(
        [P.instanceOf(Uint8Array).select('bytes'), P.select('config')],
        ({ bytes, config: { contentType, ...config } }) => ({
          bytes,
          config: {
            ...config,
            contentType: contentType ?? this.#contentType(config.fileName),
          },
        }),
      )
      .with(
        [
          P.instanceOf(ArrayBuffer).or(P.array(P.number)).select('bytes'),
          P.select('config'),
        ],
        ({ bytes, config: { contentType, ...config } }) => ({
          bytes: new Uint8Array(bytes),
          config: {
            ...config,
            contentType: contentType ?? this.#contentType(config.fileName),
          },
        }),
      )
      .with(
        [P.instanceOf(File).select('file'), P.select('config')],
        async ({ file, config }) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          return {
            bytes,
            config: {
              ...(config ?? {}),
              contentType: config?.contentType ?? file.type,
              fileName: config?.fileName ?? file.name,
            },
          };
        },
      )
      .with(
        [
          P.instanceOf(Blob).select('blob'),
          P.nonNullable.and({ fileName: P.string }).select('config'),
        ],
        async ({ blob, config: { contentType, ...config } }) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const _contentType =
            contentType ?? (blob.type || this.#contentType(config.fileName));
          return { bytes, config: { ...config, contentType: _contentType } };
        },
      )
      .run();
    const key = [config.path ?? '', config.fileName].join('/');
    const entry: EntryRaw = [{ File: null }, key];

    // Check abort signal before starting upload
    if (config.signal?.aborted) {
      throw new Error('Upload aborted');
    }

    const store = new Derived({
      fn: () => this.#progress.state[key],
      deps: [this.#progress],
    });

    const unmount = store.mount();

    if (isMatching({ onProgress: P.instanceOf(Function) }, config)) {
      store.subscribe((state) => config.onProgress(state.currentVal));
    }

    this.#sha256[key] = sha256.create();
    this.#progress.setState((state) => ({
      ...state,
      [key]: { status: UploadState.INITIALIZING },
    }));

    // create file
    const details = await this.#limit(
      () =>
        this.#actor.create({
          entry,
          createMode: { GetOrCreate: null },
          encryptionMode: toEncryptionMode(config.encryptionMode),
        }),
      config.signal,
    );

    // Determine if file is encrypted from the response
    const isEncrypted =
      'File' in details.metadata &&
      'Encrypted' in details.metadata.File.encryptionMode;

    let derivedKeyMaterial: Awaited<ReturnType<typeof this.getDerivedKeyMaterial>> | undefined;
    if (isEncrypted) {
      this.#progress.setState((state) => ({
        ...state,
        [key]: { status: UploadState.REQUESTING_VETKD },
      }));

      derivedKeyMaterial =
        await this.#getDerivedKeyMaterialOrFetchIfNeeded(
          details.keyId[0],
          Uint8Array.from(details.keyId[1]),
        );
    }

    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);
    const backend = await this.getStorageBackend();

    // ── BlobStorage upload flow ──
    // Chunks go directly to the blob storage gateway, not through the canister.
    if ('BlobStorage' in backend && this.#blobStorageClient) {
      const chunkSize = isEncrypted ? CAFFEINE_PLAINTEXT_CHUNK_SIZE : CAFFEINE_CHUNK_SIZE;
      const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / chunkSize));

      // Step 1: Encrypt chunks + compute content hash
      const encryptedChunks: Uint8Array[] = [];
      const contentHash = sha256.create();
      for (let i = 0; i < chunkCount; i++) {
        if (config.signal?.aborted) throw new Error('Upload aborted');
        const plain = bytes.slice(i * chunkSize, Math.min((i + 1) * chunkSize, bytes.byteLength));
        const encrypted = isEncrypted && derivedKeyMaterial
          ? await derivedKeyMaterial.encryptMessage(plain, domainSeparator)
          : plain;
        contentHash.update(encrypted);
        encryptedChunks.push(encrypted);
      }

      // Step 2: Build Merkle tree
      const chunkHashes = await Promise.all(
        encryptedChunks.map((chunk) => YHash.fromChunk(chunk)),
      );
      const totalEncryptedSize = encryptedChunks.reduce((sum, c) => sum + c.length, 0);
      const blobTree = await BlobHashTree.build(chunkHashes, {
        'Content-Type': config.contentType,
        'Content-Length': totalEncryptedSize.toString(),
      });
      const rootHash = blobTree.tree.hash.toShaString();

      // Step 3: Get IC certificate from canister
      this.#progress.setState((state) => ({
        ...state,
        [key]: { status: UploadState.FINALIZING },
      }));
      const certificate = await this.#blobStorageClient.createCertificate(rootHash);

      // Step 4: Upload blob tree to gateway
      await this.#blobStorageClient.uploadBlobTree({
        blobTree,
        certificate,
        totalSize: totalEncryptedSize,
      });

      // Step 5: Upload chunks to gateway in parallel
      this.#progress.setState((state) => ({
        ...state,
        [key]: { status: UploadState.IN_PROGRESS, current: 0, total: bytes.byteLength },
      }));
      await this.#blobStorageClient.uploadChunks(
        encryptedChunks,
        chunkHashes,
        rootHash,
        (completedChunks, totalChunks) => {
          const current = Math.round((completedChunks / totalChunks) * bytes.byteLength);
          this.#progress.setState((state) => ({
            ...state,
            [key]: { status: UploadState.IN_PROGRESS, current, total: bytes.byteLength },
          }));
        },
      );

      // Step 6: Commit metadata on-chain
      this.#progress.setState((state) => ({
        ...state,
        [key]: { status: UploadState.FINALIZING },
      }));
      await this.#actor.commitCaffeineUpload({
        entry,
        sha256: new Uint8Array(contentHash.digest()),
        rootHash,
        contentType: config.contentType,
        size: BigInt(totalEncryptedSize),
      });

      unmount();
      return;
    }

    // ── Inline (on-chain) upload flow ──

    // create batch
    const { batchId } = await this.#limit(
      () => this.#actor.createStorageBatch({ entry, totalSize: BigInt(bytes.byteLength) }),
      config.signal,
    );

    // Per-chunk encryption: split plaintext first, encrypt each chunk independently.
    const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / this.#maxChunkSize));

    // Step 1: Encrypt and hash sequentially (bounded CPU, deterministic SHA).
    const encryptedChunks: Uint8Array[] = [];
    for (let i = 0; i < chunkCount; i++) {
      if (config.signal?.aborted) throw new Error('Upload aborted');

      const plainChunk = bytes.slice(
        i * this.#maxChunkSize,
        Math.min((i + 1) * this.#maxChunkSize, bytes.byteLength),
      );

      const content = isEncrypted && derivedKeyMaterial
        ? await derivedKeyMaterial.encryptMessage(plainChunk, domainSeparator)
        : plainChunk;

      this.#sha256[key].update(content);
      encryptedChunks.push(content);
    }

    // Step 2: Upload chunks in parallel (concurrency limited by this.#limit).
    this.#progress.setState((state) => ({
      ...state,
      [key]: {
        status: UploadState.IN_PROGRESS,
        current: 0,
        total: bytes.byteLength,
      },
    }));
    const chunkIds: bigint[] = await Promise.all(
      encryptedChunks.map(async (content, index) => {
        const { chunkId } = await this.#limit(
          () => this.#actor.createStorageChunk({ content, batchId }),
          config.signal,
        );
        const plainChunkSize = Math.min(
          this.#maxChunkSize,
          bytes.byteLength - index * this.#maxChunkSize,
        );
        this.#progress.setState((state) => ({
          ...state,
          [key]: {
            status: UploadState.IN_PROGRESS,
            current: (state[key].status === UploadState.IN_PROGRESS
              ? state[key].current
              : 0) + plainChunkSize,
            total: bytes.byteLength,
          },
        }));

        return chunkId;
      }),
    );

    this.#progress.setState((state) => ({
      ...state,
      [key]: {
        status: UploadState.FINALIZING,
      },
    }));

    // update content
    await this.#actor.update({
      File: {
        metadata: {
          sha256: [new Uint8Array(this.#sha256[key].digest())],
          chunkIds,
          contentType: config.contentType,
        },
        path: key,
      },
    });

    unmount();
  }

  async updateDirectoryColor(
    path: string,
    color: string,
  ) {
    return await this.#actor.update({
      Directory: {
        path,
        metadata: { color: [{ [color]: null }] },
      },
    } as Parameters<EncryptedStorageActorService['update']>[0]); // color is dynamic, keep cast
  }

  #contentType(fileName: string) {
    return mime.getType(fileName) ?? 'application/octet-stream';
  }

  /**
   * Gets or fetches the derived key material for a map.
   *
   * @param mapOwner - The principal of the map owner
   * @param mapName - The name/identifier of the map
   * @returns Promise resolving to the derived key material
   */
  async #getDerivedKeyMaterialOrFetchIfNeeded(
    fileOwner: Principal,
    fileId: Uint8Array,
  ): Promise<DerivedKeyMaterial> {
    const cachedRawDerivedKeyMaterial: CryptoKey | undefined = await get([
      fileOwner.toString(),
      new TextDecoder().decode(fileId),
    ]);
    if (cachedRawDerivedKeyMaterial) {
      return DerivedKeyMaterial.fromCryptoKey(cachedRawDerivedKeyMaterial);
    }

    const derivedKeyMaterial = await this.getDerivedKeyMaterial(
      fileOwner,
      fileId,
    );
    await set([fileOwner.toString()], derivedKeyMaterial.getCryptoKey());

    return derivedKeyMaterial;
  }
}
