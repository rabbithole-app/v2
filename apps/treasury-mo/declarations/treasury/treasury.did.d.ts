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
  { 'PartiallyCompleted' : DistributionRecord } |
  { 'TransferFailed' : { 'recipient' : string, 'error' : string } } |
  { 'EvmNotConfigured' : null };
export type DistributePaymentResult = { 'ok' : DistributionRecord } |
  { 'err' : DistributePaymentError };
export interface DistributionConfig {
  'l1Bps' : bigint,
  'l2Bps' : bigint,
  'minWithdraw' : MinWithdrawConfig,
}
export interface DistributionLogOptions { 'offset' : bigint, 'limit' : bigint }
export interface DistributionRecord {
  'id' : bigint,
  'status' : DistributionStatus,
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
export type DistributionStatus = { 'completed' : null } |
  { 'partial' : null };
export interface EvmConfig {
  'evmRpcCanisterId' : string,
  'rpcUrls' : Array<string>,
  'usdcContract' : string,
  'usdtContract' : string,
  'ecdsaKeyName' : string,
  'chainId' : bigint,
}
export interface InitArgs {
  'admin' : Principal,
  'evmConfig' : [] | [EvmConfig],
  'distributionConfig' : [] | [DistributionConfig],
}
export interface MinWithdrawConfig {
  'icp' : bigint,
  'baseUsdc' : bigint,
  'baseUsdt' : bigint,
  'baseEth' : bigint,
  'ckEth' : bigint,
  'ckUsdc' : bigint,
  'ckUsdt' : bigint,
}
export type TokenId = { 'ICP' : null } |
  { 'ckETH' : null } |
  { 'ckUSDC' : null } |
  { 'ckUSDT' : null } |
  { 'BaseUSDC' : null } |
  { 'BaseUSDT' : null } |
  { 'BaseETH' : null };
export type TransferOnChainStatus = { 'pending' : null } |
  { 'error' : string } |
  { 'reverted' : null } |
  { 'confirmed' : null } |
  { 'notApplicable' : null };
export interface TransferRecord {
  'tokenId' : TokenId,
  'subaccount' : [] | [Uint8Array | number[]],
  'recipient' : Principal,
  'error' : [] | [string],
  'blockIndex' : [] | [bigint],
  'txHash' : [] | [string],
  'amount' : bigint,
  'evmAddress' : [] | [string],
}
export interface TransferVerification {
  'status' : TransferOnChainStatus,
  'txHash' : string,
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
   * / Get caller's EVM address (derived via threshold ECDSA, cached).
   */
  'getEvmAddress' : ActorMethod<[], [] | [string]>,
  /**
   * / Get treasury operations account balances. Admin only.
   */
  'getTreasuryBalances' : ActorMethod<[], Array<BalanceEntry>>,
  /**
   * / Get the treasury canister's own EVM signing address.
   * / This is the address used to sign ERC-20 transfers in distributePayment.
   */
  'getTreasurySigningAddress' : ActorMethod<[], [] | [string]>,
  /**
   * / Get distributions related to a specific user. Admin only.
   */
  'getUserDistributions' : ActorMethod<[Principal], Array<DistributionRecord>>,
  /**
   * / Verify on-chain status of EVM transfers for a distribution.
   * / Admin only. Checks eth_getTransactionReceipt for each transfer with a txHash.
   */
  'verifyDistribution' : ActorMethod<[string], VerifyDistributionResult>,
  /**
   * / Withdraw funds from caller's subaccount to an external ICRC account.
   */
  'withdraw' : ActorMethod<[WithdrawArgs], WithdrawResult>,
}
export type VerifyDistributionError = { 'NotFound' : null } |
  { 'Unauthorized' : null } |
  { 'EvmNotConfigured' : null };
export type VerifyDistributionResult = { 'ok' : Array<TransferVerification> } |
  { 'err' : VerifyDistributionError };
export interface WithdrawArgs {
  'to' : WithdrawDestination,
  'tokenId' : TokenId,
  'amount' : bigint,
}
export type WithdrawDestination = {
    'IC' : { 'owner' : Principal, 'subaccount' : [] | [Uint8Array | number[]] }
  } |
  { 'EVM' : { 'address' : string } };
export type WithdrawError = { 'BelowMinimum' : { 'minimum' : bigint } } |
  { 'InsufficientBalance' : { 'available' : bigint } } |
  { 'TransferFailed' : string } |
  { 'EvmNotConfigured' : null };
export type WithdrawResult = { 'ok' : bigint } |
  { 'err' : WithdrawError };
export interface _SERVICE extends TreasuryCanister {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
