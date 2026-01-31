import type { ActorMethod } from "@icp-sdk/core/agent";
import type { IDL } from "@icp-sdk/core/candid";
import type { Principal } from "@icp-sdk/core/principal";

export interface _SERVICE {
  /**
   * Returns the amount of Tokens on the specified account.
   */
  account_balance: ActorMethod<[AccountBalanceArgs], Tokens>;
  account_balance_dfx: ActorMethod<[AccountBalanceArgsDfx], Tokens>;
  /**
   * Returns the account identifier for the given Principal and subaccount.
   */
  account_identifier: ActorMethod<[Account], AccountIdentifier>;
  /**
   * Returns the existing archive canisters information.
   */
  archives: ActorMethod<[], Archives>;
  /**
   * Returns token decimals.
   */
  decimals: ActorMethod<[], { decimals: number }>;
  get_allowances: ActorMethod<[GetAllowancesArgs], Allowances>;
  icrc1_balance_of: ActorMethod<[Account], Icrc1Tokens>;
  icrc1_decimals: ActorMethod<[], number>;
  icrc1_fee: ActorMethod<[], Icrc1Tokens>;
  icrc1_metadata: ActorMethod<[], Array<[string, Value]>>;
  icrc1_minting_account: ActorMethod<[], [] | [Account]>;
  /**
   * The following methods implement the ICRC-1 Token Standard.
   * https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-1
   */
  icrc1_name: ActorMethod<[], string>;
  icrc1_supported_standards: ActorMethod<
    [],
    Array<{ name: string; url: string }>
  >;
  icrc1_symbol: ActorMethod<[], string>;
  icrc1_total_supply: ActorMethod<[], Icrc1Tokens>;
  icrc1_transfer: ActorMethod<[TransferArg], Icrc1TransferResult>;
  icrc10_supported_standards: ActorMethod<
    [],
    Array<{ name: string; url: string }>
  >;
  icrc2_allowance: ActorMethod<[AllowanceArgs], Allowance>;
  icrc2_approve: ActorMethod<[ApproveArgs], ApproveResult>;
  icrc2_transfer_from: ActorMethod<[TransferFromArgs], TransferFromResult>;
  icrc21_canister_call_consent_message: ActorMethod<
    [icrc21_consent_message_request],
    icrc21_consent_message_response
  >;
  is_ledger_ready: ActorMethod<[], boolean>;
  /**
   * Returns token name.
   */
  name: ActorMethod<[], { name: string }>;
  /**
   * Queries blocks in the specified range.
   */
  query_blocks: ActorMethod<[GetBlocksArgs], QueryBlocksResponse>;
  /**
   * Queries encoded blocks in the specified range
   */
  query_encoded_blocks: ActorMethod<
    [GetBlocksArgs],
    QueryEncodedBlocksResponse
  >;
  remove_approval: ActorMethod<[RemoveApprovalArgs], ApproveResult>;
  send_dfx: ActorMethod<[SendArgs], BlockIndex>;
  /**
   * Returns token symbol.
   */
  symbol: ActorMethod<[], { symbol: string }>;
  tip_of_chain: ActorMethod<[], TipOfChainRes>;
  /**
   * Transfers tokens from a subaccount of the caller to the destination address.
   * The source address is computed from the principal of the caller and the specified subaccount.
   * When successful, returns the index of the block containing the transaction.
   */
  transfer: ActorMethod<[TransferArgs], TransferResult>;
  /**
   * Returns the current transfer_fee.
   */
  transfer_fee: ActorMethod<[TransferFeeArg], TransferFee>;
}
export interface Account {
  owner: Principal;
  subaccount: [] | [SubAccount];
}
/**
 * Arguments for the `account_balance` call.
 */
export interface AccountBalanceArgs {
  account: AccountIdentifier;
}
export interface AccountBalanceArgsDfx {
  account: TextAccountIdentifier;
}
/**
 * AccountIdentifier is a 32-byte array.
 * The first 4 bytes is big-endian encoding of a CRC32 checksum of the last 28 bytes.
 */
