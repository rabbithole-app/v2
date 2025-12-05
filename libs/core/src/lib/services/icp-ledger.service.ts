import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { AccountIdentifier, SubAccount } from '@dfinity/ledger-icp';
import { Principal } from '@dfinity/principal';
import { bigIntToUint8Array, toNullable } from '@dfinity/utils';

import { injectLedgerCanister } from '../injectors/ledger-canister';
import { LedgerService, TransferParams } from '../tokens';
import { isPrincipal } from '../utils';
import { AUTH_SERVICE } from '@rabbithole/auth';

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
    const to = isPrincipal(params.to)
      ? AccountIdentifier.fromPrincipal({
          principal: Principal.fromText(params.to),
          subAccount: params.subaccount
            ? SubAccount.fromBytes(params.subaccount)
            : undefined,
        })
      : AccountIdentifier.fromHex(params.to);

    return await ledger.transfer({
      to,
      amount: params.amount,
      memo: params.memo,
    });
  }
}
