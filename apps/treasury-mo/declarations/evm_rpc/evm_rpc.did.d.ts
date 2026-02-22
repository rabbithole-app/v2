import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface AccessListEntry {
  'storageKeys' : Array<string>,
  'address' : string,
}
export interface Block {
  'miner' : string,
  'totalDifficulty' : [] | [bigint],
  'receiptsRoot' : string,
  'stateRoot' : string,
  'hash' : string,
  'difficulty' : [] | [bigint],
  'size' : bigint,
  'uncles' : Array<string>,
  'baseFeePerGas' : [] | [bigint],
  'extraData' : string,
  'transactionsRoot' : [] | [string],
  'sha3Uncles' : string,
  'nonce' : bigint,
  'number' : bigint,
  'timestamp' : bigint,
  'transactions' : Array<string>,
  'gasLimit' : bigint,
  'logsBloom' : string,
  'parentHash' : string,
  'gasUsed' : bigint,
  'mixHash' : string,
}
export type BlockTag = { 'Earliest' : null } |
  { 'Safe' : null } |
  { 'Finalized' : null } |
  { 'Latest' : null } |
  { 'Number' : bigint } |
  { 'Pending' : null };
export interface CallArgs {
  'transaction' : TransactionRequest,
  'block' : [] | [BlockTag],
}
export type CallResult = { 'Ok' : string } |
  { 'Err' : RpcError };
export type ChainId = bigint;
export type ConsensusStrategy = { 'Equality' : null } |
  {
    'Threshold' : {
      /**
       * Minimum number of providers that must return the same (non-error) result.
       */
      'min' : number,
      /**
       * Total number of providers to be queried. Can be omitted, if that number can be inferred (e.g., providers are specified in the request).
       */
      'total' : [] | [number],
    }
  };
export type EthMainnetService = { 'Alchemy' : null } |
  { 'Llama' : null } |
  { 'BlockPi' : null } |
  { 'Cloudflare' : null } |
  { 'PublicNode' : null } |
  { 'Ankr' : null };
export type EthSepoliaService = { 'Alchemy' : null } |
  { 'BlockPi' : null } |
  { 'PublicNode' : null } |
  { 'Ankr' : null } |
  { 'Sepolia' : null };
export interface FeeHistory {
  'reward' : Array<Array<bigint>>,
  'gasUsedRatio' : Array<number>,
  'oldestBlock' : bigint,
  'baseFeePerGas' : Array<bigint>,
}
export interface FeeHistoryArgs {
  'blockCount' : bigint,
  'newestBlock' : BlockTag,
  'rewardPercentiles' : [] | [Uint8Array | number[]],
}
export type FeeHistoryResult = { 'Ok' : FeeHistory } |
  { 'Err' : RpcError };
export type GetBlockByNumberResult = { 'Ok' : Block } |
  { 'Err' : RpcError };
export interface GetLogsArgs {
  'fromBlock' : [] | [BlockTag],
  'toBlock' : [] | [BlockTag],
  'addresses' : Array<string>,
  'topics' : [] | [Array<Topic>],
}
export type GetLogsResult = { 'Ok' : Array<LogEntry> } |
  { 'Err' : RpcError };
export interface GetLogsRpcConfig {
  'responseConsensus' : [] | [ConsensusStrategy],
  /**
   * Most providers limit the block range that can be queried with `eth_getLogs`.
   * By default, the chosen value should work for all supported JSON-RPC providers.
   * This value could be changed if the providers are explicitly specified and they do support querying a larger block range.
   * DEFAULT: 500
   */
  'maxBlockRange' : [] | [number],
  'responseSizeEstimate' : [] | [bigint],
}
export interface GetTransactionCountArgs {
  'address' : string,
  'block' : BlockTag,
}
export type GetTransactionCountResult = { 'Ok' : bigint } |
  { 'Err' : RpcError };
export type GetTransactionReceiptResult = { 'Ok' : [] | [TransactionReceipt] } |
  { 'Err' : RpcError };
