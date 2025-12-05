import { computed, InjectionToken } from '@angular/core';
import { Principal } from '@dfinity/principal';
import { CMCCanister } from '@icp-sdk/canisters/cmc';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ExtractInjectionToken } from '../types';
import { injectHttpAgent } from './http-agent';

export const CYCLES_MINTING_CANISTER_ID_TOKEN = new InjectionToken<Principal>(
  'CYCLES_MINTING_CANISTER_ID_TOKEN',
);

export const [injectCyclesMintingCanister, provideCyclesMintingCanister] =
  createInjectionToken(
    (
      canisterId: ExtractInjectionToken<
        typeof CYCLES_MINTING_CANISTER_ID_TOKEN
      >,
    ) => {
      const httpAgent = injectHttpAgent();

      return computed(() =>
        CMCCanister.create({
          agent: httpAgent(),
          canisterId,
        }),
      );
    },
    { deps: [CYCLES_MINTING_CANISTER_ID_TOKEN] },
  );
