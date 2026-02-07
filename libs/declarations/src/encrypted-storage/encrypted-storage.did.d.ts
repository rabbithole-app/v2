import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface AssetDetails {
  'key' : Key,
  'encodings' : Array<AssetEncodingDetails>,
  'content_type' : string,
}
export interface AssetEncodingDetails {
  'modified' : Time,
  'sha256' : [] | [Uint8Array | number[]],
  'length' : bigint,
  'content_encoding' : string,
}
export type BatchId = bigint;
export type BatchOperationKind = {
    'SetAssetProperties' : SetAssetPropertiesArguments
  } |
  { 'CreateAsset' : CreateAssetArguments } |
  { 'UnsetAssetContent' : UnsetAssetContentArguments } |
  { 'DeleteAsset' : DeleteAssetArguments } |
  { 'SetAssetContent' : SetAssetContentArguments } |
  { 'Clear' : ClearArguments };
export interface CallbackStreamingStrategy {
  'token' : StreamingToken,
  'callback' : [Principal, string],
}
export interface CertifiedTree {
  'certificate' : Uint8Array | number[],
  'tree' : Uint8Array | number[],
}
export interface ChunkContent { 'content' : Uint8Array | number[] }
export type ChunkId = bigint;
export type ClearArguments = {};
export interface CommitBatchArguments {
  'batch_id' : BatchId,
  'operations' : Array<BatchOperationKind>,
}
export interface CommitProposedBatchArguments {
  'batch_id' : BatchId,
  'evidence' : Uint8Array | number[],
}
export interface ComputeEvidenceArguments {
  'batch_id' : BatchId,
  'max_iterations' : [] | [number],
}
export interface ConfigurationResponse {
  'max_batches' : [] | [bigint],
  'max_bytes' : [] | [bigint],
  'max_chunks' : [] | [bigint],
}
export interface ConfigureArguments {
  'max_batches' : [] | [[] | [bigint]],
  'max_bytes' : [] | [[] | [bigint]],
  'max_chunks' : [] | [[] | [bigint]],
}
export interface CreateArguments { 'entry' : Entry, 'overwrite' : boolean }
export interface CreateAssetArguments {
  'key' : Key,
  'content_type' : string,
  'headers' : [] | [Array<Header>],
  'allow_raw_access' : [] | [boolean],
  'max_age' : [] | [bigint],
  'enable_aliasing' : [] | [boolean],
}
export interface CreateBatchArguments { 'entry' : Entry }
export interface CreateBatchResponse { 'batch_id' : BatchId }
export interface CreateBatchResponse__1 { 'batchId' : BatchId }
export interface CreateChunkArguments {
  'content' : Uint8Array | number[],
  'batch_id' : BatchId,
}
export interface CreateChunkArguments__1 {
  'content' : Uint8Array | number[],
  'batchId' : BatchId,
}
export interface CreateChunkResponse { 'chunk_id' : bigint }
export interface CreateChunkResponse__1 { 'chunkId' : bigint }
export interface CreateChunksArguments {
  'content' : Array<Uint8Array | number[]>,
  'batch_id' : BatchId,
}
export interface CreateChunksResponse { 'chunk_ids' : Array<ChunkId> }
export interface DeleteArguments { 'recursive' : boolean, 'entry' : Entry }
export interface DeleteAssetArguments { 'key' : Key }
export interface DeleteBatchArguments { 'batch_id' : BatchId }
export type DirectoryColor = { 'blue' : null } |
  { 'gray' : null } |
  { 'orange' : null } |
  { 'pink' : null } |
  { 'purple' : null } |
  { 'green' : null } |
  { 'yellow' : null };
