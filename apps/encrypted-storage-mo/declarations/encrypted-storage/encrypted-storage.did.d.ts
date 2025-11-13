import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type BatchId = bigint;
export interface ChunkContent { 'content' : Uint8Array | number[] }
export type ChunkId = bigint;
export interface CreateArguments { 'entry' : Entry, 'overwrite' : boolean }
export interface CreateBatchResponse { 'batchId' : BatchId }
export interface CreateChunkArguments {
  'content' : Uint8Array | number[],
  'batchId' : BatchId,
}
export interface CreateChunkResponse { 'chunkId' : bigint }
export interface DeleteArguments { 'recursive' : boolean, 'entry' : Entry }
export type DirectoryColor = { 'blue' : null } |
  { 'gray' : null } |
  { 'orange' : null } |
  { 'pink' : null } |
  { 'purple' : null } |
  { 'green' : null } |
  { 'yellow' : null };
export interface DirectoryMetadata { 'color' : [] | [DirectoryColor] }
export interface EncryptedStorageCanister {
  'clear' : ActorMethod<[], undefined>,
  'create' : ActorMethod<[CreateArguments], NodeDetails>,
  'createBatch' : ActorMethod<[CreateArguments], CreateBatchResponse>,
  'createChunk' : ActorMethod<[CreateChunkArguments], CreateChunkResponse>,
  'delete' : ActorMethod<[DeleteArguments], undefined>,
  'fsTree' : ActorMethod<[], Array<TreeNode>>,
  'getChunk' : ActorMethod<[GetChunkArguments], ChunkContent>,
  'getEncryptedVetkey' : ActorMethod<[KeyId, TransportKey], VetKey>,
  'getVetkeyVerificationKey' : ActorMethod<[], VetKeyVerificationKey>,
  'grantPermission' : ActorMethod<[GrantPermissionArguments], undefined>,
  'hasPermission' : ActorMethod<[HasPermissionArguments], boolean>,
  'list' : ActorMethod<[[] | [Entry]], Array<NodeDetails>>,
  'listPermitted' : ActorMethod<
    [[] | [Entry]],
    Array<[Principal, PermissionExt]>
  >,
  'move' : ActorMethod<[MoveArguments], undefined>,
  'revokePermission' : ActorMethod<[RevokePermissionArguments], undefined>,
  'setThumbnail' : ActorMethod<[SetThumbnailArguments], NodeDetails>,
  'showTree' : ActorMethod<[[] | [Entry]], string>,
  'update' : ActorMethod<[UpdateArguments], undefined>,
}
export type Entry = [{ 'File' : null } | { 'Directory' : null }, string];
export interface FileMetadata {
  'sha256' : [] | [Uint8Array | number[]],
  'thumbnailKey' : [] | [string],
  'contentType' : string,
  'size' : bigint,
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
export interface RevokePermissionArguments {
  'user' : Principal,
  'entry' : [] | [Entry],
}
export interface SetThumbnailArguments {
  'thumbnailKey' : [] | [string],
  'entry' : Entry,
}
export type Time = bigint;
export type TransportKey = Uint8Array | number[];
export interface TreeNode {
  'name' : string,
  'children' : [] | [Array<TreeNode>],
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