export interface HttpHeader { 'value' : string, 'name' : string }
export type HttpOutcallError = {
    'IcError' : { 'code' : RejectionCode, 'message' : string }
  } |
  {
    'InvalidHttpJsonRpcResponse' : {
      'status' : number,
      'body' : string,
      'parsingError' : [] | [string],
    }
  };
export interface InstallArgs {
  'logFilter' : [] | [LogFilter],
  'demo' : [] | [boolean],
  'manageApiKeys' : [] | [Array<Principal>],
  'overrideProvider' : [] | [OverrideProvider],
  'nodesInSubnet' : [] | [number],
}
export type JsonRequestResult = { 'Ok' : string } |
  { 'Err' : RpcError };
export interface JsonRpcError { 'code' : bigint, 'message' : string }
export type L2MainnetService = { 'Alchemy' : null } |
  { 'Llama' : null } |
  { 'BlockPi' : null } |
  { 'PublicNode' : null } |
  { 'Ankr' : null };
export interface LogEntry {
  'transactionHash' : [] | [string],
  'blockNumber' : [] | [bigint],
  'data' : string,
  'blockHash' : [] | [string],
  'transactionIndex' : [] | [bigint],
  'topics' : Array<string>,
  'address' : string,
  'logIndex' : [] | [bigint],
  'removed' : boolean,
}
export type LogFilter = { 'ShowAll' : null } |
  { 'HideAll' : null } |
  { 'ShowPattern' : Regex } |
  { 'HidePattern' : Regex };
export type MultiCallResult = { 'Consistent' : CallResult } |
  { 'Inconsistent' : Array<[RpcService, CallResult]> };
export type MultiFeeHistoryResult = { 'Consistent' : FeeHistoryResult } |
  { 'Inconsistent' : Array<[RpcService, FeeHistoryResult]> };
export type MultiGetBlockByNumberResult = {
    'Consistent' : GetBlockByNumberResult
  } |
  { 'Inconsistent' : Array<[RpcService, GetBlockByNumberResult]> };
export type MultiGetLogsResult = { 'Consistent' : GetLogsResult } |
  { 'Inconsistent' : Array<[RpcService, GetLogsResult]> };
export type MultiGetTransactionCountResult = {
    'Consistent' : GetTransactionCountResult
  } |
  { 'Inconsistent' : Array<[RpcService, GetTransactionCountResult]> };
export type MultiGetTransactionReceiptResult = {
    'Consistent' : GetTransactionReceiptResult
  } |
  { 'Inconsistent' : Array<[RpcService, GetTransactionReceiptResult]> };
export type MultiJsonRequestResult = { 'Consistent' : JsonRequestResult } |
  { 'Inconsistent' : Array<[RpcService, JsonRequestResult]> };
export type MultiSendRawTransactionResult = {
    'Consistent' : SendRawTransactionResult
  } |
  { 'Inconsistent' : Array<[RpcService, SendRawTransactionResult]> };
/**
 * Override resolved provider.
 * Useful for testing with a local Ethereum developer environment such as foundry.
 */
export interface OverrideProvider { 'overrideUrl' : [] | [RegexSubstitution] }
export interface Provider {
  'access' : RpcAccess,
  'alias' : [] | [RpcService],
  'chainId' : ChainId,
  'providerId' : ProviderId,
}
export type ProviderError = {
    'TooFewCycles' : { 'expected' : bigint, 'received' : bigint }
  } |
  { 'InvalidRpcConfig' : string } |
  { 'MissingRequiredProvider' : null } |
  { 'ProviderNotFound' : null } |
  { 'NoPermission' : null };
export type ProviderId = bigint;
export type Regex = string;
export interface RegexSubstitution { 'pattern' : Regex, 'replacement' : string }
export type RejectionCode = { 'NoError' : null } |
  { 'CanisterError' : null } |
  { 'SysTransient' : null } |
  { 'DestinationInvalid' : null } |
  { 'Unknown' : null } |
  { 'SysFatal' : null } |
  { 'CanisterReject' : null };
