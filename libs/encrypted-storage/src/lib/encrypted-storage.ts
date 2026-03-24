import { arrayBufferToUint8Array } from '@dfinity/utils';
import {
  DerivedKeyMaterial,
  DerivedPublicKey,
  EncryptedVetKey,
  TransportSecretKey,
} from '@dfinity/vetkeys';
import { Actor, ActorSubclass } from '@icp-sdk/core/agent';
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
} from '@rabbithole/declarations';

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

export class EncryptedStorage {
  readonly #actor: ActorSubclass<EncryptedStorageActorService>;
  readonly #domainSeparator = 'file_storage_dapp';
  readonly #limit: LimitFn;
  readonly #maxChunkSize: number;
  readonly #origin: string;
  #progress = new Store<Record<string, Progress>>({});
  #sha256: Record<string, ReturnType<typeof sha256.create>> = {};

  /**
   * Create assets canister manager instance
   * @param config Additional configuration options, canister id is required
   */
  constructor(config: EncryptedStorageConfig) {
    const { concurrency, maxChunkSize, origin, ...actorConfig } = config;
    this.#actor = Actor.createActor<EncryptedStorageActorService>(encryptedStorageIdlFactory, actorConfig);
    this.#origin = origin;
    this.#maxChunkSize = maxChunkSize ?? 1_900_000;
    this.#limit = limit(concurrency ?? 16);
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

  async *downloadStream(
    entry: Entry,
    options?: {
      encrypted?: boolean;
      keyId?: [Principal, Uint8Array];
      onProgress?: (chunkIndex: number, totalChunks: number) => void;
      signal?: AbortSignal;
      totalChunks: number;
      version?: number;
    },
  ): AsyncGenerator<Uint8Array> {
    const totalChunks = options?.totalChunks ?? 1;
    const isEncrypted = options?.encrypted !== false;

    let derivedKeyMaterial: DerivedKeyMaterial | undefined;
    if (isEncrypted && options?.keyId) {
      derivedKeyMaterial = await this.#getDerivedKeyMaterialOrFetchIfNeeded(
        ...options.keyId,
      );
    }

    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);

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

    // create batch
    const { batchId } = await this.#limit(
      () => this.#actor.createStorageBatch({ entry }),
      config.signal,
    );

    // Per-chunk encryption: split plaintext first, encrypt each chunk independently.
    // The canister stores each uploaded chunk as a separate blob and returns it
    // as-is via getChunk(i), preserving encryption boundaries.
    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);
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
