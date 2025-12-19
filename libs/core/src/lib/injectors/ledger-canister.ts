import { computed, InjectionToken } from '@angular/core';
import { IcpLedgerCanister } from '@icp-sdk/canisters/ledger/icp';
import { Principal } from '@icp-sdk/core/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ExtractInjectionToken } from '../types';
import { injectHttpAgent } from './http-agent';

export const LEDGER_CANISTER_ID_TOKEN = new InjectionToken<Principal>(
  'LEDGER_CANISTER_ID_TOKEN',
);

export const [injectLedgerCanister, provideLedgerCanister] =
  createInjectionToken(
    (canisterId: ExtractInjectionToken<typeof LEDGER_CANISTER_ID_TOKEN>) => {
      const httpAgent = injectHttpAgent();

      return computed(() =>
        IcpLedgerCanister.create({
          agent: httpAgent(),
          canisterId,
        }),
      );
    },
    { deps: [LEDGER_CANISTER_ID_TOKEN] },
  );
