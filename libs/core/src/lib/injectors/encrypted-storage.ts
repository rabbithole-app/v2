import { computed } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { EncryptedStorage } from '@rabbithole/encrypted-storage';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { HTTP_AGENT_TOKEN, provideHttpAgent } from './http-agent';

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
  (
    canisterId: ExtractInjectionToken<typeof ENCRYPTED_STORAGE_CANISTER_ID>,
    httpAgent: ExtractInjectionToken<typeof HTTP_AGENT_TOKEN>,
  ) => {
    return computed(
      () =>
        new EncryptedStorage({
          canisterId,
          origin: `https://${canisterId.toText()}.localhost`,
          agent: httpAgent(),
        }),
    );
  },
  {
    isRoot: false,
    deps: [ENCRYPTED_STORAGE_CANISTER_ID, HTTP_AGENT_TOKEN],
    extraProviders: [provideHttpAgent()],
  },
);
