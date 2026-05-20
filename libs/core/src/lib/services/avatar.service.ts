import { inject, Injectable } from '@angular/core';

import type { AvatarRef } from '@rabbithole/declarations/backend';
import {
  BlobHashTree,
  BlobStorageGatewayClient,
  YHash,
} from '@rabbithole/encrypted-storage';

import { injectHttpAgent, injectMainActor } from '../injectors';
import { BLOB_STORAGE_CONFIG_TOKEN, MAIN_CANISTER_ID_TOKEN } from '../tokens';

const BLOB_STORAGE_GATEWAY_VERSION = 'v1';
const DEFAULT_BLOB_STORAGE_PROJECT_ID = '0000000-0000-0000-0000-00000000000';
const AVATAR_GATEWAY_REQUEST_TIMEOUT_MS = 10_000;
const AVATAR_GATEWAY_MAX_RETRIES = 0;

@Injectable({ providedIn: 'root' })
export class AvatarService {
  readonly #actor = injectMainActor();
  readonly #agent = injectHttpAgent();
  readonly #canisterId = inject(MAIN_CANISTER_ID_TOKEN);
  readonly #blobStorageConfig = inject(BLOB_STORAGE_CONFIG_TOKEN, {
    optional: true,
  });

  avatarSrc(avatarRef: AvatarRef | null | undefined): string | null {
    const gatewayUrl = this.#gatewayUrl();
    if (!avatarRef || !gatewayUrl) return null;

    const query = new URLSearchParams({
      blob_hash: avatarRef.rootHash,
      owner_id: this.#canisterId.toText(),
      project_id: DEFAULT_BLOB_STORAGE_PROJECT_ID,
    });

    return `${gatewayUrl}/${BLOB_STORAGE_GATEWAY_VERSION}/blob/?${query}`;
  }

  async uploadAvatar(
    content: Uint8Array,
    contentType: string,
  ): Promise<AvatarRef> {
    const actor = this.#actor();
    const gatewayUrl = this.#gatewayUrl();
    const canisterId = this.#canisterId.toText();

    if (!gatewayUrl) {
      throw new Error('Blob Storage is not configured for this environment');
    }

    const client = new BlobStorageGatewayClient({
      agent: this.#agent(),
      canisterId,
      gatewayUrl,
      requestTimeoutMs: AVATAR_GATEWAY_REQUEST_TIMEOUT_MS,
      maxRetries: AVATAR_GATEWAY_MAX_RETRIES,
    });

    const prepared = await actor.prepareAvatarUpload({
      content,
      contentType,
    });

    const chunkHash = await YHash.fromChunk(content);
    const blobTree = await BlobHashTree.build([chunkHash], {
      'Content-Type': prepared.contentType,
      'Content-Length': content.byteLength.toString(),
    });
    const rootHash = blobTree.tree.hash.toShaString();

    if (rootHash !== prepared.rootHash) {
      throw new Error(
        'Prepared avatar root hash does not match cropped content',
      );
    }

    const certificate = await client.createCertificate(rootHash);

    await client.uploadBlobTree({
      blobTree,
      certificate,
      totalSize: content.byteLength,
    });

    await client.uploadChunks([content], [chunkHash], rootHash);

    return actor.commitAvatarUpload(rootHash);
  }

  async clearAvatar(): Promise<void> {
    await this.#actor().clearAvatar();
  }

  #gatewayUrl(): string | null {
    const gatewayUrl = this.#blobStorageConfig?.gatewayUrl.trim();
    return gatewayUrl ? gatewayUrl.replace(/\/+$/, '') : null;
  }
}
