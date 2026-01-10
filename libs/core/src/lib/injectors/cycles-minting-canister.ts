import { computed } from '@angular/core';
import { CmcCanister } from '@icp-sdk/canisters/cmc';
import { Principal } from '@icp-sdk/core/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { CYCLES_MINTING_CANISTER_ID } from '../constants';
import { injectHttpAgent } from './http-agent';

export const [injectCyclesMintingCanister, provideCyclesMintingCanister] =
  createInjectionToken(() => {
    const httpAgent = injectHttpAgent();

    return computed(() =>
      CmcCanister.create({
        agent: httpAgent(),
        canisterId: Principal.fromText(CYCLES_MINTING_CANISTER_ID),
      }),
    );
  });
