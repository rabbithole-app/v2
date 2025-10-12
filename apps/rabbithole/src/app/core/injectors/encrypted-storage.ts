import { computed } from '@angular/core';
import { Principal } from '@dfinity/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectHttpAgent,
} from '@rabbithole/core';
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
  (encryptedStorageCanisterId: Principal) => {
    const httpAgent = injectHttpAgent();
    return computed(() => {
      const agent = httpAgent();
      return new EncryptedStorage({
        canisterId: encryptedStorageCanisterId,
        origin: `https://${encryptedStorageCanisterId.toText()}.localhost`,
        agent,
      });
    });
  },
  {
    isRoot: false,
    deps: [ENCRYPTED_STORAGE_CANISTER_ID],
  },
);
