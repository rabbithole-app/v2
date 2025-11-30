import { computed, inject, InjectionToken } from '@angular/core';
import { LedgerCanister } from '@dfinity/ledger-icp';
import { createInjectionToken } from 'ngxtension/create-injection-token';

import { injectHttpAgent } from './http-agent';

export const LEDGER_CANISTER_ID = new InjectionToken<string>(
  'LEDGER_CANISTER_ID',
);

export const [injectLedgerCanister, provideLedgerCanister] =
  createInjectionToken(
    () => {
      const httpAgent = injectHttpAgent();
      const canisterId = inject(LEDGER_CANISTER_ID);

      return computed(() =>
        LedgerCanister.create({
          agent: httpAgent(),
          canisterId,
        }),
      );
    },
    {
      isRoot: false,
    },
  );