export type AccountIdentifier = number[] | Uint8Array;
export interface Allowance {
  allowance: Icrc1Tokens;
  expires_at: [] | [Icrc1Timestamp];
}
export interface AllowanceArgs {
  account: Account;
  spender: Account;
}
/**
 * The allowances returned by the `get_allowances` endpoint.
 */
export type Allowances = Array<{
  allowance: Tokens;
  expires_at: [] | [bigint];
  from_account_id: TextAccountIdentifier;
  to_spender_id: TextAccountIdentifier;
}>;
export interface ApproveArgs {
  amount: Icrc1Tokens;
  created_at_time: [] | [Icrc1Timestamp];
  expected_allowance: [] | [Icrc1Tokens];
  expires_at: [] | [Icrc1Timestamp];
  fee: [] | [Icrc1Tokens];
  from_subaccount: [] | [SubAccount];
  memo: [] | [number[] | Uint8Array];
  spender: Account;
}
export type ApproveError =
  | { AllowanceChanged: { current_allowance: Icrc1Tokens } }
  | { BadFee: { expected_fee: Icrc1Tokens } }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: Icrc1BlockIndex } }
  | { Expired: { ledger_time: bigint } }
  | {
      GenericError: { error_code: bigint; message: string };
    }
  | { InsufficientFunds: { balance: Icrc1Tokens } }
  | { TemporarilyUnavailable: null }
  | { TooOld: null };
export type ApproveResult = { Err: ApproveError } | { Ok: Icrc1BlockIndex };
export interface Archive {
  canister_id: Principal;
}
export interface ArchivedBlocksRange {
  /**
   * The function that should be called to fetch the archived blocks.
   * The range of the blocks accessible using this function is given by [from]
   * and [len] fields above.
   */
  callback: [Principal, string];
  /**
   * The number of blocks that can be fetch using the callback.
   */
  length: bigint;
  /**
   * The index of the first archived block that can be fetched using the callback.
   */
  start: BlockIndex;
}
export interface ArchivedEncodedBlocksRange {
  callback: [Principal, string];
  length: bigint;
  start: bigint;
}
export interface ArchiveOptions {
  controller_id: Principal;
  cycles_for_archive_creation: [] | [bigint];
  max_message_size_bytes: [] | [bigint];
  max_transactions_per_response: [] | [bigint];
  more_controller_ids: [] | [Array<Principal>];
  node_max_memory_size_bytes: [] | [bigint];
  num_blocks_to_archive: bigint;
  trigger_threshold: bigint;
}
export interface Archives {
  archives: Array<Archive>;
}
export interface Block {
  parent_hash: [] | [number[] | Uint8Array];
  timestamp: TimeStamp;
  transaction: Transaction;
}
/**
 * Sequence number of a block produced by the ledger.
 */
export type BlockIndex = bigint;
/**
 * A prefix of the block range specified in the [GetBlocksArgs] request.
 */
export interface BlockRange {
  /**
   * A prefix of the requested block range.
   * The index of the first block is equal to [GetBlocksArgs.from].
   *
   * Note that the number of blocks might be less than the requested
   * [GetBlocksArgs.len] for various reasons, for example:
   *
   * 1. The query might have hit the replica with an outdated state
   * that doesn't have the full block range yet.
   * 2. The requested range is too large to fit into a single reply.
   *
   * NOTE: the list of blocks can be empty if:
   * 1. [GetBlocksArgs.len] was zero.
   * 2. [GetBlocksArgs.from] was larger than the last block known to the canister.
   */
  blocks: Array<Block>;
}
export interface Duration {
  nanos: number;
  secs: bigint;
}
export interface FeatureFlags {
  icrc2: boolean;
}
export interface FieldsDisplay {
  fields: Array<[string, Icrc21Value]>;
  intent: string;
}
/**
 * The arguments for the `get_allowances` endpoint.
 * The `prev_spender_id` argument can be used for pagination. If specified
 * the endpoint returns allowances that are lexicographically greater than
 * (`from_account_id`, `prev_spender_id`) - start with spender after `prev_spender_id`.
 */
