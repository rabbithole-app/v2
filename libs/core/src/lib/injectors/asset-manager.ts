import { computed } from '@angular/core';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { AssetManager } from '@rabbithole/encrypted-storage';

import { ENCRYPTED_STORAGE_CANISTER_ID } from '../tokens';
import { ExtractInjectionToken } from '../types';
import { injectHttpAgent } from './http-agent';

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
