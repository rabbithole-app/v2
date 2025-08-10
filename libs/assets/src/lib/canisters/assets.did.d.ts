import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface AssetDetails {
  key: Key;
  encodings: Array<AssetEncodingDetails>;
  content_type: string;
}
export interface AssetEncodingDetails {
  modified: Time;
  sha256: [] | [Uint8Array | number[]];
  length: bigint;
  content_encoding: string;
}
export interface AssetsCanister {
  api_version: ActorMethod<[], number>;
  certified_tree: ActorMethod<[{}], CertifiedTree>;
  clear: ActorMethod<[ClearArguments], undefined>;
  commit_batch: ActorMethod<[CommitBatchArguments], undefined>;
  commit_proposed_batch: ActorMethod<[CommitProposedBatchArguments], undefined>;
  compute_evidence: ActorMethod<
    [ComputeEvidenceArguments],
    [] | [Uint8Array | number[]]
  >;
  configure: ActorMethod<[ConfigureArguments], undefined>;
  create_asset: ActorMethod<[CreateAssetArguments], undefined>;
  create_batch: ActorMethod<[{}], CreateBatchResponse>;
  create_chunk: ActorMethod<[CreateChunkArguments], CreateChunkResponse>;
  create_chunks: ActorMethod<[CreateChunksArguments], CreateChunksResponse>;
  delete_asset: ActorMethod<[DeleteAssetArguments], undefined>;
  delete_batch: ActorMethod<[DeleteBatchArguments], undefined>;
  get: ActorMethod<[GetArgs], EncodedAsset>;
  get_chunk: ActorMethod<[GetChunkArgs], ChunkContent>;
  get_configuration: ActorMethod<[], ConfigurationResponse>;
  grant_permission: ActorMethod<[GrantPermission], undefined>;
  http_request: ActorMethod<[HttpRequest], HttpResponse>;
  http_request_streaming_callback: ActorMethod<
    [StreamingToken],
    StreamingCallbackResponse
  >;
  list: ActorMethod<[{}], Array<AssetDetails>>;
  list_permitted: ActorMethod<[ListPermitted], Array<PermissionInfo>>;
  propose_commit_batch: ActorMethod<[CommitBatchArguments], undefined>;
  revoke_permission: ActorMethod<[RevokePermission], undefined>;
  set_asset_content: ActorMethod<[SetAssetContentArguments], undefined>;
  set_asset_properties: ActorMethod<[SetAssetPropertiesArguments], undefined>;
  show_tree: ActorMethod<[], Result>;
  store: ActorMethod<[StoreArgs], undefined>;
  take_ownership: ActorMethod<[], undefined>;
  unset_asset_content: ActorMethod<[UnsetAssetContentArguments], undefined>;
  validate_commit_proposed_batch: ActorMethod<
    [CommitProposedBatchArguments],
    Result
  >;
  validate_configure: ActorMethod<[ConfigureArguments], Result>;
  validate_grant_permission: ActorMethod<[GrantPermission], Result>;
  validate_revoke_permission: ActorMethod<[RevokePermission], Result>;
  validate_take_ownership: ActorMethod<[], Result>;
}
export type BatchId = bigint;
export type BatchOperationKind =
  | {
      SetAssetProperties: SetAssetPropertiesArguments;
    }
  | { CreateAsset: CreateAssetArguments }
  | { UnsetAssetContent: UnsetAssetContentArguments }
  | { DeleteAsset: DeleteAssetArguments }
  | { SetAssetContent: SetAssetContentArguments }
  | { Clear: ClearArguments };
