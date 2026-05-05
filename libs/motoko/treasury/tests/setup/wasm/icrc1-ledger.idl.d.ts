import type { ActorMethod } from '@dfinity/agent';
import type { Principal } from '@dfinity/principal';

export interface _SERVICE {
  'archives' : ActorMethod<[], Array<ArchiveInfo>>,
  'get_blocks' : ActorMethod<[GetBlocksArgs], GetBlocksResponse>,
  'get_data_certificate' : ActorMethod<[], DataCertificate>,
  'get_transactions' : ActorMethod<
    [GetTransactionsRequest],
    GetTransactionsResponse
  >,
  'icrc1_balance_of' : ActorMethod<[Account], Tokens>,
  'icrc1_decimals' : ActorMethod<[], number>,
  'icrc1_fee' : ActorMethod<[], Tokens>,
  'icrc1_metadata' : ActorMethod<[], Array<[string, MetadataValue]>>,
  'icrc1_minting_account' : ActorMethod<[], [] | [Account]>,
  'icrc1_name' : ActorMethod<[], string>,
  'icrc1_supported_standards' : ActorMethod<[], Array<StandardRecord>>,
  'icrc1_symbol' : ActorMethod<[], string>,
  'icrc1_total_supply' : ActorMethod<[], Tokens>,
  'icrc1_transfer' : ActorMethod<[TransferArg], TransferResult>,
  'icrc10_supported_standards' : ActorMethod<
    [],
    Array<{ 'name' : string; 'url' : string, }>
  >,
  'icrc103_get_allowances' : ActorMethod<
    [GetAllowancesArgs],
    icrc103_get_allowances_response
  >,
  'icrc106_get_index_principal' : ActorMethod<[], GetIndexPrincipalResult>,
  'icrc2_allowance' : ActorMethod<[AllowanceArgs], Allowance>,
  'icrc2_approve' : ActorMethod<[ApproveArgs], ApproveResult>,
  'icrc2_transfer_from' : ActorMethod<[TransferFromArgs], TransferFromResult>,
  'icrc21_canister_call_consent_message' : ActorMethod<
    [icrc21_consent_message_request],
    icrc21_consent_message_response
  >,
  'icrc3_get_archives' : ActorMethod<[GetArchivesArgs], GetArchivesResult>,
  'icrc3_get_blocks' : ActorMethod<[Array<GetBlocksArgs>], GetBlocksResult>,
  'icrc3_get_tip_certificate' : ActorMethod<[], [] | [ICRC3DataCertificate]>,
  'icrc3_supported_block_types' : ActorMethod<
    [],
    Array<{ 'block_type' : string; 'url' : string, }>
  >,
  'is_ledger_ready' : ActorMethod<[], boolean>,
}
export interface Account {
  'owner' : Principal,
  'subaccount' : [] | [Subaccount],
}
export interface Allowance {
  'allowance' : bigint,
  'expires_at' : [] | [Timestamp],
}
export interface Allowance103 {
  'allowance' : bigint,
  'expires_at' : [] | [bigint],
  'from_account' : Account,
  'to_spender' : Account,
}
export interface AllowanceArgs { 'account' : Account, 'spender' : Account }
export interface Approve {
  'amount' : bigint,
  'created_at_time' : [] | [Timestamp],
  'expected_allowance' : [] | [bigint],
  'expires_at' : [] | [Timestamp],
  'fee' : [] | [bigint],
  'from' : Account,
  'memo' : [] | [number[] | Uint8Array],
  'spender' : Account,
}
export interface ApproveArgs {
  'amount' : bigint,
  'created_at_time' : [] | [Timestamp],
  'expected_allowance' : [] | [bigint],
  'expires_at' : [] | [Timestamp],
  'fee' : [] | [bigint],
  'from_subaccount' : [] | [number[] | Uint8Array],
  'memo' : [] | [number[] | Uint8Array],
  'spender' : Account,
}
export type ApproveError = { 'AllowanceChanged' : { 'current_allowance' : bigint } } |
  { 'BadFee' : { 'expected_fee' : bigint } } |
  { 'CreatedInFuture' : { 'ledger_time' : Timestamp } } |
  { 'Duplicate' : { 'duplicate_of' : BlockIndex } } |
  { 'Expired' : { 'ledger_time' : Timestamp } } |
  {
    'GenericError' : { 'error_code' : bigint; 'message' : string, }
  } |
  { 'InsufficientFunds' : { 'balance' : bigint } } |
  { 'TemporarilyUnavailable' : null } |
  { 'TooOld' : null };
