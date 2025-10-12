import { Actor, ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import {
  DerivedKeyMaterial,
  DerivedPublicKey,
  EncryptedVetKey,
  TransportSecretKey,
} from '@dfinity/vetkeys';
import { sha256 } from '@noble/hashes/sha2';
import { Derived, Store } from '@tanstack/store';
import { get, set } from 'idb-keyval';
import mime from 'mime/lite';
import { isMatching, match, P } from 'ts-pattern';

import { _SERVICE, idlFactory } from './canisters/encrypted-storage.did';
import {
  EncryptedStorageConfig,
  Entry,
  EntryKind,
  EntryRaw,
  GrantPermission,
  Permission,
  PermissionItem,
  PermissionRaw,
  Progress,
  RevokePermission,
  StoreArgs,
  StoreBlobArgs,
  StorePathArgs,
  StoreReadableArgs,
  UploadState,
} from './types';
import { convertTreeNodes } from './utils';
import { limit, LimitFn } from './utils/limit';

export class EncryptedStorage {
  readonly #actor: ActorSubclass<_SERVICE>;
  readonly #domainSeparator = 'file_storage_dapp';
  readonly #limit: LimitFn;
  readonly #maxChunkSize: number;
  readonly #origin: string;
  #progress = new Store<Record<string, Progress>>({});
  // readonly #maxSingleFileSize: number;
  #sha256: Record<string, ReturnType<typeof sha256.create>> = {};

  /**
   * Create assets canister manager instance
   * @param config Additional configuration options, canister id is required
   */
  constructor(config: EncryptedStorageConfig) {
    const { concurrency, maxChunkSize, origin, ...actorConfig } = config;
    this.#actor = Actor.createActor<_SERVICE>(idlFactory, actorConfig);
    this.#origin = origin;
    this.#maxChunkSize = maxChunkSize ?? 1900000;
    this.#limit = limit(concurrency ?? 16);
  }

  async fsTree() {
    const fsTree = await this.#actor.fsTree();
    const canisterId = Actor.canisterIdOf(this.#actor);
    return [
      {
        name: canisterId.toText(),
        children: convertTreeNodes(fsTree),
      },
    ];
  }

  /**
   * Getting the decrypted file from the storage
   *
   * @param keyId A unique identifier for a vetKey, consisting of the owner and key name.
   * @returns Blob with decrypted content of the file
   */
  async get(keyId: [Principal, Uint8Array]) {
    // get derivedKeyMaterial for created file
    const derivedKeyMaterial = await this.#getDerivedKeyMaterialOrFetchIfNeeded(
      ...keyId,
    );
    const url = new URL(
      `/encrypted/${keyId[0].toText()}/${new TextDecoder().decode(keyId[1])}`,
      this.#origin,
    );

    const response = await fetch(url);
    const bytes = await response.bytes();
    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);
    const decryptedContent = await derivedKeyMaterial.decryptMessage(
      bytes,
      domainSeparator,
    );

    return new Blob([Uint8Array.from(decryptedContent)]);
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

  async grantPermission({ user, permission, entry }: GrantPermission) {
    return await this.#actor.grantPermission({
      entry: entry ? [[{ [entry[0]]: null } as EntryKind, entry[1]]] : [],
      user: typeof user === 'string' ? Principal.fromText(user) : user,
      permission: { [permission]: null } as PermissionRaw,
    });
  }

  async hasPermission({
    user,
    permission,
    entry,
  }: {
    entry?: Entry;
    permission: Permission;
    user: Principal | string;
  }) {
    return await this.#actor.hasPermission({
      entry: entry ? [[{ [entry[0]]: null } as EntryKind, entry[1]]] : [],
      user: typeof user === 'string' ? Principal.fromText(user) : user,
      permission: { [permission]: null } as PermissionRaw,
    });
  }

  async list(entry?: Entry) {
    return await this.#actor.list(
      entry ? [[{ [entry[0]]: null } as EntryKind, entry[1]]] : [],
    );
  }

  async listPermitted(entry?: Entry): Promise<PermissionItem[]> {
    const list = await this.#actor.listPermitted(
      entry ? [[{ [entry[0]]: null } as EntryKind, entry[1]]] : [],
    );

    return list.map(([principal, permission]) => ({
      user: principal.toString(),
      permission: Object.keys(permission)[0] as Permission,
    }));
  }

  async revokePermission({ user, entry }: RevokePermission) {
    return await this.#actor.revokePermission({
      entry: entry ? [[{ [entry[0]]: null } as EntryKind, entry[1]]] : [],
      user: typeof user === 'string' ? Principal.fromText(user) : user,
    });
  }

  async showTree(entry?: Entry) {
    return await this.#actor.showTree(
      entry ? [[{ [entry[0]]: null } as EntryKind, entry[1]]] : [],
    );
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
      () => this.#actor.create({ entry }),
      config.signal,
    );

    this.#progress.setState((state) => ({
      ...state,
      [key]: { status: UploadState.REQUESTING_VETKD },
    }));

    // get derivedKeyMaterial for created file
    const derivedKeyMaterial = await this.#getDerivedKeyMaterialOrFetchIfNeeded(
      details.keyId[0],
      Uint8Array.from(details.keyId[1]),
    );

    const domainSeparator = new TextEncoder().encode(this.#domainSeparator);
    const encryptedBytes = await derivedKeyMaterial.encryptMessage(
      bytes,
      domainSeparator,
    );

    this.#progress.setState((state) => ({
      ...state,
      [key]: {
        status: UploadState.IN_PROGRESS,
        current: 0,
        total: encryptedBytes.byteLength,
      },
    }));

    // create batch
    const { batchId } = await this.#limit(
      () => this.#actor.createBatch({ entry }),
      config.signal,
    );

    // upload chunks
    const chunkCount = Math.ceil(
      encryptedBytes.byteLength / this.#maxChunkSize,
    );
    const chunkIds: bigint[] = await Promise.all(
      Array.from({ length: chunkCount }).map(async (_, index) => {
        const content = encryptedBytes.slice(
          index * this.#maxChunkSize,
          Math.min((index + 1) * this.#maxChunkSize, encryptedBytes.byteLength),
        );

        this.#sha256[key].update(content);

        const { chunkId } = await this.#limit(
          () => this.#actor.createChunk({ content, batchId }),
          config.signal,
        );
        this.#progress.setState((state) => {
          const progress =
            state[key].status === UploadState.IN_PROGRESS
              ? { ...state[key], current: state[key].current + content.length }
              : {
                  current: content.length,
                  total: encryptedBytes.byteLength,
                };

          return {
            ...state,
            [key]: {
              status: UploadState.IN_PROGRESS,
              ...progress,
            },
          };
        });

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
