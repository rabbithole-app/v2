import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type BatchId = bigint;
export interface ChunkContent { 'content' : Uint8Array | number[] }
export type ChunkId = bigint;
export interface CreateArguments { 'entry' : Entry }
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
  'getChunk' : ActorMethod<[GetChunkArguments], ChunkContent>,
  'getEncryptedVetkey' : ActorMethod<[KeyId, TransportKey], VetKey>,
  'getVetkeyVerificationKey' : ActorMethod<[], VetKeyVerificationKey>,
  'grantPermission' : ActorMethod<[GrantPermissionArguments], undefined>,
  'hasPermission' : ActorMethod<[HasPermissionArguments], boolean>,
  'list' : ActorMethod<[[] | [Entry]], Array<NodeDetails>>,
  'listPermitted' : ActorMethod<[[] | [Entry]], Array<[Principal, Permission]>>,
  'move' : ActorMethod<[MoveArguments], undefined>,
  'revokePermission' : ActorMethod<[RevokePermissionArguments], undefined>,
  'showTree' : ActorMethod<[[] | [Entry]], string>,
  'store' : ActorMethod<[StoreArguments], undefined>,
  'update' : ActorMethod<[UpdateArguments], undefined>,
}
export type Entry = [{ 'File' : null } | { 'Directory' : null }, string];
export interface FileMetadata {
  'sha256' : [] | [Uint8Array | number[]],
  'contentType' : string,
  'size' : bigint,
  'chunkIds' : Array<ChunkId>,
  'downloads' : bigint,
}
export interface GetChunkArguments { 'chunkIndex' : bigint, 'entry' : Entry }
export interface GrantPermissionArguments {
  'permission' : Permission,
  'principal' : Principal,
  'entry' : [] | [Entry],
}
export interface HasPermissionArguments {
  'permission' : Permission,
  'principal' : Principal,
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
export interface RevokePermissionArguments {
  'principal' : Principal,
  'entry' : [] | [Entry],
}
export type StoreArguments = {
    'File' : {
      'metadata' : {
        'content' : Uint8Array | number[],
        'sha256' : [] | [Uint8Array | number[]],
        'contentType' : string,
        'size' : bigint,
      },
      'path' : string,
    }
  };
export type Time = bigint;
export type TransportKey = Uint8Array | number[];
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
