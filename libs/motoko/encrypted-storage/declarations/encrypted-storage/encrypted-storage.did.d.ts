import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type BatchId = bigint;
export interface ChunkContent { 'content' : Uint8Array | number[] }
export type ChunkId = bigint;
export interface CreateArguments {
  'createMode' : CreateMode,
  'entry' : Entry,
  'encryptionMode' : [] | [EncryptionMode],
}
export interface CreateBatchResponse { 'batchId' : BatchId }
export interface CreateChunkArguments {
  'content' : Uint8Array | number[],
  'batchId' : BatchId,
}
export interface CreateChunkResponse { 'chunkId' : bigint }
export type CreateMode = { 'GetOrCreate' : null } |
  { 'CreateNew' : null };
export interface DeleteArguments { 'recursive' : boolean, 'entry' : Entry }
export type DirectoryColor = { 'blue' : null } |
  { 'gray' : null } |
  { 'orange' : null } |
  { 'pink' : null } |
  { 'purple' : null } |
  { 'green' : null } |
  { 'yellow' : null };
export interface DirectoryMetadata {
  'color' : [] | [DirectoryColor],
  'defaultEncryptionMode' : EncryptionMode,
}
export interface EncryptedStorageCanister {
  'clear' : ActorMethod<[], undefined>,
  'create' : ActorMethod<[CreateArguments], NodeDetails>,
  'createBatch' : ActorMethod<[CreateArguments], CreateBatchResponse>,
  'createChunk' : ActorMethod<[CreateChunkArguments], CreateChunkResponse>,
  'delete' : ActorMethod<[DeleteArguments], undefined>,
  'fsTree' : ActorMethod<[], Array<TreeNode>>,
  'getChunk' : ActorMethod<[GetChunkArguments], ChunkContent>,
  'getEncryptedVetkey' : ActorMethod<[KeyId, TransportKey], VetKey>,
  /**
   * / Get canister module_hash via canister_status.
   * / Only accessible by canister controllers.
   */
  'getModuleHash' : ActorMethod<[], [] | [Uint8Array | number[]]>,
  'getVetkeyVerificationKey' : ActorMethod<[], VetKeyVerificationKey>,
  'grantPermission' : ActorMethod<[GrantPermissionArguments], undefined>,
  'hasPermission' : ActorMethod<[HasPermissionArguments], boolean>,
  'list' : ActorMethod<[[] | [Entry]], ListResponse>,
  'listPermitted' : ActorMethod<
    [[] | [Entry]],
    Array<[Principal, PermissionExt]>
  >,
  'listVersions' : ActorMethod<
    [ListVersionsArguments],
    Array<FileVersionDetails>
  >,
  'move' : ActorMethod<[MoveArguments], undefined>,
  'rename' : ActorMethod<[RenameArguments], undefined>,
  'restoreVersion' : ActorMethod<[RestoreVersionArguments], undefined>,
  'revokePermission' : ActorMethod<[RevokePermissionArguments], undefined>,
  'setThumbnail' : ActorMethod<[SetThumbnailArguments], NodeDetails>,
  'showTree' : ActorMethod<[[] | [Entry]], string>,
  'update' : ActorMethod<[UpdateArguments], undefined>,
}
export type EncryptionMode = { 'Encrypted' : null } |
  { 'Plaintext' : null };
export type Entry = [{ 'File' : null } | { 'Directory' : null }, string];
export interface FileMetadata {
  'storageBackend' : StorageBackend,
  'sha256' : [] | [Uint8Array | number[]],
  'thumbnailKey' : [] | [string],
  'contentType' : string,
  'size' : bigint,
  'currentVersion' : bigint,
  'encryptionMode' : EncryptionMode,
  'chunkCount' : bigint,
  'versionCount' : bigint,
}
export interface FileVersionDetails {
  'storageBackend' : StorageBackend,
  'sha256' : [] | [Uint8Array | number[]],
  'contentType' : string,
  'createdAt' : Time,
  'size' : bigint,
  'index' : bigint,
}
export interface GetChunkArguments {
  'chunkIndex' : bigint,
  'entry' : Entry,
  'version' : [] | [bigint],
}
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
export interface ListResponse {
  'entries' : Array<NodeDetails>,
  'directoryPermission' : [] | [Permission],
}
export interface ListVersionsArguments { 'entry' : Entry }
export interface MoveArguments { 'entry' : Entry, 'target' : [] | [Entry] }
export interface NodeDetails {
  'id' : bigint,
  'modifiedAt' : [] | [Time],
  'metadata' : { 'File' : FileMetadata } |
    { 'Directory' : DirectoryMetadata },
  'name' : string,
  'createdAt' : Time,
  'callerPermission' : [] | [Permission],
  'sharing' : [] | [SharingInfo],
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
export interface RenameArguments { 'entry' : Entry, 'newName' : string }
export interface RestoreVersionArguments { 'entry' : Entry, 'version' : bigint }
export interface RevokePermissionArguments {
  'user' : Principal,
  'entry' : [] | [Entry],
}
export interface SetThumbnailArguments {
  'thumbnailKey' : [] | [string],
  'entry' : Entry,
}
export interface SharingInfo { 'sharedWith' : bigint }
export type StorageBackend = { 'OnChain' : null } |
  { 'BlobStorage' : null };
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
