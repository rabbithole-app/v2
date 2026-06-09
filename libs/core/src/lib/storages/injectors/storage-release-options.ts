import { computed, resource } from '@angular/core';
import type { Principal } from '@icp-sdk/core/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { createEncryptedStorageActor } from '@rabbithole/encrypted-storage';

import { HTTP_AGENT_TOKEN } from '../../injectors/http-agent';
import { MAIN_ACTOR_TOKEN } from '../../injectors/main-actor';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '../../tokens';
import type { ExtractInjectionToken } from '../../types';
import {
  buildStorageReleaseOptions,
  type StorageReleaseOption,
} from '../utils/storage-release-options';

export type LoadStorageReleaseOptions = (
  canisterId: Principal,
) => Promise<StorageReleaseOption[]>;

export const [
  injectStorageReleaseOptionsLoader,
  provideStorageReleaseOptionsLoader,
  STORAGE_RELEASE_OPTIONS_LOADER_TOKEN,
] = createInjectionToken(
  (
    mainActor: ExtractInjectionToken<typeof MAIN_ACTOR_TOKEN>,
    httpAgent: ExtractInjectionToken<typeof HTTP_AGENT_TOKEN>,
  ) =>
    computed<LoadStorageReleaseOptions>(() => {
      const actor = mainActor();
      const agent = httpAgent();

      return async (canisterId) => {
        const storageActor = createEncryptedStorageActor({
          agent,
          canisterId,
        });

        return buildStorageReleaseOptions(actor, storageActor, canisterId);
      };
    }),
  {
    deps: [MAIN_ACTOR_TOKEN, HTTP_AGENT_TOKEN],
  },
);

export const [
  injectStorageReleaseOptions,
  provideStorageReleaseOptions,
  STORAGE_RELEASE_OPTIONS_TOKEN,
] = createInjectionToken(
  (
    loadStorageReleaseOptions: ExtractInjectionToken<
      typeof STORAGE_RELEASE_OPTIONS_LOADER_TOKEN
    >,
    canisterId: ExtractInjectionToken<typeof ENCRYPTED_STORAGE_CANISTER_ID>,
  ) =>
    resource({
      params: () => ({
        canisterId,
        loadStorageReleaseOptions: loadStorageReleaseOptions(),
      }),
      loader: ({ params }) =>
        params.loadStorageReleaseOptions(params.canisterId),
    }),
  {
    deps: [STORAGE_RELEASE_OPTIONS_LOADER_TOKEN, ENCRYPTED_STORAGE_CANISTER_ID],
  },
);