export interface GetAllowancesArgs {
  from_account_id: TextAccountIdentifier;
  prev_spender_id: [] | [TextAccountIdentifier];
  take: [] | [bigint];
}
export interface GetBlocksArgs {
  /**
   * Max number of blocks to fetch.
   */
  length: bigint;
  /**
   * The index of the first block to fetch.
   */
  start: BlockIndex;
}
export type Icrc1BlockIndex = bigint;
/**
 * Number of nanoseconds since the UNIX epoch in UTC timezone.
 */
export type Icrc1Timestamp = bigint;
export type Icrc1Tokens = bigint;
export type Icrc1TransferError =
  | { BadBurn: { min_burn_amount: Icrc1Tokens } }
  | { BadFee: { expected_fee: Icrc1Tokens } }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: Icrc1BlockIndex } }
  | {
      GenericError: { error_code: bigint; message: string };
    }
  | { InsufficientFunds: { balance: Icrc1Tokens } }
  | { TemporarilyUnavailable: null }
  | { TooOld: null };
export type Icrc1TransferResult =
  | { Err: Icrc1TransferError }
  | { Ok: Icrc1BlockIndex };
export interface icrc21_consent_info {
  consent_message: icrc21_consent_message;
  metadata: icrc21_consent_message_metadata;
}
export type icrc21_consent_message =
  | {
      FieldsDisplayMessage: FieldsDisplay;
    }
  | { GenericDisplayMessage: string };
export interface icrc21_consent_message_metadata {
  language: string;
  utc_offset_minutes: [] | [number];
}
export interface icrc21_consent_message_request {
  arg: number[] | Uint8Array;
  method: string;
  user_preferences: icrc21_consent_message_spec;
}
export type icrc21_consent_message_response =
  | { Err: icrc21_error }
  | { Ok: icrc21_consent_info };
export interface icrc21_consent_message_spec {
  device_spec: [] | [{ FieldsDisplay: null } | { GenericDisplay: null }];
  metadata: icrc21_consent_message_metadata;
}
export type icrc21_error =
  | {
      /**
       * Any error not covered by the above variants.
       */
      GenericError: { description: string; error_code: bigint };
    }
  | { ConsentMessageUnavailable: icrc21_error_info }
  | { InsufficientPayment: icrc21_error_info }
  | { UnsupportedCanisterCall: icrc21_error_info };
export interface icrc21_error_info {
  description: string;
}
export type Icrc21Value =
  | { DurationSeconds: { amount: bigint } }
  | { Text: { content: string } }
  | { TimestampSeconds: { amount: bigint } }
  | {
      TokenAmount: {
        amount: bigint;
        decimals: number;
        symbol: string;
      };
    };
export interface InitArgs {
  archive_options: [] | [ArchiveOptions];
  feature_flags: [] | [FeatureFlags];
  icrc1_minting_account: [] | [Account];
  initial_values: Array<[TextAccountIdentifier, Tokens]>;
  max_message_size_bytes: [] | [bigint];
  minting_account: TextAccountIdentifier;
  send_whitelist: Array<Principal>;
  token_name: [] | [string];
  token_symbol: [] | [string];
  transaction_window: [] | [Duration];
  transfer_fee: [] | [Tokens];
}
export type LedgerCanisterPayload =
  | { Init: InitArgs }
  | { Upgrade: [] | [UpgradeArgs] };
/**
 * An arbitrary number associated with a transaction.
 * The caller can set it in a `transfer` call as a correlation identifier.
 */
export type Memo = bigint;
export type Operation =
  | {
      Approve: {
        allowance: Tokens;
        /**
         * This field is deprecated and should not be used.
         */
        allowance_e8s: bigint;
        expected_allowance: [] | [Tokens];
        expires_at: [] | [TimeStamp];
        fee: Tokens;
        from: AccountIdentifier;
        spender: AccountIdentifier;
      };
    }
  | {
      Burn: {
        amount: Tokens;
        from: AccountIdentifier;
        spender: [] | [AccountIdentifier];
      };
    }
  | { Mint: { amount: Tokens; to: AccountIdentifier } }
  | {
      Transfer: {
        amount: Tokens;
        fee: Tokens;
        from: AccountIdentifier;
        spender: [] | [number[] | Uint8Array];
        to: AccountIdentifier;
      };
    };
