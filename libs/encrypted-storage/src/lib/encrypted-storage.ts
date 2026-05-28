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
import { isMatching, P } from 'ts-pattern';

import {
  CreateAccessBatchArguments,
  type EmailClaim,
  EncryptedStorageActorService,
  encryptedStorageIdlFactory,
  Entry as EntryRaw,
  ListedPendingAccessGrant,
  ListedPrincipalAccessGrant,
  Permission__1,
  StorageBackend,
  ThumbnailRef,
} from '@rabbithole/declarations/encrypted-storage';

import { createBlobUploadSpool } from './blob-storage/blob-upload-spool';
import {
  AES_GCM_OVERHEAD,
  CAFFEINE_CHUNK_SIZE,
  CAFFEINE_PLAINTEXT_CHUNK_SIZE,
} from './blob-storage/constants';
import { BlobStorageGatewayClient } from './blob-storage/gateway-client';
import { BlobHashTree, verifyBlobIntegrity, YHash } from './blob-storage/merkle-tree';
import { isReadable, Readable } from './readable/readable';
import { ReadableBlob } from './readable/readableBlob';
import { ReadableBytes } from './readable/readableBytes';
import { ReadableFile } from './readable/readableFile';
import { ThumbnailClient } from './thumbnail/thumbnail-client';
import {
  CreateStorageAccessGrant,
  CreateStorageAccessGrants,
  CreateStorageAccessRequest,
  EncryptedStorageConfig,
  Entry,
  Progress,
  ResolveStorageAccessRequest,
  RevokeStorageAccessGrant,
  RevokeStorageAccessGrants,
  StorageAccessGrantListMode,
  type StorageClaimedPrincipal,
  StorageDirectoryEncryptionPolicy,
  StoragePendingAccessGrant,
  StoragePermission,
  StoragePermissionItem,
  StorageThumbnailEncryptionPolicy,
  StorageThumbnailStoragePolicy,
  StoreArgs,
  StoreConfig,
  StorePathArgs,
  toEncryptionMode,
  toEntryRaw,
  toOptionalEntryRaw,
  toStoragePermission,
  UploadState,
} from './types';
import { convertTreeNodes } from './utils';
import { limit, LimitFn } from './utils/limit';
import {
  toOptionalVariant,
  unwrapStorageResult,
} from './utils/storage-result';
import { verifyIcCertificate } from './utils/verify-ic-certificate';

const ONCHAIN_FUNDING_RETRY_DELAY_MS = 2_000;
const ONCHAIN_FUNDING_MAX_RETRIES = 90;
const ONCHAIN_CHUNK_UPLOAD_WINDOW = 16;

type UploadFundingRetryCallback = (info: {
  attempt: number;
  error: unknown;
  retryAt: number;
}) => void;

export class EncryptedStorage {
  readonly #actor: ActorSubclass<EncryptedStorageActorService>;
  readonly #blobStorageClient?: BlobStorageGatewayClient;
  readonly #canisterId?: Principal;
  readonly #concurrency: number;
  #derivedKeyMaterialRequests = new Map<string, Promise<DerivedKeyMaterial>>();
  readonly #domainSeparator = 'file_storage_dapp';
  readonly #limit: LimitFn;
  readonly #maxChunkSize: number;
  readonly #origin: string;
  #progress = new Store<Record<string, Progress>>({});
  #sha256: Record<string, ReturnType<typeof sha256.create>> = {};
  #storageBackend?: StorageBackend;
  readonly #thumbnailClient: ThumbnailClient;
  #vetkeyVerificationKey?: Promise<Uint8Array>;