export interface DirectoryMetadata { 'color' : [] | [DirectoryColor] }
export interface EncodedAsset {
  'content' : Uint8Array | number[],
  'sha256' : [] | [Uint8Array | number[]],
  'content_type' : string,
  'content_encoding' : string,
  'total_length' : bigint,
}
export interface EncryptedStorageCanister {
  'api_version' : ActorMethod<[], number>,
  'certified_tree' : ActorMethod<[{}], CertifiedTree>,
  'clear' : ActorMethod<[ClearArguments], undefined>,
  'clearStorage' : ActorMethod<[], undefined>,
  'commit_batch' : ActorMethod<[CommitBatchArguments], undefined>,
  'commit_proposed_batch' : ActorMethod<
    [CommitProposedBatchArguments],
    undefined
  >,
  'compute_evidence' : ActorMethod<
    [ComputeEvidenceArguments],
    [] | [Uint8Array | number[]]
  >,
  'configure' : ActorMethod<[ConfigureArguments], undefined>,
  'create' : ActorMethod<[CreateArguments], NodeDetails>,
  'createStorageBatch' : ActorMethod<
    [CreateBatchArguments],
    CreateBatchResponse__1
  >,
  'createStorageChunk' : ActorMethod<
    [CreateChunkArguments__1],
    CreateChunkResponse__1
  >,
  'create_asset' : ActorMethod<[CreateAssetArguments], undefined>,
  'create_batch' : ActorMethod<[{}], CreateBatchResponse>,
  'create_chunk' : ActorMethod<[CreateChunkArguments], CreateChunkResponse>,
  'create_chunks' : ActorMethod<[CreateChunksArguments], CreateChunksResponse>,
  'delete' : ActorMethod<[DeleteArguments], undefined>,
  'delete_asset' : ActorMethod<[DeleteAssetArguments], undefined>,
  'delete_batch' : ActorMethod<[DeleteBatchArguments], undefined>,
  'fsTree' : ActorMethod<[], Array<TreeNode>>,
  'get' : ActorMethod<[GetArgs], EncodedAsset>,
  'getEncryptedVetkey' : ActorMethod<[KeyId, TransportKey], VetKey>,
  /**
   * / Get canister module_hash via canister_status.
   * / Only accessible by canister controllers.
   */
  'getModuleHash' : ActorMethod<[], [] | [Uint8Array | number[]]>,
  'getStorageChunk' : ActorMethod<[GetChunkArguments], ChunkContent>,
  'getVetkeyVerificationKey' : ActorMethod<[], VetKeyVerificationKey>,
  'get_chunk' : ActorMethod<[GetChunkArgs], ChunkContent>,
  'get_configuration' : ActorMethod<[], ConfigurationResponse>,
  'grantStoragePermission' : ActorMethod<[GrantPermissionArguments], undefined>,
  'grant_permission' : ActorMethod<[GrantPermission], undefined>,
  'hasStoragePermission' : ActorMethod<[HasPermissionArguments], boolean>,
  'http_request' : ActorMethod<[RawQueryHttpRequest], RawQueryHttpResponse>,
  'http_request_streaming_callback' : ActorMethod<
    [StreamingToken],
    StreamingCallbackResponse
  >,
  'http_request_update' : ActorMethod<
    [RawUpdateHttpRequest],
    RawUpdateHttpResponse
  >,
  'list' : ActorMethod<[{}], Array<AssetDetails>>,
  'listPermitted' : ActorMethod<
    [[] | [Entry]],
    Array<[Principal, PermissionExt]>
  >,
  'listStorage' : ActorMethod<[[] | [Entry]], Array<NodeDetails>>,
  'list_permitted' : ActorMethod<[ListPermitted], Array<Principal>>,
  'move' : ActorMethod<[MoveArguments], undefined>,
  'propose_commit_batch' : ActorMethod<[CommitBatchArguments], undefined>,
  'revokeStoragePermission' : ActorMethod<
    [RevokePermissionArguments],
    undefined
  >,
  'revoke_permission' : ActorMethod<[RevokePermission], undefined>,
  'saveThumbnail' : ActorMethod<[SaveThumbnailArguments], NodeDetails>,
  'set_asset_content' : ActorMethod<[SetAssetContentArguments], undefined>,
  'set_asset_properties' : ActorMethod<
    [SetAssetPropertiesArguments],
    undefined
  >,
  'showTree' : ActorMethod<[[] | [Entry]], string>,
  'store' : ActorMethod<[StoreArgs], undefined>,
  'take_ownership' : ActorMethod<[], undefined>,
  'unset_asset_content' : ActorMethod<[UnsetAssetContentArguments], undefined>,
  'update' : ActorMethod<[UpdateArguments], undefined>,
  'validate_commit_proposed_batch' : ActorMethod<
    [CommitProposedBatchArguments],
    Result
  >,
  'validate_configure' : ActorMethod<[ConfigureArguments], Result>,
  'validate_grant_permission' : ActorMethod<[GrantPermission], Result>,
  'validate_revoke_permission' : ActorMethod<[RevokePermission], Result>,
  'validate_take_ownership' : ActorMethod<[], Result>,
}
export interface EncryptedStorageInitArgs {
  'vetKeyName' : string,
  'owner' : Principal,
}
export type Entry = [{ 'File' : null } | { 'Directory' : null }, string];
export interface FileMetadata {
  'sha256' : [] | [Uint8Array | number[]],
  'thumbnailKey' : [] | [string],
  'contentType' : string,
  'size' : bigint,
}
export interface GetArgs { 'key' : Key, 'accept_encodings' : Array<string> }
export interface GetChunkArgs {
  'key' : Key,
  'sha256' : [] | [Uint8Array | number[]],
  'index' : bigint,
  'content_encoding' : string,
}
export interface GetChunkArguments { 'chunkIndex' : bigint, 'entry' : Entry }
export interface GrantPermission {
  'permission' : Permission,
  'to_principal' : Principal,
}
export interface GrantPermissionArguments {
  'permission' : Permission__1,
  'user' : Principal,
  'entry' : [] | [Entry],
}
export interface HasPermissionArguments {
  'permission' : Permission__1,
  'user' : Principal,
  'entry' : [] | [Entry],
}
export type Header = [string, string];
export type Key = string;
export type KeyId = [Owner, KeyName];
export type KeyName = Uint8Array | number[];
export interface ListPermitted { 'permission' : Permission }
export interface MoveArguments { 'entry' : Entry, 'target' : [] | [Entry] }
export interface NodeDetails {
  'id' : bigint,
  'permissions' : Array<[Principal, Permission__1]>,
  'modifiedAt' : [] | [Time],
  'metadata' : { 'File' : FileMetadata } |
    { 'Directory' : DirectoryMetadata },
  'name' : string,
  'createdAt' : Time,
  'parentId' : [] | [bigint],
  'keyId' : KeyId,
}
export type Owner = Principal;
export type Permission = { 'Prepare' : null } |
  { 'Manage' : null } |
  { 'Commit' : null };
