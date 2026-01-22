import { computed } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import {
  IcpLedgerActorService,
  icpLedgerIdlFactory,
} from '@rabbithole/declarations';

import { LEDGER_CANISTER_ID } from '../constants';
import { injectHttpAgent } from './http-agent';

export const [
  injectLedgerActorWithAllowances,
  provideLedgerActorWithAllowances,
] = createInjectionToken(() => {
  const httpAgent = injectHttpAgent();

  return computed(() =>
    Actor.createActor<IcpLedgerActorService>(
      icpLedgerIdlFactory as unknown as IDL.InterfaceFactory,
      {
        agent: httpAgent(),
        canisterId: LEDGER_CANISTER_ID,
      },
    ),
  );
});