export type CanisterArgs = { Upgrade: UpgradeArgs } | { Init: InitArgs };
export interface CertifiedTree {
  certificate: Uint8Array | number[];
  tree: Uint8Array | number[];
}
export interface ChunkContent {
  content: Uint8Array | number[];
}
export type ChunkId = bigint;
export type ClearArguments = {};
export interface CommitBatchArguments {
  batch_id: BatchId;
  operations: Array<BatchOperationKind>;
}
export interface CommitProposedBatchArguments {
  batch_id: BatchId;
  evidence: Uint8Array | number[];
}
export interface ComputeEvidenceArguments {
  batch_id: BatchId;
  max_iterations: [] | [number];
}
export interface ConfigurationResponse {
  max_batches: [] | [bigint];
  max_bytes: [] | [bigint];
  max_chunks: [] | [bigint];
}
export interface ConfigureArguments {
  max_batches: [] | [[] | [bigint]];
  max_bytes: [] | [[] | [bigint]];
  max_chunks: [] | [[] | [bigint]];
}
export interface CreateAssetArguments {
  key: Key;
  content_type: string;
  headers: [] | [Array<Header>];
  allow_raw_access: [] | [boolean];
  max_age: [] | [bigint];
  enable_aliasing: [] | [boolean];
}
export interface CreateBatchResponse {
  batch_id: BatchId;
}
export interface CreateChunkArguments {
  content: Uint8Array | number[];
  batch_id: BatchId;
}
export interface CreateChunkResponse {
  chunk_id: bigint;
}
export interface CreateChunksArguments {
  content: Array<Uint8Array | number[]>;
  batch_id: BatchId;
}
export interface CreateChunksResponse {
  chunk_ids: Array<ChunkId>;
}
export interface DeleteAssetArguments {
  key: Key;
}
export interface DeleteBatchArguments {
  batch_id: BatchId;
}
export interface EncodedAsset {
  content: Uint8Array | number[];
  sha256: [] | [Uint8Array | number[]];
  content_type: string;
  content_encoding: string;
  total_length: bigint;
}
export type Entry = { Directory: string } | { Asset: string };
export interface GetArgs {
  key: Key;
  accept_encodings: Array<string>;
}
export interface GetChunkArgs {
  key: Key;
  sha256: [] | [Uint8Array | number[]];
  index: bigint;
  content_encoding: string;
}
export interface GrantPermission {
  permission: Permission;
  to_principal: Principal;
  entry: [] | [Entry];
}
export type Header = [string, string];
export interface HttpRequest {
  url: string;
  method: string;
  body: Uint8Array | number[];
  headers: Array<Header>;
  certificate_version: [] | [number];
}
export interface HttpResponse {
  body: Uint8Array | number[];
  headers: Array<Header>;
  upgrade: [] | [boolean];
  streaming_strategy: [] | [StreamingStrategy];
  status_code: number;
}
export type InitArgs = {};
export type Key = string;
export interface ListPermitted {
  permission: [] | [Permission];
  entry: [] | [Entry];
}
export type Permission =
  | { Read: null }
  | { Write: null }
  | { Admin: null }
  | { Permissions: null };
export interface PermissionInfo {
  permission: Permission;
  principal: Principal;
}
export type Result = { ok: string } | { err: string };
export interface RevokePermission {
  permission: Permission;
  of_principal: Principal;
  entry: [] | [Entry];
}
export interface SetAssetContentArguments {
  key: Key;
  sha256: [] | [Uint8Array | number[]];
  chunk_ids: Array<ChunkId>;
  content_encoding: string;
}
export interface SetAssetPropertiesArguments {
  key: Key;
  headers: [] | [[] | [Array<Header>]];
  is_aliased: [] | [[] | [boolean]];
  allow_raw_access: [] | [[] | [boolean]];
  max_age: [] | [[] | [bigint]];
}
export type SetPermissions = Array<[Permission, Array<Principal>]>;
export interface StoreArgs {
  key: Key;
  content: Uint8Array | number[];
  sha256: [] | [Uint8Array | number[]];
  content_type: string;
  is_aliased: [] | [boolean];
  content_encoding: string;
}
export type StreamingCallback = ActorMethod<
  [StreamingToken],
  StreamingCallbackResponse
>;
export interface StreamingCallbackResponse {
  token: [] | [StreamingToken];
  body: Uint8Array | number[];
}
export type StreamingStrategy = {
  Callback: { token: StreamingToken; callback: StreamingCallback };
};
export type StreamingToken = Uint8Array | number[];
export type Time = bigint;
export interface UnsetAssetContentArguments {
  key: Key;
  content_encoding: string;
}
export interface UpgradeArgs {
  set_permissions: [] | [SetPermissions];
}
export interface _SERVICE extends AssetsCanister {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