  /**
   * Create assets canister manager instance
   * @param config Additional configuration options, canister id is required
   */
  constructor(config: EncryptedStorageConfig) {
    const {
      concurrency,
      maxChunkSize,
      origin,
      blobStorageGatewayUrl,
      storageBackend,
      ...actorConfig
    } = config;
    this.#actor = Actor.createActor<EncryptedStorageActorService>(encryptedStorageIdlFactory, actorConfig);
    this.#canisterId = typeof actorConfig.canisterId === 'string'
      ? Principal.fromText(actorConfig.canisterId)
      : actorConfig.canisterId;
    this.#storageBackend = typeof storageBackend === 'string'
      ? { [storageBackend]: null } as StorageBackend
      : storageBackend;
    this.#origin = origin;
    this.#maxChunkSize = maxChunkSize ?? 1_900_000;
    const defaultConcurrency = 16;
    this.#concurrency = concurrency ?? defaultConcurrency;
    this.#limit = limit(this.#concurrency);

    if (blobStorageGatewayUrl && actorConfig.canisterId) {
      this.#blobStorageClient = new BlobStorageGatewayClient({
        agent: actorConfig.agent as HttpAgent,
        canisterId: typeof actorConfig.canisterId === 'string'
          ? actorConfig.canisterId
          : actorConfig.canisterId.toText(),
        gatewayUrl: blobStorageGatewayUrl,
      });
    }

    this.#thumbnailClient = new ThumbnailClient({
      actor: this.#actor,
      blobStorageClient: this.#blobStorageClient,
      getDerivedKeyMaterial: (fileOwner, fileId) =>
        this.#getDerivedKeyMaterialOrFetchIfNeeded(fileOwner, fileId),
      origin: this.#origin,
    });
  }

  async cancelAccessRequest(requestId: bigint) {
    return await this.#actor.cancelAccessRequest({ requestId });
  }

  async cancelPendingAccessGrant(grantId: bigint) {
    return await this.#actor.cancelPendingAccessGrant({ grantId });
  }

  async createAccessGrants({ items }: CreateStorageAccessGrants) {
    const args: CreateAccessBatchArguments = {
      items: items.map((item) => ({
        ref: this.#accessRef(item),
        accessClass: { ordinary: null },
        scope: item.entry ? { entry: toEntryRaw(item.entry) } : { root: null },
        permission: toStoragePermission(item.permission),
        source: { directGrant: null },
        expiresAt: [],
      })),
    };
    return await this.#createAccessBatchWithSubscriptionRefresh(args);
  }

  async createDirectory(
    path: string,
    options?: { encryptionMode?: 'Encrypted' | 'Plaintext' },
  ) {
    const entry: EntryRaw = [{ Directory: null }, path];
    return unwrapStorageResult(await this.#actor.create({
      entry,
      createMode: { CreateNew: null },
      encryptionMode: toEncryptionMode(options?.encryptionMode),
    }));
  }

  delete(entry: Entry) {
    return this.#actor.delete({
      entry: toEntryRaw(entry),
      recursive: true,
    });
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
    const verificationKey = await this.#getVetkeyVerificationKey();
    const input = new Uint8Array([
      keyOwner.toUint8Array().length,
      ...keyOwner.toUint8Array(),
      ...keyName,
    ]);
    const encryptedVetKey = EncryptedVetKey.deserialize(encryptedKeyBytes);
    const derivedPublicKey = DerivedPublicKey.deserialize(
      verificationKey,
    );
    const vetkey = encryptedVetKey.decryptAndVerify(
      tsk,
      derivedPublicKey,
      input,
    );

    return vetkey.asDerivedKeyMaterial();
  }

  async getMyAccessRequest() {
    const [request] = await this.#actor.getMyAccessRequest();
    return request ?? null;
  }

  /** Query and cache the storage backend type for this canister. */
  async getStorageBackend(): Promise<StorageBackend> {
    if (!this.#storageBackend) {
      this.#storageBackend = await this.#actor.getStorageBackendType();
    }
    return this.#storageBackend;
  }

  async getThumbnailUrl(thumbnailRef: ThumbnailRef): Promise<string> {
    return await this.#thumbnailClient.getUrl(thumbnailRef);
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

  async listAccessGrants(
    entry?: Entry,
    mode: StorageAccessGrantListMode = 'exact',
  ): Promise<StoragePermissionItem[]> {
    const result = await this.#actor.listAccessGrants({
      mode: this.#accessGrantListMode(mode),
      scope: entry ? [{ entry: toEntryRaw(entry) }] : [],
    });

    const pendingItems = result.pendingGrants.map((grant) =>
      this.#pendingGrantToPermissionItem(grant),
    );
    const claimedPrincipalGrantIds = new Set(
      pendingItems.flatMap((item) =>
        item.claimedPrincipals?.map((claim) => claim.principalGrantId) ?? [],
      ),
    );
    const principalItems = result.principalGrants
      .filter(({ grant }) => !claimedPrincipalGrantIds.has(grant.id))
      .map((grant) => this.#principalGrantToPermissionItem(grant));

    return [...principalItems, ...pendingItems];
  }

  async listAccessRequests() {
    return await this.#actor.listAccessRequests();
  }

  async listPendingAccessGrants(): Promise<StoragePendingAccessGrant[]> {
    return await this.#actor.listPendingAccessGrants();
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

  async refreshSubscription() {
    return await this.#actor.refreshSubscription();
  }

  async rename(entry: Entry, newName: string) {
    return await this.#actor.rename({
      entry: toEntryRaw(entry),
      newName,
    });
  }

  async requestAccess({ email, message }: CreateStorageAccessRequest) {
    return await this.#actor.requestAccess({
      emailCommitment: email ? [this.#emailCommitment(email)] : [],
      message: message ? [message] : [],
    });
  }

  async resolveAccessRequest(args: ResolveStorageAccessRequest) {
    return await this.#actor.resolveAccessRequest({
      requestId: args.requestId,
      decision: args.decision === 'approved'
        ? {
            approved: {
              scope: args.entry ? { entry: toEntryRaw(args.entry) } : { root: null },
              permission: toStoragePermission(args.permission),
            },
          }
        : { rejected: null },
    });
  }

  async restoreVersion(entry: Entry, version: number) {
    return await this.#actor.restoreStorageVersion({
      entry: toEntryRaw(entry),
      version: BigInt(version),
    });
  }

  async revokeAccessGrants({ items }: RevokeStorageAccessGrants) {
    const args = {
      items: items.map((item) => ({
        principal: this.#principal(item),
        scope: item.entry ? { entry: toEntryRaw(item.entry) } : { root: null },
      })),
    };
    return await this.#actor.revokeAccessBatch(args);
  }

  async rewrapThumbnail(entry: Entry, thumbnailRef: ThumbnailRef): Promise<boolean> {
    return await this.#thumbnailClient.rewrap(entry, thumbnailRef);
  }

  async saveThumbnail(entry: Entry, blob: Blob) {
    return await this.#thumbnailClient.save(entry, blob);
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
  async store(args: Exclude<StoreArgs, StorePathArgs>) {
    const { readable, config } = this.#toReadableStoreArgs(args);
    const sourceSize = readable.length;
    const key = [config.path ?? '', config.fileName].join('/');
    const entry: EntryRaw = [{ File: null }, key];

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

    let readableOpened = false;
    try {
      if (config.signal?.aborted) {
        throw new Error('Upload aborted');
      }

      await readable.open();
      readableOpened = true;

      const backend = await this.getStorageBackend();
      const domainSeparator = new TextEncoder().encode(this.#domainSeparator);

      let derivedKeyMaterial: Awaited<ReturnType<typeof this.getDerivedKeyMaterial>> | undefined;

      // ── BlobStorage upload flow ──
      // Chunks go directly to the blob storage gateway, not through the canister.
      if ('BlobStorage' in backend && this.#blobStorageClient) {
        const details = await this.#limit(
          async () =>
            unwrapStorageResult(await this.#actor.create({
              entry,
              createMode: { GetOrCreate: null },
              encryptionMode: toEncryptionMode(config.encryptionMode),
            })),
          config.signal,
        );
        const isEncrypted =
          'File' in details.metadata &&
          'Encrypted' in details.metadata.File.encryptionMode;
        const chunkSize = isEncrypted ? CAFFEINE_PLAINTEXT_CHUNK_SIZE : CAFFEINE_CHUNK_SIZE;
        const chunkCount = Math.max(1, Math.ceil(sourceSize / chunkSize));
        const declaredUploadBytes = isEncrypted
          ? BigInt(sourceSize) + BigInt(chunkCount) * BigInt(AES_GCM_OVERHEAD)
          : BigInt(sourceSize);

        unwrapStorageResult(await this.#actor.preflightCaffeineUpload({
          entry,
          size: declaredUploadBytes,
        }));

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

        const spool = createBlobUploadSpool(chunkCount);
        try {
          const chunkHashes: YHash[] = [];
          const contentHash = sha256.create();
          let totalEncryptedSize = 0;

          // Step 1: encrypt chunks, hash them, and spool ciphertext outside RAM.
          for (let i = 0; i < chunkCount; i++) {
            if (config.signal?.aborted) throw new Error('Upload aborted');
            const plain = await readable.slice(
              i * chunkSize,
              Math.min((i + 1) * chunkSize, sourceSize),
            );
            const encrypted = isEncrypted && derivedKeyMaterial
              ? await derivedKeyMaterial.encryptMessage(plain, domainSeparator)
              : plain;
            contentHash.update(encrypted);
            totalEncryptedSize += encrypted.byteLength;
            chunkHashes.push(await YHash.fromChunk(encrypted));
            await spool.writeChunk(i, encrypted);
          }

          // Step 2: Build Merkle tree
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

          // Step 5: Upload chunks to gateway in parallel from the spool.
          this.#progress.setState((state) => ({
            ...state,
            [key]: { status: UploadState.IN_PROGRESS, current: 0, total: sourceSize },
          }));
          await this.#blobStorageClient.uploadChunkSource(
            spool,
            chunkHashes,
            rootHash,
            (completedChunks, totalChunks) => {
              const current = Math.round((completedChunks / totalChunks) * sourceSize);
              this.#progress.setState((state) => ({
                ...state,
                [key]: { status: UploadState.IN_PROGRESS, current, total: sourceSize },
              }));
            },
          );

          // Step 6: Commit metadata on-chain
          this.#progress.setState((state) => ({
            ...state,
            [key]: { status: UploadState.FINALIZING },
          }));
          unwrapStorageResult(await this.#actor.commitCaffeineUpload({
            entry,
            sha256: new Uint8Array(contentHash.digest()),
            rootHash,
            contentType: config.contentType,
            size: BigInt(totalEncryptedSize),
          }));

          return;
        } finally {
          await spool.clear();
        }
      }

      // ── Inline (on-chain) upload flow ──
      const chunkCount = Math.max(1, Math.ceil(sourceSize / this.#maxChunkSize));
      const uploadController = new AbortController();
      const abortUpload = () => uploadController.abort(config.signal?.reason);
      if (config.signal?.aborted) {
        abortUpload();
      } else {
        config.signal?.addEventListener('abort', abortUpload, { once: true });
      }
      const currentUploadBytes = () => {
        const progress = this.#progress.state[key];
        return progress?.status === UploadState.IN_PROGRESS ||
          progress?.status === UploadState.WAITING_FOR_FUNDING
          ? progress.current
          : 0;
      };
      const setUploadFundingPending =
        (current: () => number): UploadFundingRetryCallback =>
        ({ error, retryAt }) => {
          this.#progress.setState((state) => ({
            ...state,
            [key]: {
              status: UploadState.WAITING_FOR_FUNDING,
              current: Math.min(current(), sourceSize),
              total: sourceSize,
              message: errorMessage(error),
              retryAt,
            },
          }));
        };

      let batchId: bigint | undefined;
      try {
        const batch = await this.#withUploadFundingRetry(
          () => this.#limit(
            async () => unwrapStorageResult(await this.#actor.beginUploadSession({
              entry,
              totalSize: BigInt(sourceSize),
              declaredUploadBytes: [],
              expectedChunkCount: [BigInt(chunkCount)],
              createMode: { GetOrCreate: null },
              encryptionMode: toEncryptionMode(config.encryptionMode),
            })),
            uploadController.signal,
          ),
          uploadController.signal,
          setUploadFundingPending(() => 0),
        );
        batchId = batch.batchId;
        const details = batch.node;
        const isEncrypted =
          'File' in details.metadata &&
          'Encrypted' in details.metadata.File.encryptionMode;

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

        // Step 2: Upload chunks in bounded windows. The canister accepts
        // out-of-order chunks and hashes only the contiguous prefix.
        this.#progress.setState((state) => ({
          ...state,
          [key]: {
            status: UploadState.IN_PROGRESS,
            current: 0,
            total: sourceSize,
          },
        }));
        const uploadWindow = Math.max(1, Math.min(ONCHAIN_CHUNK_UPLOAD_WINDOW, this.#concurrency));
        for (let windowStart = 0; windowStart < chunkCount; windowStart += uploadWindow) {
          const uploadTasks: Array<Promise<void>> = [];
          const windowEnd = Math.min(windowStart + uploadWindow, chunkCount);

          for (let index = windowStart; index < windowEnd; index++) {
            if (uploadController.signal.aborted) throw new Error('Upload aborted');

            const plainChunk = await readable.slice(
              index * this.#maxChunkSize,
              Math.min((index + 1) * this.#maxChunkSize, sourceSize),
            );
            const content = isEncrypted && derivedKeyMaterial
              ? await derivedKeyMaterial.encryptMessage(plainChunk, domainSeparator)
              : plainChunk;

            this.#sha256[key].update(content);
            uploadTasks.push(
              this.#withUploadFundingRetry(
                () => this.#limit(
                  async () => unwrapStorageResult(await this.#actor.appendUploadChunk({
                    content,
                    batchId: batch.batchId,
                    chunkIndex: [BigInt(index)],
                  })),
                  uploadController.signal,
                ),
                uploadController.signal,
                setUploadFundingPending(currentUploadBytes),
              ).then(() => {
                this.#progress.setState((state) => ({
                  ...state,
                  [key]: {
                    status: UploadState.IN_PROGRESS,
                    current: (state[key].status === UploadState.IN_PROGRESS ||
                      state[key].status === UploadState.WAITING_FOR_FUNDING
                      ? state[key].current
                      : 0) + plainChunk.byteLength,
                    total: sourceSize,
                  },
                }));
              }),
            );
          }

          await Promise.all(uploadTasks);
        }

        this.#progress.setState((state) => ({
          ...state,
          [key]: {
            status: UploadState.FINALIZING,
          },
        }));

        const contentDigest = new Uint8Array(this.#sha256[key].digest());
        await this.#withUploadFundingRetry(
          async () => unwrapStorageResult(await this.#actor.finishUploadSession({
            batchId: batch.batchId,
            sha256: [contentDigest],
            contentType: config.contentType,
          })),
          uploadController.signal,
          setUploadFundingPending(() => sourceSize),
        );
      } catch (error) {
        uploadController.abort();
        if (batchId !== undefined && !shouldPreserveUploadSession(error)) {
          try {
            unwrapStorageResult(await this.#actor.abortUploadSession({ batchId }));
          } catch {
            // Best-effort cleanup; preserve the original upload failure.
          }
        }
        throw error;
      } finally {
        config.signal?.removeEventListener('abort', abortUpload);
      }
    } finally {
      if (readableOpened) {
        await readable.close();
      }
      unmount();
    }
  }

  async updateDirectoryColor(
    path: string,
    color: string,
  ) {
    return unwrapStorageResult(await this.#actor.update({
      Directory: {
        path,
        metadata: { color: [{ [color]: null }] },
      },
    } as Parameters<EncryptedStorageActorService['update']>[0])); // color is dynamic, keep cast
  }

  async updateDirectoryPolicy(
    path: string,
    policy: {
      encryptionPolicy?: StorageDirectoryEncryptionPolicy;
      thumbnailEncryptionPolicy?: StorageThumbnailEncryptionPolicy;
      thumbnailStoragePolicy?: StorageThumbnailStoragePolicy;
    },
  ) {
    return unwrapStorageResult(await this.#actor.updateDirectoryPolicy({
      entry: [{ Directory: null }, path],
      encryptionPolicy: toOptionalVariant(policy.encryptionPolicy),
      thumbnailStoragePolicy: toOptionalVariant(policy.thumbnailStoragePolicy),
      thumbnailEncryptionPolicy: toOptionalVariant(
        policy.thumbnailEncryptionPolicy,
      ),
    } as Parameters<EncryptedStorageActorService['updateDirectoryPolicy']>[0]));
  }

  #accessGrantListMode(mode: StorageAccessGrantListMode) {
    return mode === 'effective' ? { effective: null } : { exact: null };
  }

  #accessRef(item: CreateStorageAccessGrant) {
    if ('principal' in item.target) {
      return { principal: this.#principal(item.target) };
    }

    const email = item.target.email.trim();
    if (!email) {
      throw new Error('email access target cannot be empty');
    }

    return {
      email: {
        email,
        emailCommitment: this.#emailCommitment(email),
      },
    };
  }

  #claimedPrincipal(
    origin: StorageClaimedPrincipal['origin'],
    claim: EmailClaim | undefined,
  ): StorageClaimedPrincipal[] {
    if (!claim) return [];
    return [{
      claimedAt: claim.claimedAt,
      origin,
      principal: claim.principal.toText(),
      principalGrantId: claim.principalGrantId,
    }];
  }

  #claimedPrincipals(
    emailClaimState: ListedPendingAccessGrant['grant']['emailClaimState'],
  ): StorageClaimedPrincipal[] {
    return [
      ...this.#claimedPrincipal('rabbithole', emailClaimState.rabbithole[0]),
      ...this.#claimedPrincipal('storage', emailClaimState.storage[0]),
    ];
  }

  #contentType(fileName: string) {
    return mime.getType(fileName) ?? 'application/octet-stream';
  }

  async #createAccessBatchWithSubscriptionRefresh(args: CreateAccessBatchArguments) {
    try {
      return await this.#actor.createAccessBatch(args);
    } catch (err) {
      if (!this.#isSubscriptionStatusUnknownError(err)) {
        throw err;
      }

      await this.refreshSubscription();

      return await this.#actor.createAccessBatch(args);
    }
  }

  #emailCommitment(email: string): Uint8Array {
    if (!this.#canisterId) {
      throw new Error('canisterId is required to create email access grants');
    }

    return sha256
      .create()
      .update(new TextEncoder().encode('rabbithole:storage-access:v1'))
      .update(this.#canisterId.toUint8Array())
      .update(new TextEncoder().encode(email.trim().toLowerCase()))
      .digest();
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
    const cacheKey = [fileOwner.toString(), new TextDecoder().decode(fileId)];
    const cachedRawDerivedKeyMaterial: CryptoKey | undefined = await get(cacheKey);
    if (cachedRawDerivedKeyMaterial) {
      return DerivedKeyMaterial.fromCryptoKey(cachedRawDerivedKeyMaterial);
    }

    const requestKey = cacheKey.join('/');
    const existingRequest = this.#derivedKeyMaterialRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = this.getDerivedKeyMaterial(fileOwner, fileId)
      .then(async (derivedKeyMaterial) => {
        await set(cacheKey, derivedKeyMaterial.getCryptoKey());
        return derivedKeyMaterial;
      })
      .finally(() => this.#derivedKeyMaterialRequests.delete(requestKey));

    this.#derivedKeyMaterialRequests.set(requestKey, request);
    return request;
  }

  #getVetkeyVerificationKey(): Promise<Uint8Array> {
    this.#vetkeyVerificationKey ??= this.#actor
      .getVetkeyVerificationKey()
      .then((key) => Uint8Array.from(key));

    return this.#vetkeyVerificationKey;
  }

  #isSubscriptionStatusUnknownError(err: unknown): boolean {
    return String(err).includes('Subscription status unknown');
  }

  #pendingGrantToPermissionItem({
    grant,
    inheritedFrom,
  }: ListedPendingAccessGrant): StoragePermissionItem {
    const claimedPrincipals = this.#claimedPrincipals(grant.emailClaimState);
    const status = claimedPrincipals.length > 0 ? 'active' : 'pending';

    if ('principal' in grant.ref) {
      return {
        accessClass: grant.accessClass,
        grantId: grant.id,
        inheritedFrom: inheritedFrom[0],
        permission: this.#storagePermissionFromRaw(grant.permission),
        scope: grant.scope,
        source: grant.source,
        status: 'pending',
        targetKind: 'principal',
        user: grant.ref.principal.toText(),
      };
    }

    if ('email' in grant.ref) {
      return {
        accessClass: grant.accessClass,
        claimedPrincipals,
        emailCommitment: grant.ref.email.emailCommitment,
        grantId: grant.id,
        inheritedFrom: inheritedFrom[0],
        permission: this.#storagePermissionFromRaw(grant.permission),
        scope: grant.scope,
        source: grant.source,
        status,
        targetKind: 'email',
        user: grant.ref.email.email,
      };
    }

    return {
      accessClass: grant.accessClass,
      claimedPrincipals,
      emailCommitment: grant.ref.emailCommitment,
      grantId: grant.id,
      inheritedFrom: inheritedFrom[0],
      permission: this.#storagePermissionFromRaw(grant.permission),
      scope: grant.scope,
      source: grant.source,
      status,
      targetKind: 'emailCommitment',
      user: `Email invite ${this.#shortBytes(grant.ref.emailCommitment)}`,
    };
  }

  #principal(args: Pick<RevokeStorageAccessGrant, 'principal'>) {
    return typeof args.principal === 'string'
      ? Principal.fromText(args.principal)
      : args.principal;
  }

  #principalGrantToPermissionItem({ grant, inheritedFrom }: ListedPrincipalAccessGrant): StoragePermissionItem {
    return {
      accessClass: grant.accessClass,
      grantId: grant.id,
      inheritedFrom: inheritedFrom[0],
      permission: this.#storagePermissionFromRaw(grant.permission),
      scope: grant.scope,
      source: grant.source,
      status: 'active',
      targetKind: 'principal',
      user: grant.principal.toString(),
    };
  }

  #shortBytes(bytes: Uint8Array): string {
    return Array.from(bytes.slice(0, 4))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  #storagePermissionFromRaw(permission: Permission__1): StoragePermission {
    return Object.keys(permission)[0] as StoragePermission;
  }

  #toReadableStoreArgs(args: Exclude<StoreArgs, StorePathArgs>): {
    config: Required<Pick<StoreConfig, 'contentType' | 'fileName'>> & StoreConfig;
    readable: Readable;
  } {
    const [input, providedConfig] = args;
    const config = providedConfig ?? {};
    let readable: Readable;

    if (typeof File === 'function' && input instanceof File) {
      readable = new ReadableFile(input);
    } else if (
      typeof Blob === 'function' &&
      input instanceof Blob &&
      config.fileName
    ) {
      readable = new ReadableBlob(config.fileName, input);
    } else if (
      (Array.isArray(input) || input instanceof Uint8Array || input instanceof ArrayBuffer) &&
      config.fileName
    ) {
      readable = new ReadableBytes(config.fileName, input);
    } else if (isReadable(input)) {
      readable = input;
    } else {
      throw new Error('Invalid arguments, readable could not be created');
    }

    const fileName = config.fileName ?? readable.fileName;
    const contentType = config.contentType || readable.contentType || this.#contentType(fileName);

    return {
      readable,
      config: {
        ...config,
        contentType,
        fileName,
      },
    };
  }

  async #withUploadFundingRetry<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
    onFundingRetry?: UploadFundingRetryCallback,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= ONCHAIN_FUNDING_MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error('Upload aborted');

      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isUploadFundingRetryable(error) || attempt === ONCHAIN_FUNDING_MAX_RETRIES) {
          throw error;
        }
        onFundingRetry?.({
          attempt: attempt + 1,
          error,
          retryAt: Date.now() + ONCHAIN_FUNDING_RETRY_DELAY_MS,
        });
        await abortableDelay(ONCHAIN_FUNDING_RETRY_DELAY_MS, signal);
      }
    }

    throw lastError;
  }
}

