import { computed, inject } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { EncryptedStorage } from '@rabbithole/encrypted-storage';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import {
  BLOB_STORAGE_CONFIG_TOKEN,
  ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN,
} from '../tokens/main';
import { ExtractInjectionToken } from '../types';
import { canisterOrigin } from '../utils/canister-origin';
import { HTTP_AGENT_OPTIONS_TOKEN } from './http-agent';
import { injectHttpAgent } from './http-agent';

export function assertEncryptedStorage(
  encryptedStorage: EncryptedStorage | null,
): asserts encryptedStorage is EncryptedStorage {
  if (!encryptedStorage)
    throw Error('The EncryptedStorage instance is not initialized');
}

export const [
  injectEncryptedStorage,
  provideEncryptedStorage,
  ENCRYPTED_STORAGE_TOKEN,
] = createInjectionToken(
  (canisterId: ExtractInjectionToken<typeof ENCRYPTED_STORAGE_CANISTER_ID>) => {
    const httpAgent = injectHttpAgent();
    const storageBackend = inject(ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN, { optional: true });
    const blobStorageConfig = inject(BLOB_STORAGE_CONFIG_TOKEN, { optional: true });
    const httpAgentOptions = inject(HTTP_AGENT_OPTIONS_TOKEN);
    return computed(
      () =>
        new EncryptedStorage({
          canisterId,
          origin: canisterOrigin(
            canisterId.toText(),
            String(httpAgentOptions.host ?? 'https://icp-api.io'),
          ),
          agent: httpAgent(),
          blobStorageGatewayUrl: blobStorageConfig?.gatewayUrl,
          storageBackend: storageBackend ?? undefined,
        }),
    );
  },
  {
    isRoot: false,
    deps: [ENCRYPTED_STORAGE_CANISTER_ID],
  },
);