export type ApproveResult = { 'Err' : ApproveError } |
  { 'Ok' : BlockIndex };
export interface ArchiveInfo {
  'block_range_end' : BlockIndex,
  'block_range_start' : BlockIndex,
  'canister_id' : Principal,
}
export type Block = Value;
export type BlockIndex = bigint;
export interface BlockRange { 'blocks' : Array<Block> }
export interface Burn {
  'amount' : bigint,
  'created_at_time' : [] | [Timestamp],
  'fee' : [] | [bigint],
  'from' : Account,
  'memo' : [] | [number[] | Uint8Array],
  'spender' : [] | [Account],
}
export interface ChangeArchiveOptions {
  'controller_id' : [] | [Principal],
  'cycles_for_archive_creation' : [] | [bigint],
  'max_message_size_bytes' : [] | [bigint],
  'max_transactions_per_response' : [] | [bigint],
  'more_controller_ids' : [] | [Array<Principal>],
  'node_max_memory_size_bytes' : [] | [bigint],
  'num_blocks_to_archive' : [] | [bigint],
  'trigger_threshold' : [] | [bigint],
}
export type ChangeFeeCollector = { 'SetTo' : Account } |
  { 'Unset' : null };
export interface DataCertificate {
  'certificate' : [] | [number[] | Uint8Array],
  'hash_tree' : number[] | Uint8Array,
}
export type Duration = bigint;
export interface FeatureFlags { 'icrc2' : boolean }
export interface FeeCollector {
  'caller' : [] | [Principal],
  'fee_collector' : [] | [Account],
  'mthd' : [] | [string],
  'ts' : [] | [bigint],
}
export interface FieldsDisplay {
  'fields' : Array<[string, Icrc21Value]>,
  'intent' : string,
}
export interface GetAllowancesArgs {
  'from_account' : [] | [Account],
  'prev_spender' : [] | [Account],
  'take' : [] | [bigint],
}
export type GetAllowancesError = { 'AccessDenied' : { 'reason' : string } } |
  {
    'GenericError' : { 'error_code' : bigint; 'message' : string, }
  };
export interface GetArchivesArgs { 'from' : [] | [Principal] }
export type GetArchivesResult = Array<
  { 'canister_id' : Principal, 'end' : bigint, 'start' : bigint }
>;
export interface GetBlocksArgs { 'length' : bigint; 'start' : BlockIndex, }
export interface GetBlocksResponse {
  'archived_blocks' : Array<
    {
      'callback' : QueryBlockArchiveFn,
      'length' : bigint,
      'start' : BlockIndex,
    }
  >,
  'blocks' : Array<Block>,
  'certificate' : [] | [number[] | Uint8Array],
  'chain_length' : bigint,
  'first_index' : BlockIndex,
}
export interface GetBlocksResult {
  'archived_blocks' : Array<
    { 'args' : Array<GetBlocksArgs>, 'callback' : [Principal, string] }
  >,
  'blocks' : Array<{ 'block' : ICRC3Value; 'id' : bigint, }>,
  'log_length' : bigint,
}
export type GetIndexPrincipalError = {
    'GenericError' : { 'description' : string, 'error_code' : bigint }
  } |
  { 'IndexPrincipalNotSet' : null };
export type GetIndexPrincipalResult = { 'Err' : GetIndexPrincipalError } |
  { 'Ok' : Principal };
