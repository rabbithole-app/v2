import { computed } from '@angular/core';
import { Principal } from '@dfinity/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { injectHttpAgent } from './http-agent';
import { AssetManager } from '@rabbithole/encrypted-storage';

export function assertAssetManager(
  assetManager: AssetManager | null,
): asserts assetManager is AssetManager {
  if (!assetManager)
    throw Error('The AssetManager instance is not initialized');
}

export const [injectAssetManager, provideAssetManager, ASSET_MANAGER_TOKEN] =
  createInjectionToken(
    (
      canisterId: ExtractInjectionToken<typeof ENCRYPTED_STORAGE_CANISTER_ID>,
    ) => {
      const httpAgent = injectHttpAgent();
      return computed(
        () =>
          new AssetManager({
            agent: httpAgent(),
            canisterId,
          }),
      );
    },
    {
      isRoot: false,
      deps: [ENCRYPTED_STORAGE_CANISTER_ID],
    },
  );
