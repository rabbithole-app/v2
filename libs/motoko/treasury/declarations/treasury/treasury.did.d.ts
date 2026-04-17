import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type AssetLocator = { 'Contract' : string } |
  { 'Mint' : string } |
  { 'Native' : null };
export interface BalanceEntry { 'tokenId' : TokenId, 'balance' : bigint }
export type ChainConfig = { 'Evm' : EvmChainConfig } |
  { 'Solana' : SolanaChainConfig };
export interface ChargeAndDistributeArgs {
  'tokenId' : TokenId,
  'metadata' : [] | [string],
  'userId' : Principal,
  'ambassadorL1' : [] | [Principal],
  'ambassadorL2' : [] | [Principal],
  'totalAmount' : bigint,
  'paymentId' : string,
}
export type ChargeAndDistributeResult = { 'ok' : DistributionRecord } |
  { 'err' : DistributePaymentError };
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
  { 'EvmNotConfigured' : null } |
  { 'SolNotConfigured' : null };
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
export interface EvmChainConfig {
  'evmRpcCanisterId' : string,
  'assets' : Array<SupportedAsset>,
  'rpcUrls' : Array<string>,
  'chainId' : bigint,
  'networkId' : string,
}
export interface InitArgs {
  'thresholdKeyName' : ThresholdKeyName,
  'admin' : Principal,
  'distributionConfig' : [] | [DistributionConfig],
  'chains' : Array<ChainConfig>,
}
export interface MinWithdrawConfig {
  'icp' : bigint,
  'sol' : bigint,
  'baseUsdc' : bigint,
  'baseUsdt' : bigint,
  'baseEth' : bigint,
  'ckEth' : bigint,
  'ckUsdc' : bigint,
  'ckUsdt' : bigint,
  'solUsdc' : bigint,
  'solUsdt' : bigint,
}
export interface SolanaChainConfig {
  'solRpcCanisterId' : string,
  'assets' : Array<SupportedAsset>,
  'rpcUrl' : [] | [string],
  'networkId' : string,
}
export interface SupportedAsset {
  'decimals' : number,
  'tokenId' : TokenId,
  'locator' : AssetLocator,
  'symbol' : string,
}
export type ThresholdKeyName = string;
export type TokenId = { 'ICP' : null } |
  { 'SOL' : null } |
  { 'SolUSDC' : null } |
  { 'SolUSDT' : null } |
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
  'solSignature' : [] | [string],
  'subaccount' : [] | [Uint8Array | number[]],
  'recipient' : Principal,
  'solAddress' : [] | [string],
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
   * / Charge from user's wallet and distribute to treasury + ambassadors in one step.
   * / Admin only. Transfers directly from user's derived wallets.
   */
  'chargeAndDistribute' : ActorMethod<
    [ChargeAndDistributeArgs],
    ChargeAndDistributeResult
  >,
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
   * / Get caller's Solana address (derived via threshold Schnorr Ed25519, cached).
   */
  'getSolAddress' : ActorMethod<[], [] | [string]>,
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
   * / Get the treasury canister's own Solana signing address.
   * / This is the address used to sign SOL/SPL transfers in distributePayment.
   */
  'getTreasurySolSigningAddress' : ActorMethod<[], [] | [string]>,
  /**
   * / Get all balances for a user across IC tokens. Admin only.
   */
  'getUserBalances' : ActorMethod<[Principal], Array<BalanceEntry>>,
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
  { 'EVM' : { 'address' : string } } |
  { 'SOL' : { 'address' : string } };
export type WithdrawError = { 'BelowMinimum' : { 'minimum' : bigint } } |
  { 'InsufficientBalance' : { 'available' : bigint } } |
  { 'TransferFailed' : string } |
  { 'EvmNotConfigured' : null } |
  { 'SolNotConfigured' : null };
export type WithdrawResult = { 'ok' : bigint } |
  { 'err' : WithdrawError };
export interface _SERVICE extends TreasuryCanister {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
