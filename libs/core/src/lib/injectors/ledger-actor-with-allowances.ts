import { computed } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { ExtractInjectionToken } from '../types';
import { injectHttpAgent } from './http-agent';
import { LEDGER_CANISTER_ID_TOKEN } from './ledger-canister';
import {
  IcpLedgerActorService,
  icpLedgerIdlFactory,
} from '@rabbithole/declarations';

export const [
  injectLedgerActorWithAllowances,
  provideLedgerActorWithAllowances,
] = createInjectionToken(
  (canisterId: ExtractInjectionToken<typeof LEDGER_CANISTER_ID_TOKEN>) => {
    const httpAgent = injectHttpAgent();

    return computed(() =>
      Actor.createActor<IcpLedgerActorService>(
        icpLedgerIdlFactory as unknown as IDL.InterfaceFactory,
        {
          agent: httpAgent(),
          canisterId,
        },
      ),
    );
  },
  { deps: [LEDGER_CANISTER_ID_TOKEN] },
);
