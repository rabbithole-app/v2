import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface BalanceEntry { 'tokenId' : TokenId, 'balance' : bigint }
export interface DistributePaymentArgs {
  'tokenId' : TokenId,
  'metadata' : [] | [string],
  'ambassadorL1' : [] | [Principal],
  'ambassadorL2' : [] | [Principal],
  'paymentId' : string,
  'payer' : Principal,
  'amount' : bigint,
}
export type DistributePaymentError = { 'InvalidAmount' : null } |
  { 'AlreadyProcessed' : null } |
  { 'Unauthorized' : null } |
  { 'TransferFailed' : { 'recipient' : string, 'error' : string } };
export type DistributePaymentResult = { 'ok' : DistributionRecord } |
  { 'err' : DistributePaymentError };
export interface DistributionLogOptions { 'offset' : bigint, 'limit' : bigint }
export interface DistributionRecord {
  'id' : bigint,
  'tokenId' : TokenId,
  'l1Amount' : bigint,
  'transfers' : Array<TransferRecord>,
  'l2Amount' : bigint,
  'ambassadorL1' : [] | [Principal],
  'ambassadorL2' : [] | [Principal],
  'totalAmount' : bigint,
  'paymentId' : string,
  'timestamp' : bigint,
  'payer' : Principal,
  'treasuryAmount' : bigint,
}
export interface InitArgs { 'admin' : Principal }
export type TokenId = { 'ICP' : null } |
  { 'ckETH' : null } |
  { 'ckUSDC' : null } |
  { 'ckUSDT' : null };
export interface TransferRecord {
  'tokenId' : TokenId,
  'subaccount' : [] | [Uint8Array | number[]],
  'recipient' : Principal,
  'error' : [] | [string],
  'blockIndex' : [] | [bigint],
  'amount' : bigint,
}
export interface TreasuryCanister {
  /**
   * / Distribute a payment among treasury and ambassadors.
   * / Only callable by the admin (Backend canister).
   */
  'distributePayment' : ActorMethod<
    [DistributePaymentArgs],
    DistributePaymentResult
  >,
  /**
   * / Get caller's balance for a specific token.
   */
  'getBalance' : ActorMethod<[TokenId], bigint>,
  /**
   * / Get caller's balances across all supported tokens.
   */
  'getBalances' : ActorMethod<[], Array<BalanceEntry>>,
  /**
   * / Get distribution audit log with pagination. Admin only.
   */
  'getDistributionLog' : ActorMethod<
    [DistributionLogOptions],
    Array<DistributionRecord>
  >,
  /**
   * / Get treasury operations account balances. Admin only.
   */
  'getTreasuryBalances' : ActorMethod<[], Array<BalanceEntry>>,
  /**
   * / Get distributions related to a specific user. Admin only.
   */
  'getUserDistributions' : ActorMethod<[Principal], Array<DistributionRecord>>,
  /**
   * / Withdraw funds from caller's subaccount to an external ICRC account.
   */
  'withdraw' : ActorMethod<[WithdrawArgs], WithdrawResult>,
}
export interface WithdrawArgs {
  'to' : { 'owner' : Principal, 'subaccount' : [] | [Uint8Array | number[]] },
  'tokenId' : TokenId,
  'amount' : bigint,
}
export type WithdrawError = { 'BelowMinimum' : { 'minimum' : bigint } } |
  { 'InsufficientBalance' : { 'available' : bigint } } |
  { 'TransferFailed' : string };
export type WithdrawResult = { 'ok' : bigint } |
  { 'err' : WithdrawError };
export interface _SERVICE extends TreasuryCanister {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
