import { arrayBufferToUint8Array } from '@dfinity/utils';
import { DerivedKeyMaterial } from '@dfinity/vetkeys';
import { ActorSubclass } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import {
  EncryptedStorageActorService,
  StorageBackend,
  ThumbnailEncryptionRef,
  ThumbnailEncryptionRequirement,
  ThumbnailRef,
} from '@rabbithole/declarations/encrypted-storage';

import { CAFFEINE_CHUNK_SIZE } from '../blob-storage/constants';
import { BlobStorageGatewayClient } from '../blob-storage/gateway-client';
import {
  BlobHashTree,
  verifyBlobIntegrity,
  YHash,
} from '../blob-storage/merkle-tree';
import { Entry, toEntryRaw } from '../types';
import { uint8ArrayToArrayBuffer } from '../utils/bytes';

const THUMBNAIL_KEY_BYTES = 32;
const THUMBNAIL_AES_GCM_IV_BYTES = 12;
const THUMBNAIL_ENCRYPTION_ALGORITHM = 'AES-GCM-256+vetkey-wrap-v1';
const THUMBNAIL_BLOB_DOMAIN_SEPARATOR = utf8ToBytes(
  'rabbithole:thumbnail:blob:v1',
);
const THUMBNAIL_KEY_WRAP_DOMAIN_SEPARATOR = utf8ToBytes(
  'rabbithole:thumbnail:keywrap:v1',
);

type ThumbnailClientConfig = {
  actor: ActorSubclass<EncryptedStorageActorService>;
  blobStorageClient?: BlobStorageGatewayClient;
  getDerivedKeyMaterial: (
    fileOwner: Principal,
    fileId: Uint8Array,
  ) => Promise<DerivedKeyMaterial>;
  origin: string;
};

export class ThumbnailClient {
  readonly #actor: ActorSubclass<EncryptedStorageActorService>;
  readonly #blobStorageClient?: BlobStorageGatewayClient;
  readonly #getDerivedKeyMaterial: ThumbnailClientConfig['getDerivedKeyMaterial'];
  readonly #origin: string;

  constructor({
    actor,
    blobStorageClient,
    getDerivedKeyMaterial,
    origin,
  }: ThumbnailClientConfig) {
    this.#actor = actor;
    this.#blobStorageClient = blobStorageClient;
    this.#getDerivedKeyMaterial = getDerivedKeyMaterial;
    this.#origin = origin;
  }