export type RequestCostResult = { 'Ok' : bigint } |
  { 'Err' : RpcError };
export type RequestResult = { 'Ok' : string } |
  { 'Err' : RpcError };
export type RpcAccess = {
    'Authenticated' : { 'publicUrl' : [] | [string], 'auth' : RpcAuth }
  } |
  { 'Unauthenticated' : { 'publicUrl' : string } };
export interface RpcApi { 'url' : string, 'headers' : [] | [Array<HttpHeader>] }
export type RpcAuth = { 'BearerToken' : { 'url' : string } } |
  { 'UrlParameter' : { 'urlPattern' : string } };
export interface RpcConfig {
  'responseConsensus' : [] | [ConsensusStrategy],
  'responseSizeEstimate' : [] | [bigint],
}
export type RpcError = { 'JsonRpcError' : JsonRpcError } |
  { 'ProviderError' : ProviderError } |
  { 'ValidationError' : ValidationError } |
  { 'HttpOutcallError' : HttpOutcallError };
export type RpcService = { 'EthSepolia' : EthSepoliaService } |
  { 'BaseMainnet' : L2MainnetService } |
  { 'Custom' : RpcApi } |
  { 'OptimismMainnet' : L2MainnetService } |
  { 'ArbitrumOne' : L2MainnetService } |
  { 'EthMainnet' : EthMainnetService } |
  { 'Provider' : ProviderId };
export type RpcServices = { 'EthSepolia' : [] | [Array<EthSepoliaService>] } |
  { 'BaseMainnet' : [] | [Array<L2MainnetService>] } |
  { 'Custom' : { 'chainId' : ChainId, 'services' : Array<RpcApi> } } |
  { 'OptimismMainnet' : [] | [Array<L2MainnetService>] } |
  { 'ArbitrumOne' : [] | [Array<L2MainnetService>] } |
  { 'EthMainnet' : [] | [Array<EthMainnetService>] };
export type SendRawTransactionResult = { 'Ok' : SendRawTransactionStatus } |
  { 'Err' : RpcError };
export type SendRawTransactionStatus = { 'Ok' : [] | [string] } |
  { 'NonceTooLow' : null } |
  { 'NonceTooHigh' : null } |
  { 'InsufficientFunds' : null };
/**
 * Each topic is a `vec text` of topic data composed with the "or" operator.
 * See https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_getlogs
 */
export type Topic = Array<string>;
export interface TransactionReceipt {
  'to' : [] | [string],
  'status' : [] | [bigint],
  'transactionHash' : string,
  'cumulativeGasUsed' : bigint,
  'blockNumber' : bigint,
  'from' : string,
  'logs' : Array<LogEntry>,
  'blockHash' : string,
  'root' : [] | [string],
  'type' : string,
  'transactionIndex' : bigint,
  'effectiveGasPrice' : bigint,
  'logsBloom' : string,
  'contractAddress' : [] | [string],
  'gasUsed' : bigint,
}
export interface TransactionRequest {
  'to' : [] | [string],
  'gas' : [] | [bigint],
  'maxFeePerGas' : [] | [bigint],
  'gasPrice' : [] | [bigint],
  'value' : [] | [bigint],
  'maxFeePerBlobGas' : [] | [bigint],
  'from' : [] | [string],
  'type' : [] | [string],
  'accessList' : [] | [Array<AccessListEntry>],
  'nonce' : [] | [bigint],
  'maxPriorityFeePerGas' : [] | [bigint],
  'blobs' : [] | [Array<string>],
  'input' : [] | [string],
  'chainId' : [] | [bigint],
  'blobVersionedHashes' : [] | [Array<string>],
}
export type ValidationError = { 'Custom' : string } |
  { 'InvalidHex' : string };
