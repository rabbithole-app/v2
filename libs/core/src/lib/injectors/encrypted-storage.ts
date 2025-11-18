import { computed } from '@angular/core';
import { Principal } from '@dfinity/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { injectHttpAgent } from './http-agent';
import { EncryptedStorage } from '@rabbithole/encrypted-storage';

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
    deps: [ENCRYPTED_STORAGE_CANISTER_ID],
  },
);
