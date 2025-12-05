import { InjectionToken, ResourceRef, Signal } from '@angular/core';
import { AccountIdentifier } from '@dfinity/ledger-icp';

export interface LedgerService {
  accountIdentifier: Signal<AccountIdentifier>;
  balance: ResourceRef<bigint>;
  transactionFee: Signal<bigint>;
  transfer(params: TransferParams): Promise<bigint>;
}

export interface TransferParams {
  amount: bigint; // в e8s (1 ICP = 100_000_000 e8s)
  memo?: bigint;
  subaccount?: Uint8Array; // Optional subaccount for ICRC-1 transfers
  to: string; // AccountIdentifier hex or Principal
}

export const LEDGER_SERVICE_TOKEN = new InjectionToken<LedgerService>(
  'LEDGER_SERVICE_TOKEN',
);
