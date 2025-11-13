import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

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
export interface CreateBatchResponse { 'batchId' : BatchId }
export interface CreateBatchResponse__1 { 'batch_id' : BatchId }
export interface CreateChunkArguments {
  'content' : Uint8Array | number[],
  'batchId' : BatchId,
}
export interface CreateChunkArguments__1 {
  'content' : Uint8Array | number[],
  'batch_id' : BatchId,
}
export interface CreateChunkResponse { 'chunkId' : bigint }
export interface CreateChunkResponse__1 { 'chunk_id' : bigint }
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
  'apiVersion' : ActorMethod<[], number>,
  'certifiedTree' : ActorMethod<[{}], CertifiedTree>,
  'clear' : ActorMethod<[], undefined>,
  'clearAssets' : ActorMethod<[ClearArguments], undefined>,
  'commitAssetBatch' : ActorMethod<[CommitBatchArguments], undefined>,
  'commitProposedAssetBatch' : ActorMethod<
    [CommitProposedBatchArguments],
    undefined
  >,
  'create' : ActorMethod<[CreateArguments], NodeDetails>,
  'createAsset' : ActorMethod<[CreateAssetArguments], undefined>,
  'createAssetBatch' : ActorMethod<[{}], CreateBatchResponse__1>,
  'createAssetChunk' : ActorMethod<
    [CreateChunkArguments__1],
    CreateChunkResponse__1
  >,
  'createAssetChunks' : ActorMethod<
    [CreateChunksArguments],
    CreateChunksResponse
  >,
  'createBatch' : ActorMethod<[CreateBatchArguments], CreateBatchResponse>,
  'createChunk' : ActorMethod<[CreateChunkArguments], CreateChunkResponse>,
  'delete' : ActorMethod<[DeleteArguments], undefined>,
  'deleteAsset' : ActorMethod<[DeleteAssetArguments], undefined>,
  'deleteAssetBatch' : ActorMethod<[DeleteBatchArguments], undefined>,
  'fsTree' : ActorMethod<[], Array<TreeNode>>,
  'getAsset' : ActorMethod<[GetArgs], EncodedAsset>,
  'getAssetChunk' : ActorMethod<[GetChunkArgs], ChunkContent>,
  'getChunk' : ActorMethod<[GetChunkArguments], ChunkContent>,
  'getEncryptedVetkey' : ActorMethod<[KeyId, TransportKey], VetKey>,
  'getVetkeyVerificationKey' : ActorMethod<[], VetKeyVerificationKey>,
  'grantPermission' : ActorMethod<[GrantPermissionArguments], undefined>,
  'hasPermission' : ActorMethod<[HasPermissionArguments], boolean>,
  'http_request' : ActorMethod<[RawQueryHttpRequest], RawQueryHttpResponse>,
  'http_request_streaming_callback' : ActorMethod<
    [StreamingToken],
    StreamingCallbackResponse
  >,
  'http_request_update' : ActorMethod<
    [RawUpdateHttpRequest],
    RawUpdateHttpResponse
  >,
  'list' : ActorMethod<[[] | [Entry]], Array<NodeDetails>>,
  'listPermitted' : ActorMethod<
    [[] | [Entry]],
    Array<[Principal, PermissionExt]>
  >,
  'move' : ActorMethod<[MoveArguments], undefined>,
  'proposeCommitAssetBatch' : ActorMethod<[CommitBatchArguments], undefined>,
  'revokePermission' : ActorMethod<[RevokePermissionArguments], undefined>,
  'saveThumbnail' : ActorMethod<[SaveThumbnailArguments], NodeDetails>,
  'setAssetContent' : ActorMethod<[SetAssetContentArguments], undefined>,
  'setAssetProperties' : ActorMethod<[SetAssetPropertiesArguments], undefined>,
  'showTree' : ActorMethod<[[] | [Entry]], string>,
  'storeAsset' : ActorMethod<[StoreArgs], undefined>,
  'unsetAssetContent' : ActorMethod<[UnsetAssetContentArguments], undefined>,
  'update' : ActorMethod<[UpdateArguments], undefined>,
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
export interface GrantPermissionArguments {
  'permission' : Permission,
  'user' : Principal,
  'entry' : [] | [Entry],
}
export interface HasPermissionArguments {
  'permission' : Permission,
  'user' : Principal,
  'entry' : [] | [Entry],
}
export type Header = [string, string];
export type Key = string;
export type KeyId = [Owner, KeyName];
export type KeyName = Uint8Array | number[];
export interface MoveArguments { 'entry' : Entry, 'target' : [] | [Entry] }
export interface NodeDetails {
  'id' : bigint,
  'permissions' : Array<[Principal, Permission]>,
  'modifiedAt' : [] | [Time],
  'metadata' : { 'File' : FileMetadata } |
    { 'Directory' : DirectoryMetadata },
  'name' : string,
  'createdAt' : Time,
  'parentId' : [] | [bigint],
  'keyId' : KeyId,
}
export type Owner = Principal;
export type Permission = { 'Read' : null } |
  { 'ReadWrite' : null } |
  { 'ReadWriteManage' : null };
export type PermissionExt = { 'Read' : null } |
  { 'ReadWrite' : null } |
  { 'ReadWriteManage' : null } |
  { 'Controller' : null };
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