/**
 * An error indicating that the arguments passed to [QueryArchiveFn] were invalid.
 */
export type QueryArchiveError =
  | {
      /**
       * [GetBlocksArgs.from] argument was smaller than the first block
       * served by the canister that received the request.
       */
      BadFirstBlockIndex: {
        first_valid_index: BlockIndex;
        requested_index: BlockIndex;
      };
    }
  | {
      /**
       * Reserved for future use.
       */
      Other: { error_code: bigint; error_message: string };
    };
/**
 * A function that is used for fetching archived ledger blocks.
 */
export type QueryArchiveFn = ActorMethod<[GetBlocksArgs], QueryArchiveResult>;
export type QueryArchiveResult =
  | {
      /**
       * Successfully fetched zero or more blocks.
       */
      Ok: BlockRange;
    }
  | {
      /**
       * The [GetBlocksArgs] request was invalid.
       */
      Err: QueryArchiveError;
    };
/**
 * The result of a "query_blocks" call.
 *
 * The structure of the result is somewhat complicated because the main ledger canister might
 * not have all the blocks that the caller requested: One or more "archive" canisters might
 * store some of the requested blocks.
 *
 * Note: as of Q4 2021 when this interface is authored, the IC doesn't support making nested
 * query calls within a query call.
 */
export interface QueryBlocksResponse {
  /**
   * Encoding of instructions for fetching archived blocks whose indices fall into the
   * requested range.
   *
   * For each entry `e` in [archived_blocks], `[e.from, e.from + len)` is a sub-range
   * of the originally requested block range.
   */
  archived_blocks: Array<ArchivedBlocksRange>;
  /**
   * List of blocks that were available in the ledger when it processed the call.
   *
   * The blocks form a contiguous range, with the first block having index
   * [first_block_index] (see below), and the last block having index
   * [first_block_index] + len(blocks) - 1.
   *
   * The block range can be an arbitrary sub-range of the originally requested range.
   */
  blocks: Array<Block>;
  /**
   * System certificate for the hash of the latest block in the chain.
   * Only present if `query_blocks` is called in a non-replicated query context.
   */
  certificate: [] | [number[] | Uint8Array];
  /**
   * The total number of blocks in the chain.
   * If the chain length is positive, the index of the last block is `chain_len - 1`.
   */
  chain_length: bigint;
  /**
   * The index of the first block in "blocks".
   * If the blocks vector is empty, the exact value of this field is not specified.
   */
  first_block_index: BlockIndex;
}
export interface QueryEncodedBlocksResponse {
  archived_blocks: Array<ArchivedEncodedBlocksRange>;
  blocks: Array<number[] | Uint8Array>;
  certificate: [] | [number[] | Uint8Array];
  chain_length: bigint;
  first_block_index: bigint;
}
export interface RemoveApprovalArgs {
  fee: [] | [Icrc1Tokens];
  from_subaccount: [] | [SubAccount];
  spender: AccountIdentifier;
}
/**
 * Arguments for the `send_dfx` call.
 */
export interface SendArgs {
  amount: Tokens;
  created_at_time: [] | [TimeStamp];
  fee: Tokens;
  from_subaccount: [] | [SubAccount];
  memo: Memo;
  to: TextAccountIdentifier;
}
/**
 * Subaccount is an arbitrary 32-byte byte array.
 * Ledger uses subaccounts to compute the source address, which enables one
 * principal to control multiple ledger accounts.
 */
export type SubAccount = number[] | Uint8Array;
/**
 * Account identifier encoded as a 64-byte ASCII hex string.
 */
export type TextAccountIdentifier = string;
/**
 * Number of nanoseconds from the UNIX epoch in UTC timezone.
 */
export interface TimeStamp {
  timestamp_nanos: bigint;
}
export interface TipOfChainRes {
  certification: [] | [number[] | Uint8Array];
  tip_index: BlockIndex;
}
/**
 * Amount of tokens, measured in 10^-8 of a token.
 */