export interface GetTransactionsRequest { 'length' : bigint; 'start' : TxIndex, }
export interface GetTransactionsResponse {
  'archived_transactions' : Array<
    { 'callback' : QueryArchiveFn, 'length' : bigint; 'start' : TxIndex, }
  >,
  'first_index' : TxIndex,
  'log_length' : bigint,
  'transactions' : Array<Transaction>,
}
export interface HttpRequest {
  'body' : number[] | Uint8Array,
  'headers' : Array<[string, string]>,
  'method' : string,
  'url' : string,
}
export interface HttpResponse {
  'body' : number[] | Uint8Array,
  'headers' : Array<[string, string]>,
  'status_code' : number,
}
export type icrc103_get_allowances_response = { 'Err' : GetAllowancesError } |
  { 'Ok' : Array<Allowance103> };
export interface icrc21_consent_info {
  'consent_message' : icrc21_consent_message,
  'metadata' : icrc21_consent_message_metadata,
}
export type icrc21_consent_message = {
    'FieldsDisplayMessage' : FieldsDisplay
  } |
  { 'GenericDisplayMessage' : string };
export interface icrc21_consent_message_metadata {
  'language' : string,
  'utc_offset_minutes' : [] | [number],
}
export interface icrc21_consent_message_request {
  'arg' : number[] | Uint8Array,
  'method' : string,
  'user_preferences' : icrc21_consent_message_spec,
}
export type icrc21_consent_message_response = { 'Err' : icrc21_error } |
  { 'Ok' : icrc21_consent_info };
export interface icrc21_consent_message_spec {
  'device_spec' : [] | [
    { 'FieldsDisplay' : null } |
      { 'GenericDisplay' : null }
  ],
  'metadata' : icrc21_consent_message_metadata,
}
export type icrc21_error = { 'ConsentMessageUnavailable' : icrc21_error_info } |
  {
    'GenericError' : { 'description' : string, 'error_code' : bigint }
  } |
  { 'InsufficientPayment' : icrc21_error_info } |
  { 'UnsupportedCanisterCall' : icrc21_error_info };
export interface icrc21_error_info { 'description' : string }
export type Icrc21Value = { 'DurationSeconds' : { 'amount' : bigint } } |
  { 'Text' : { 'content' : string } } |
  { 'TimestampSeconds' : { 'amount' : bigint } } |
  {
    'TokenAmount' : {
      'amount' : bigint,
      'decimals' : number,
      'symbol' : string,
    }
  };
export interface ICRC3DataCertificate {
  'certificate' : number[] | Uint8Array,
  'hash_tree' : number[] | Uint8Array,
}
export type ICRC3Value = { 'Array' : Array<ICRC3Value> } |
  { 'Blob' : number[] | Uint8Array } |
  { 'Int' : bigint } |
  { 'Map' : Array<[string, ICRC3Value]> } |
  { 'Nat' : bigint } |
  { 'Text' : string };
export interface InitArgs {
  'archive_options' : {
    'controller_id' : Principal,
    'cycles_for_archive_creation' : [] | [bigint],
    'max_message_size_bytes' : [] | [bigint],
    'max_transactions_per_response' : [] | [bigint],
    'more_controller_ids' : [] | [Array<Principal>],
    'node_max_memory_size_bytes' : [] | [bigint],
    'num_blocks_to_archive' : bigint,
    'trigger_threshold' : bigint,
  },
  'decimals' : [] | [number],
  'feature_flags' : [] | [FeatureFlags],
  'fee_collector_account' : [] | [Account],
  'index_principal' : [] | [Principal],
  'initial_balances' : Array<[Account, bigint]>,
  'max_memo_length' : [] | [number],
  'metadata' : Array<[string, MetadataValue]>,
  'minting_account' : Account,
  'token_name' : string,
  'token_symbol' : string,
  'transfer_fee' : bigint,
}
export type LedgerArg = { 'Init' : InitArgs } |
  { 'Upgrade' : [] | [UpgradeArgs] };
export type Map = Array<[string, Value]>;
export type MetadataValue = { 'Blob' : number[] | Uint8Array } |
  { 'Int' : bigint } |
  { 'Nat' : bigint } |
  { 'Text' : string };