export interface _SERVICE {
  /**
   * Call the `eth_call` RPC method and return the resulting output.
   */
  'eth_call' : ActorMethod<
    [RpcServices, [] | [RpcConfig], CallArgs],
    MultiCallResult
  >,
  'eth_callCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], CallArgs],
    RequestCostResult
  >,
  /**
   * Call the `eth_feeHistory` RPC method and return the resulting fee history.
   */
  'eth_feeHistory' : ActorMethod<
    [RpcServices, [] | [RpcConfig], FeeHistoryArgs],
    MultiFeeHistoryResult
  >,
  'eth_feeHistoryCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], FeeHistoryArgs],
    RequestCostResult
  >,
  /**
   * Call the `eth_getBlockByNumber` RPC method and return the resulting block.
   */
  'eth_getBlockByNumber' : ActorMethod<
    [RpcServices, [] | [RpcConfig], BlockTag],
    MultiGetBlockByNumberResult
  >,
  'eth_getBlockByNumberCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], BlockTag],
    RequestCostResult
  >,
  /**
   * Call the `eth_getLogs` RPC method and return the resulting logs.
   */
  'eth_getLogs' : ActorMethod<
    [RpcServices, [] | [GetLogsRpcConfig], GetLogsArgs],
    MultiGetLogsResult
  >,
  'eth_getLogsCyclesCost' : ActorMethod<
    [RpcServices, [] | [GetLogsRpcConfig], GetLogsArgs],
    RequestCostResult
  >,
  /**
   * Call the `eth_getTransactionCount` RPC method and return the resulting transaction count.
   */
  'eth_getTransactionCount' : ActorMethod<
    [RpcServices, [] | [RpcConfig], GetTransactionCountArgs],
    MultiGetTransactionCountResult
  >,
  'eth_getTransactionCountCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], GetTransactionCountArgs],
    RequestCostResult
  >,
  /**
   * Call the `eth_getTransactionReceipt` RPC method and return the resulting transaction receipt.
   */
  'eth_getTransactionReceipt' : ActorMethod<
    [RpcServices, [] | [RpcConfig], string],
    MultiGetTransactionReceiptResult
  >,
  'eth_getTransactionReceiptCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], string],
    RequestCostResult
  >,
  /**
   * Call the `eth_sendRawTransaction` RPC method and return the resulting transaction hash.
   */
  'eth_sendRawTransaction' : ActorMethod<
    [RpcServices, [] | [RpcConfig], string],
    MultiSendRawTransactionResult
  >,
  'eth_sendRawTransactionCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], string],
    RequestCostResult
  >,
  'getNodesInSubnet' : ActorMethod<[], number>,
  'getProviders' : ActorMethod<[], Array<Provider>>,
  'getServiceProviderMap' : ActorMethod<[], Array<[RpcService, ProviderId]>>,
  /**
   * Make a raw JSON-RPC request that sends the given JSON-RPC payload.
   * This endpoint should be used instead of the `request` endpoint as it allows aggregating the responses from
   * multiple providers. It also takes parameters consistent with `eth_*` endpoints, i.e. an `RpcServices` instead
   * of an `RpcService`.
   */
  'multi_request' : ActorMethod<
    [RpcServices, [] | [RpcConfig], string],
    MultiJsonRequestResult
  >,
  'multi_requestCyclesCost' : ActorMethod<
    [RpcServices, [] | [RpcConfig], string],
    RequestCostResult
  >,
  /**
   * DEPRECATED: Use `multi_request` instead.
   */
  'request' : ActorMethod<[RpcService, string, bigint], RequestResult>,
  /**
   * DEPRECATED: Use the specific `*RequestCost` endpoints instead (e.g. `eth_feeHistoryRequestCost`).
   */
  'requestCost' : ActorMethod<[RpcService, string, bigint], RequestCostResult>,
  'updateApiKeys' : ActorMethod<
    [Array<[ProviderId, [] | [string]]>],
    undefined
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
