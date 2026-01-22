import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { toNullable } from '@dfinity/utils';
import { AccountIdentifier, SubAccount } from '@icp-sdk/canisters/ledger/icp';
import { Principal } from '@icp-sdk/core/principal';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { injectLedgerActorWithAllowances } from '../injectors';
import { injectLedgerCanister } from '../injectors/ledger-canister';
import { LedgerService, TransferParams } from '../tokens';
import { isPrincipal, timeInNanosToDate } from '../utils';

// ICP transaction fee: 0.0001 ICP = 10_000 e8s
const ICP_TRANSACTION_FEE = BigInt(10_000);

export interface AllowanceInfo {
  allowance: bigint;
  expiresAt?: Date;
  fromAccountId: string;
  toSpenderId: string;
}

export type GetAllowancesParams = {
  accountIdentifier?: AccountIdentifier;
  prevSpenderId?: string;
  take?: bigint;
};

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
  readonly #ledgerActorWithAllowances = injectLedgerActorWithAllowances();

  /**
   * Approves a spender to transfer ICP tokens on behalf of the user
   * @param spender Principal ID of the spender (must be Principal, not Account ID)
   * @param amount Amount in e8s that the spender can transfer
   * @param expiresAt Optional expiration date for the approval
   * @returns The block index of the approval transaction
   */
  async approve(
    spender: string,
    amount: bigint,
    expiresAt?: Date,
  ): Promise<bigint> {
    const ledger = this.#ledgerCanister();
    const spenderPrincipal = Principal.fromText(spender);

    // Convert Date to nanoseconds if provided
    const expiresAtNanos = expiresAt
      ? BigInt(expiresAt.getTime()) * BigInt(1_000_000)
      : undefined;

    return await ledger.icrc2Approve({
      spender: {
        owner: spenderPrincipal,
        subaccount: [],
      },
      amount,
      expires_at: expiresAtNanos,
    });
  }

  /**
   * Retrieves a list of all allowances for the user's account
   * @param params Query parameters (optional: accountIdentifier, prevSpenderId for pagination, take - number of records)
   * @returns Array of allowances
   */
  async getAllowances(
    params: GetAllowancesParams = {},
  ): Promise<AllowanceInfo[]> {
    const accountId = params.accountIdentifier ?? this.accountIdentifier();

    const actor = this.#ledgerActorWithAllowances();

    const result = await actor.get_allowances({
      from_account_id: accountId.toHex(),
      prev_spender_id: toNullable(params.prevSpenderId),
      take: toNullable(params.take),
    });

    return result.map((item) => ({
      fromAccountId: item.from_account_id,
      toSpenderId: item.to_spender_id,
      allowance: item.allowance.e8s,
      expiresAt: item.expires_at[0]
        ? timeInNanosToDate(item.expires_at[0])
        : undefined,
    }));
  }

  /**
   * Removes an approval for a spender
   * @param spender Account identifier of the spender
   * @returns The block index of the removal transaction
   */
  async removeApproval(spender: string): Promise<bigint> {
    const actor = this.#ledgerActorWithAllowances();
    const result = await actor.remove_approval({
      spender: AccountIdentifier.fromHex(spender).toUint8Array(),
      fee: [],
      from_subaccount: [],
    });

    if ('Err' in result) {
      throw new Error(`Failed to remove approval: ${JSON.stringify(result.Err)}`);
    }

    return result.Ok;
  }

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