export type PermissionExt = { 'Read' : null } |
  { 'ReadWrite' : null } |
  { 'ReadWriteManage' : null } |
  { 'Controller' : null };
export type Permission__1 = { 'Read' : null } |
  { 'ReadWrite' : null } |
  { 'ReadWriteManage' : null };
export interface RawQueryHttpRequest {
  'url' : string,
  'method' : string,
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
  'certificate_version' : [] | [number],
}
export interface RawQueryHttpResponse {
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
  'upgrade' : [] | [boolean],
  'streaming_strategy' : [] | [StreamingStrategy],
  'status_code' : number,
}
export interface RawUpdateHttpRequest {
  'url' : string,
  'method' : string,
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
}
export interface RawUpdateHttpResponse {
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
  'streaming_strategy' : [] | [StreamingStrategy],
  'status_code' : number,
}
export type Result = { 'ok' : string } |
  { 'err' : string };
export interface RevokePermission {
  'permission' : Permission,
  'of_principal' : Principal,
}
export interface RevokePermissionArguments {
  'user' : Principal,
  'entry' : [] | [Entry],
}
export interface SaveThumbnailArguments {
  'thumbnail' : { 'content' : Uint8Array | number[], 'contentType' : string },
  'entry' : Entry,
}
export interface SetAssetContentArguments {
  'key' : Key,
  'sha256' : [] | [Uint8Array | number[]],
  'chunk_ids' : Array<ChunkId>,
  'content_encoding' : string,
}
export interface SetAssetPropertiesArguments {
  'key' : Key,
  'headers' : [] | [[] | [Array<Header>]],
  'is_aliased' : [] | [[] | [boolean]],
  'allow_raw_access' : [] | [[] | [boolean]],
  'max_age' : [] | [[] | [bigint]],
}
export interface StoreArgs {
  'key' : Key,
  'content' : Uint8Array | number[],
  'sha256' : [] | [Uint8Array | number[]],
  'content_type' : string,
  'is_aliased' : [] | [boolean],
  'content_encoding' : string,
}
export type StreamingCallback = ActorMethod<
  [StreamingToken],
  StreamingCallbackResponse
>;
export interface StreamingCallbackResponse {
  'token' : [] | [StreamingToken],
  'body' : Uint8Array | number[],
}
export type StreamingStrategy = { 'Callback' : CallbackStreamingStrategy };
export type StreamingToken = Uint8Array | number[];
export type Time = bigint;
export type TransportKey = Uint8Array | number[];
export interface TreeNode {
  'name' : string,
  'children' : [] | [Array<TreeNode>],
}
export interface UnsetAssetContentArguments {
  'key' : Key,
  'content_encoding' : string,
}
export type UpdateArguments = {
    'File' : {
      'metadata' : {
        'sha256' : [] | [Uint8Array | number[]],
        'contentType' : string,
        'chunkIds' : Array<ChunkId>,
      },
      'path' : string,
    }
  } |
  {
    'Directory' : {
      'metadata' : { 'color' : [] | [DirectoryColor] },
      'path' : string,
    }
  };
export type VetKey = Uint8Array | number[];
export type VetKeyVerificationKey = Uint8Array | number[];
export interface _SERVICE extends EncryptedStorageCanister {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
