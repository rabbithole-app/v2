import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { AccountIdentifier, Account } from '@dfinity/ledger-icp';
import { Principal } from '@dfinity/principal';

import { injectLedgerCanister } from '../injectors/ledger-canister';
import { LedgerService, TransferParams } from '../tokens';
import { isPrincipal } from '../utils';
import { AUTH_SERVICE } from '@rabbithole/auth';
import { match, P } from 'ts-pattern';
import { bigIntToUint8Array, toNullable } from '@dfinity/utils';

// ICP transaction fee: 0.0001 ICP = 10_000 e8s
const ICP_TRANSACTION_FEE = BigInt(10_000);

@Injectable()
export class ICPLedgerService implements LedgerService {
  readonly #authService = inject(AUTH_SERVICE);
  readonly accountIdentifier = computed(() =>
    AccountIdentifier.fromPrincipal({
      principal: this.#authService.identity().getPrincipal(),
    }),
  );

  readonly #ledgerCanister = injectLedgerCanister();

  readonly balance = resource({
    loader: async () => {
      const ledger = this.#ledgerCanister();
      const account = this.accountIdentifier();

      return await ledger.accountBalance({
        accountIdentifier: account,
        certified: false,
      });
    },
    defaultValue: BigInt(0),
  });

  readonly transactionFee = signal(ICP_TRANSACTION_FEE);

  async transfer(params: TransferParams): Promise<bigint> {
    const ledger = this.#ledgerCanister();

    if (isPrincipal(params.to)) {
      return await ledger.icrc1Transfer({
        to: { owner: Principal.fromText(params.to), subaccount: [] },
        amount: params.amount,
        icrc1Memo: params.memo ? bigIntToUint8Array(params.memo) : undefined,
      });
    }

    return await ledger.transfer({
      to: AccountIdentifier.fromHex(params.to),
      amount: params.amount,
      memo: params.memo,
    });
  }
}
