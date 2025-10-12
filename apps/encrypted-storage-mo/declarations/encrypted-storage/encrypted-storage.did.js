export const idlFactory = ({ IDL }) => {
  const Entry = IDL.Tuple(
    IDL.Variant({ 'File' : IDL.Null, 'Directory' : IDL.Null }),
    IDL.Text,
  );
  const CreateArguments = IDL.Record({ 'entry' : Entry });
  const Permission = IDL.Variant({
    'Read' : IDL.Null,
    'ReadWrite' : IDL.Null,
    'ReadWriteManage' : IDL.Null,
  });
  const Time = IDL.Int;
  const ChunkId = IDL.Nat;
  const FileMetadata = IDL.Record({
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'contentType' : IDL.Text,
    'size' : IDL.Nat,
    'chunkIds' : IDL.Vec(ChunkId),
    'downloads' : IDL.Nat,
  });
  const DirectoryColor = IDL.Variant({
    'blue' : IDL.Null,
    'gray' : IDL.Null,
    'orange' : IDL.Null,
    'pink' : IDL.Null,
    'purple' : IDL.Null,
    'green' : IDL.Null,
    'yellow' : IDL.Null,
  });
  const DirectoryMetadata = IDL.Record({ 'color' : IDL.Opt(DirectoryColor) });
  const Owner = IDL.Principal;
  const KeyName = IDL.Vec(IDL.Nat8);
  const KeyId = IDL.Tuple(Owner, KeyName);
  const NodeDetails = IDL.Record({
    'id' : IDL.Nat64,
    'permissions' : IDL.Vec(IDL.Tuple(IDL.Principal, Permission)),
    'modifiedAt' : IDL.Opt(Time),
    'metadata' : IDL.Variant({
      'File' : FileMetadata,
      'Directory' : DirectoryMetadata,
    }),
    'name' : IDL.Text,
    'createdAt' : Time,
    'parentId' : IDL.Opt(IDL.Nat64),
    'keyId' : KeyId,
  });
  const BatchId = IDL.Nat;
  const CreateBatchResponse = IDL.Record({ 'batchId' : BatchId });
  const CreateChunkArguments = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'batchId' : BatchId,
  });
  const CreateChunkResponse = IDL.Record({ 'chunkId' : IDL.Nat });
  const DeleteArguments = IDL.Record({
    'recursive' : IDL.Bool,
    'entry' : Entry,
  });
  const GetChunkArguments = IDL.Record({
    'chunkIndex' : IDL.Nat,
    'entry' : Entry,
  });
  const ChunkContent = IDL.Record({ 'content' : IDL.Vec(IDL.Nat8) });
  const TransportKey = IDL.Vec(IDL.Nat8);
  const VetKey = IDL.Vec(IDL.Nat8);
  const VetKeyVerificationKey = IDL.Vec(IDL.Nat8);
  const GrantPermissionArguments = IDL.Record({
    'permission' : Permission,
    'principal' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const HasPermissionArguments = IDL.Record({
    'permission' : Permission,
    'principal' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const MoveArguments = IDL.Record({
    'entry' : Entry,
    'target' : IDL.Opt(Entry),
  });
  const RevokePermissionArguments = IDL.Record({
    'principal' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const StoreArguments = IDL.Variant({
    'File' : IDL.Record({
      'metadata' : IDL.Record({
        'content' : IDL.Vec(IDL.Nat8),
        'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
        'contentType' : IDL.Text,
        'size' : IDL.Nat,
      }),
      'path' : IDL.Text,
    }),
  });
  const UpdateArguments = IDL.Variant({
    'File' : IDL.Record({
      'metadata' : IDL.Record({
        'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
        'contentType' : IDL.Text,
        'chunkIds' : IDL.Vec(ChunkId),
      }),
      'path' : IDL.Text,
    }),
    'Directory' : IDL.Record({
      'metadata' : IDL.Record({ 'color' : IDL.Opt(DirectoryColor) }),
      'path' : IDL.Text,
    }),
  });
  const EncryptedStorageCanister = IDL.Service({
    'clear' : IDL.Func([], [], []),
    'create' : IDL.Func([CreateArguments], [NodeDetails], []),
    'createBatch' : IDL.Func([CreateArguments], [CreateBatchResponse], []),
    'createChunk' : IDL.Func([CreateChunkArguments], [CreateChunkResponse], []),
    'delete' : IDL.Func([DeleteArguments], [], []),
    'getChunk' : IDL.Func([GetChunkArguments], [ChunkContent], ['query']),
    'getEncryptedVetkey' : IDL.Func([KeyId, TransportKey], [VetKey], []),
    'getVetkeyVerificationKey' : IDL.Func([], [VetKeyVerificationKey], []),
    'grantPermission' : IDL.Func([GrantPermissionArguments], [], []),
    'hasPermission' : IDL.Func([HasPermissionArguments], [IDL.Bool], ['query']),
    'list' : IDL.Func([IDL.Opt(Entry)], [IDL.Vec(NodeDetails)], ['query']),
    'listPermitted' : IDL.Func(
        [IDL.Opt(Entry)],
        [IDL.Vec(IDL.Tuple(IDL.Principal, Permission))],
        ['query'],
      ),
    'move' : IDL.Func([MoveArguments], [], []),
    'revokePermission' : IDL.Func([RevokePermissionArguments], [], []),
    'showTree' : IDL.Func([IDL.Opt(Entry)], [IDL.Text], ['query']),
    'store' : IDL.Func([StoreArguments], [], []),
    'update' : IDL.Func([UpdateArguments], [], []),
  });
  return EncryptedStorageCanister;
};
export const init = ({ IDL }) => { return []; };
