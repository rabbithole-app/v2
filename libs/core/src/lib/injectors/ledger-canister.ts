import { computed } from '@angular/core';
import { IcpLedgerCanister } from '@icp-sdk/canisters/ledger/icp';
import { Principal } from '@icp-sdk/core/principal';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { LEDGER_CANISTER_ID } from '../constants';
import { injectHttpAgent } from './http-agent';

export const [injectLedgerCanister, provideLedgerCanister] =
  createInjectionToken(() => {
    const httpAgent = injectHttpAgent();

    return computed(() =>
      IcpLedgerCanister.create({
        agent: httpAgent(),
        canisterId: Principal.fromText(LEDGER_CANISTER_ID),
      }),
    );
  });
