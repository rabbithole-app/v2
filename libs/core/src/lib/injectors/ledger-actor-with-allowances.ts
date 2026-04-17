import { computed } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import {
  IcpLedgerService,
  idlFactoryIcpLedger,
} from '@rabbithole/declarations';

import { LEDGER_CANISTER_ID } from '../constants';
import { injectHttpAgent } from './http-agent';

export const [
  injectLedgerActorWithAllowances,
  provideLedgerActorWithAllowances,
] = createInjectionToken(() => {
  const httpAgent = injectHttpAgent();

  return computed(() =>
    Actor.createActor<IcpLedgerService>(idlFactoryIcpLedger, {
      agent: httpAgent(),
      canisterId: LEDGER_CANISTER_ID,
    }),
  );
});