export interface Tokens {
  e8s: bigint;
}
export interface Transaction {
  created_at_time: TimeStamp;
  icrc1_memo: [] | [number[] | Uint8Array];
  memo: Memo;
  operation: [] | [Operation];
}
export interface TransferArg {
  amount: Icrc1Tokens;
  created_at_time: [] | [Icrc1Timestamp];
  fee: [] | [Icrc1Tokens];
  from_subaccount: [] | [SubAccount];
  memo: [] | [number[] | Uint8Array];
  to: Account;
}
/**
 * Arguments for the `transfer` call.
 */
export interface TransferArgs {
  /**
   * The amount that the caller wants to transfer to the destination address.
   */
  amount: Tokens;
  /**
   * The point in time when the caller created this request.
   * If null, the ledger uses current IC time as the timestamp.
   */
  created_at_time: [] | [TimeStamp];
  /**
   * The amount that the caller pays for the transaction.
   * Must be 10000 e8s.
   */
  fee: Tokens;
  /**
   * The subaccount from which the caller wants to transfer funds.
   * If null, the ledger uses the default (all zeros) subaccount to compute the source address.
   * See comments for the `SubAccount` type.
   */
  from_subaccount: [] | [SubAccount];
  /**
   * Transaction memo.
   * See comments for the `Memo` type.
   */
  memo: Memo;
  /**
   * The destination account.
   * If the transfer is successful, the balance of this address increases by `amount`.
   */
  to: AccountIdentifier;
}
export type TransferError =
  | {
      /**
       * The account specified by the caller doesn't have enough funds.
       */
      InsufficientFunds: { balance: Tokens };
    }
  | {
      /**
       * The caller specified `created_at_time` that is too far in future.
       * The caller can retry the request later.
       */
      TxCreatedInFuture: null;
    }
  | {
      /**
       * The fee that the caller specified in the transfer request was not the one that ledger expects.
       * The caller can change the transfer fee to the `expected_fee` and retry the request.
       */
      BadFee: { expected_fee: Tokens };
    }
  | {
      /**
       * The ledger has already executed the request.
       * `duplicate_of` field is equal to the index of the block containing the original transaction.
       */
      TxDuplicate: { duplicate_of: BlockIndex };
    }
  | {
      /**
       * The request is too old.
       * The ledger only accepts requests created within 24 hours window.
       * This is a non-recoverable error.
       */
      TxTooOld: { allowed_window_nanos: bigint };
    };
export interface TransferFee {
  /**
   * The fee to pay to perform a transfer
   */
  transfer_fee: Tokens;
}
export type TransferFeeArg = {};
export interface TransferFromArgs {
  amount: Icrc1Tokens;
  created_at_time: [] | [Icrc1Timestamp];
  fee: [] | [Icrc1Tokens];
  from: Account;
  memo: [] | [number[] | Uint8Array];
  spender_subaccount: [] | [SubAccount];
  to: Account;
}
export type TransferFromError =
  | { BadBurn: { min_burn_amount: Icrc1Tokens } }
  | { BadFee: { expected_fee: Icrc1Tokens } }
  | { CreatedInFuture: { ledger_time: Icrc1Timestamp } }
  | { Duplicate: { duplicate_of: Icrc1BlockIndex } }
  | {
      GenericError: { error_code: bigint; message: string };
    }
  | { InsufficientAllowance: { allowance: Icrc1Tokens } }
  | { InsufficientFunds: { balance: Icrc1Tokens } }
  | { TemporarilyUnavailable: null }
  | { TooOld: null };
export type TransferFromResult =
  | { Err: TransferFromError }
  | { Ok: Icrc1BlockIndex };
export type TransferResult = { Err: TransferError } | { Ok: BlockIndex };
export interface UpgradeArgs {
  feature_flags: [] | [FeatureFlags];
  icrc1_minting_account: [] | [Account];
}
/**
 * The value returned from the [icrc1_metadata] endpoint.
 */
export type Value =
  | { Blob: number[] | Uint8Array }
  | { Int: bigint }
  | { Nat: bigint }
  | { Text: string };
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