  async getUrl(thumbnailRef: ThumbnailRef): Promise<string> {
    const url = this.#sourceUrl(thumbnailRef);
    const encryption = this.#encryption(thumbnailRef);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Thumbnail download failed: ${response.status} ${response.statusText}`,
      );
    }

    const encryptedBytes = new Uint8Array(await response.arrayBuffer());
    if ('BlobStorage' in thumbnailRef) {
      const isValid = await verifyBlobIntegrity(
        encryptedBytes,
        thumbnailRef.BlobStorage.rootHash,
        thumbnailRef.BlobStorage.contentType,
        CAFFEINE_CHUNK_SIZE,
      );
      if (!isValid) {
        throw new Error('Thumbnail integrity verification failed');
      }
    }

    const decryptedBytes = await this.#decryptContent(
      encryptedBytes,
      encryption,
    );
    const contentType = this.#contentType(thumbnailRef);
    return URL.createObjectURL(
      new Blob([uint8ArrayToArrayBuffer(decryptedBytes)], {
        type: contentType,
      }),
    );
  }

  async rewrap(entry: Entry, thumbnailRef: ThumbnailRef): Promise<boolean> {
    const currentEncryption = this.#encryption(thumbnailRef);

    const prepared = await this.#actor.prepareThumbnailUpload({
      entry: toEntryRaw(entry),
      contentType: this.#contentType(thumbnailRef),
      size: this.#size(thumbnailRef),
    });
    if (!storageBackendsEqual(this.#storageBackend(thumbnailRef), prepared.storageBackend)) {
      return false;
    }

    const nextScopeKeyId = prepared.encryption.scopeKeyId;
    if (keyIdsEqual(currentEncryption.scopeKeyId, nextScopeKeyId)) {
      return false;
    }

    const thumbnailKeyBytes = await this.#unwrapKey(
      currentEncryption,
    );
    const nextEncryption = await this.#wrapKey(
      thumbnailKeyBytes,
      nextScopeKeyId,
      Uint8Array.from(currentEncryption.blobIv),
    );

    await this.#actor.rewrapThumbnail({
      entry: toEntryRaw(entry),
      thumbnailRef: this.#withEncryption(thumbnailRef, nextEncryption),
    });

    return true;
  }

  async save(entry: Entry, blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const content = arrayBufferToUint8Array(buffer);
    const contentType = blob.type || 'image/jpeg';
    const prepared = await this.#actor.prepareThumbnailUpload({
      entry: toEntryRaw(entry),
      contentType,
      size: BigInt(content.byteLength),
    });
    const thumbnail = await this.#prepareContent(
      content,
      prepared.encryption,
    );

    if ('OnChain' in prepared.storageBackend) {
      return await this.#actor.saveThumbnail({
        entry: toEntryRaw(entry),
        thumbnail: {
          content: thumbnail.content,
          contentType: prepared.contentType,
          encryption: thumbnail.encryption,
        },
      });
    }

    if (!this.#blobStorageClient) {
      throw new Error('Blob Storage is not configured for this environment');
    }

    const chunkHash = await YHash.fromChunk(thumbnail.content);
    const blobTree = await BlobHashTree.build([chunkHash], {
      'Content-Type': prepared.contentType,
      'Content-Length': thumbnail.content.byteLength.toString(),
    });
    const rootHash = blobTree.tree.hash.toShaString();
    const certificate =
      await this.#blobStorageClient.createCertificate(rootHash);

    await this.#blobStorageClient.uploadBlobTree({
      blobTree,
      certificate,
      totalSize: thumbnail.content.byteLength,
    });

    await this.#blobStorageClient.uploadChunks(
      [thumbnail.content],
      [chunkHash],
      rootHash,
    );

    return await this.#actor.commitThumbnailUpload({
      entry: toEntryRaw(entry),
      rootHash,
      sha256: sha256(thumbnail.content),
      contentType: prepared.contentType,
      size: BigInt(thumbnail.content.byteLength),
      encryption: thumbnail.encryption,
    });
  }

  #contentType(thumbnailRef: ThumbnailRef): string {
    if ('OnChain' in thumbnailRef) return thumbnailRef.OnChain.contentType;
    return thumbnailRef.BlobStorage.contentType;
  }

  async #decryptContent(
    encryptedContent: Uint8Array,
    encryption: ThumbnailEncryptionRef,
  ): Promise<Uint8Array> {
    if (encryption.algorithm !== THUMBNAIL_ENCRYPTION_ALGORITHM) {
      throw new Error(
        `Unsupported thumbnail encryption algorithm: ${encryption.algorithm}`,
      );
    }

    const thumbnailKeyBytes = await this.#unwrapKey(encryption);
    const thumbnailKey = await crypto.subtle.importKey(
      'raw',
      uint8ArrayToArrayBuffer(thumbnailKeyBytes),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: uint8ArrayToArrayBuffer(Uint8Array.from(encryption.blobIv)),
          additionalData: uint8ArrayToArrayBuffer(
            THUMBNAIL_BLOB_DOMAIN_SEPARATOR,
          ),
        },
        thumbnailKey,
        uint8ArrayToArrayBuffer(encryptedContent),
      ),
    );
  }

  #encryption(thumbnailRef: ThumbnailRef): ThumbnailEncryptionRef {
    if ('OnChain' in thumbnailRef) return thumbnailRef.OnChain.encryption;
    return thumbnailRef.BlobStorage.encryption;
  }

  async #prepareContent(
    content: Uint8Array,
    requirement: ThumbnailEncryptionRequirement,
  ): Promise<{ content: Uint8Array; encryption: ThumbnailEncryptionRef }> {
    const scopeKeyId = requirement.scopeKeyId;
    const thumbnailKeyBytes = crypto.getRandomValues(
      new Uint8Array(THUMBNAIL_KEY_BYTES),
    );
    const blobIv = crypto.getRandomValues(
      new Uint8Array(THUMBNAIL_AES_GCM_IV_BYTES),
    );
    const thumbnailKey = await crypto.subtle.importKey(
      'raw',
      uint8ArrayToArrayBuffer(thumbnailKeyBytes),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const encryptedContent = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: uint8ArrayToArrayBuffer(blobIv),
          additionalData: uint8ArrayToArrayBuffer(
            THUMBNAIL_BLOB_DOMAIN_SEPARATOR,
          ),
        },
        thumbnailKey,
        uint8ArrayToArrayBuffer(content),
      ),
    );

    return {
      content: encryptedContent,
      encryption: await this.#wrapKey(thumbnailKeyBytes, scopeKeyId, blobIv),
    };
  }

  #size(thumbnailRef: ThumbnailRef): bigint {
    if ('OnChain' in thumbnailRef) return thumbnailRef.OnChain.size;
    return thumbnailRef.BlobStorage.size;
  }

  #sourceUrl(thumbnailRef: ThumbnailRef): string {
    if ('OnChain' in thumbnailRef) {
      return `${this.#origin}${thumbnailRef.OnChain.key}`;
    }

    if (!this.#blobStorageClient) {
      throw new Error('Blob Storage is not configured for this environment');
    }

    return this.#blobStorageClient.getDownloadUrl(
      thumbnailRef.BlobStorage.rootHash,
    );
  }

  #storageBackend(thumbnailRef: ThumbnailRef): StorageBackend {
    return 'OnChain' in thumbnailRef
      ? { OnChain: null }
      : { BlobStorage: null };
  }

  async #unwrapKey(encryption: ThumbnailEncryptionRef): Promise<Uint8Array> {
    if (encryption.algorithm !== THUMBNAIL_ENCRYPTION_ALGORITHM) {
      throw new Error(
        `Unsupported thumbnail encryption algorithm: ${encryption.algorithm}`,
      );
    }

    const scopeKey = await this.#getDerivedKeyMaterial(
      encryption.scopeKeyId[0],
      Uint8Array.from(encryption.scopeKeyId[1]),
    );
    return Uint8Array.from(
      await scopeKey.decryptMessage(
        Uint8Array.from(encryption.wrappedKey),
        THUMBNAIL_KEY_WRAP_DOMAIN_SEPARATOR,
      ),
    );
  }

  #withEncryption(
    thumbnailRef: ThumbnailRef,
    encryption: ThumbnailEncryptionRef,
  ): ThumbnailRef {
    if ('OnChain' in thumbnailRef) {
      return {
        OnChain: {
          ...thumbnailRef.OnChain,
          encryption,
        },
      };
    }

    return {
      BlobStorage: {
        ...thumbnailRef.BlobStorage,
        encryption,
      },
    };
  }

  async #wrapKey(
    thumbnailKeyBytes: Uint8Array,
    scopeKeyId: ThumbnailEncryptionRequirement['scopeKeyId'],
    blobIv: Uint8Array,
  ): Promise<ThumbnailEncryptionRef> {
    const scopeKey = await this.#getDerivedKeyMaterial(
      scopeKeyId[0],
      Uint8Array.from(scopeKeyId[1]),
    );
    const wrappedKey = await scopeKey.encryptMessage(
      thumbnailKeyBytes,
      THUMBNAIL_KEY_WRAP_DOMAIN_SEPARATOR,
    );

    return {
      scopeKeyId,
      wrappedKey: Uint8Array.from(wrappedKey),
      blobIv,
      algorithm: THUMBNAIL_ENCRYPTION_ALGORITHM,
    };
  }
}

function keyIdsEqual(
  left: ThumbnailEncryptionRequirement['scopeKeyId'],
  right: ThumbnailEncryptionRequirement['scopeKeyId'],
): boolean {
  const leftBytes = Uint8Array.from(left[1]);
  const rightBytes = Uint8Array.from(right[1]);
  return left[0].toText() === right[0].toText()
    && leftBytes.length === rightBytes.length
    && leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function storageBackendsEqual(
  left: StorageBackend,
  right: StorageBackend,
): boolean {
  return ('OnChain' in left && 'OnChain' in right)
    || ('BlobStorage' in left && 'BlobStorage' in right);
}