async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Upload aborted');

  await new Promise<void>((resolve, reject) => {
    const timeoutRef: { current?: ReturnType<typeof setTimeout> } = {};
    const abortHandler = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      signal?.removeEventListener('abort', abortHandler);
      reject(new Error('Upload aborted'));
    };
    const done = () => {
      signal?.removeEventListener('abort', abortHandler);
      resolve();
    };

    timeoutRef.current = setTimeout(done, ms);
    signal?.addEventListener('abort', abortHandler, { once: true });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTerminalFundingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('auto top-up is disabled') ||
    normalized.includes('active pro subscription') ||
    normalized.includes('insufficient balance') ||
    normalized.includes('treasury icp reserve low') ||
    normalized.includes('service temporarily unavailable');
}

function isUploadFundingRetryable(error: unknown): boolean {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (isTerminalFundingError(message)) return false;

  return normalized.includes('[fundingpending]') ||
    normalized.includes('upload funding is pending') ||
    normalized.includes('storage funding is already in progress') ||
    normalized.includes('auto top-up is already in progress') ||
    normalized.includes('out of cycles') ||
    normalized.includes('could not perform remote call');
}

function shouldPreserveUploadSession(error: unknown): boolean {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (isTerminalFundingError(message)) return false;

  return isUploadFundingRetryable(error) ||
    normalized.includes('[insufficientcycles]') ||
    normalized.includes('insufficient storage canister cycles');
}