export interface Mint {
  'amount' : bigint,
  'created_at_time' : [] | [Timestamp],
  'fee' : [] | [bigint],
  'memo' : [] | [number[] | Uint8Array],
  'to' : Account,
}
export type QueryArchiveFn = ActorMethod<
  [GetTransactionsRequest],
  TransactionRange
>;
export type QueryBlockArchiveFn = ActorMethod<[GetBlocksArgs], BlockRange>;
export interface StandardRecord { 'name' : string; 'url' : string, }
export type Subaccount = number[] | Uint8Array;
export type Timestamp = bigint;
export type Tokens = bigint;
export interface Transaction {
  'approve' : [] | [Approve],
  'burn' : [] | [Burn],
  'fee_collector' : [] | [FeeCollector],
  'kind' : string,
  'mint' : [] | [Mint],
  'timestamp' : Timestamp,
  'transfer' : [] | [Transfer],
}
export interface TransactionRange { 'transactions' : Array<Transaction> }
export interface Transfer {
  'amount' : bigint,
  'created_at_time' : [] | [Timestamp],
  'fee' : [] | [bigint],
  'from' : Account,
  'memo' : [] | [number[] | Uint8Array],
  'spender' : [] | [Account],
  'to' : Account,
}
export interface TransferArg {
  'amount' : Tokens,
  'created_at_time' : [] | [Timestamp],
  'fee' : [] | [Tokens],
  'from_subaccount' : [] | [Subaccount],
  'memo' : [] | [number[] | Uint8Array],
  'to' : Account,
}
export type TransferError = { 'BadBurn' : { 'min_burn_amount' : Tokens } } |
  { 'BadFee' : { 'expected_fee' : Tokens } } |
  { 'CreatedInFuture' : { 'ledger_time' : Timestamp } } |
  { 'Duplicate' : { 'duplicate_of' : BlockIndex } } |
  {
    'GenericError' : { 'error_code' : bigint; 'message' : string, }
  } |
  { 'InsufficientFunds' : { 'balance' : Tokens } } |
  { 'TemporarilyUnavailable' : null } |
  { 'TooOld' : null };
export interface TransferFromArgs {
  'amount' : Tokens,
  'created_at_time' : [] | [Timestamp],
  'fee' : [] | [Tokens],
  'from' : Account,
  'memo' : [] | [number[] | Uint8Array],
  'spender_subaccount' : [] | [Subaccount],
  'to' : Account,
}
export type TransferFromError = { 'BadBurn' : { 'min_burn_amount' : Tokens } } |
  { 'BadFee' : { 'expected_fee' : Tokens } } |
  { 'CreatedInFuture' : { 'ledger_time' : Timestamp } } |
  { 'Duplicate' : { 'duplicate_of' : BlockIndex } } |
  {
    'GenericError' : { 'error_code' : bigint; 'message' : string, }
  } |
  { 'InsufficientAllowance' : { 'allowance' : Tokens } } |
  { 'InsufficientFunds' : { 'balance' : Tokens } } |
  { 'TemporarilyUnavailable' : null } |
  { 'TooOld' : null };
export type TransferFromResult = { 'Err' : TransferFromError } |
  { 'Ok' : BlockIndex };
export type TransferResult = { 'Err' : TransferError } |
  { 'Ok' : BlockIndex };
export type TxIndex = bigint;
export interface UpgradeArgs {
  'change_archive_options' : [] | [ChangeArchiveOptions],
  'change_fee_collector' : [] | [ChangeFeeCollector],
  'feature_flags' : [] | [FeatureFlags],
  'index_principal' : [] | [Principal],
  'max_memo_length' : [] | [number],
  'metadata' : [] | [Array<[string, MetadataValue]>],
  'token_name' : [] | [string],
  'token_symbol' : [] | [string],
  'transfer_fee' : [] | [bigint],
}
export type Value = { 'Array' : Array<Value> } |
  { 'Blob' : number[] | Uint8Array } |
  { 'Int' : bigint } |
  { 'Map' : Map } |
  { 'Nat' : bigint } |
  { 'Nat64' : bigint } |
  { 'Text' : string };
