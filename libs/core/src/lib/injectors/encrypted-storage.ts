import { computed, inject } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { EncryptedStorage } from '@rabbithole/encrypted-storage';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { ENCRYPTED_STORAGE_BACKEND_TYPE_TOKEN } from '../tokens/main';
import { ExtractInjectionToken } from '../types';
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
    return computed(
      () =>
        new EncryptedStorage({
          canisterId,
          origin: `https://${canisterId.toText()}.localhost`,
          agent: httpAgent(),
          storageBackend: storageBackend ?? undefined,
        }),
    );
  },
  {
    isRoot: false,
    deps: [ENCRYPTED_STORAGE_CANISTER_ID],
  },
);
