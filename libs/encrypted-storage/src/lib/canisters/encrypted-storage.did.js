export const idlFactory = ({ IDL }) => {
  const TreeNode = IDL.Rec();
  const CertifiedTree = IDL.Record({
    'certificate' : IDL.Vec(IDL.Nat8),
    'tree' : IDL.Vec(IDL.Nat8),
  });
  const ClearArguments = IDL.Record({});
  const BatchId = IDL.Nat;
  const Key = IDL.Text;
  const Header = IDL.Tuple(IDL.Text, IDL.Text);
  const SetAssetPropertiesArguments = IDL.Record({
    'key' : Key,
    'headers' : IDL.Opt(IDL.Opt(IDL.Vec(Header))),
    'is_aliased' : IDL.Opt(IDL.Opt(IDL.Bool)),
    'allow_raw_access' : IDL.Opt(IDL.Opt(IDL.Bool)),
    'max_age' : IDL.Opt(IDL.Opt(IDL.Nat64)),
  });
  const CreateAssetArguments = IDL.Record({
    'key' : Key,
    'content_type' : IDL.Text,
    'headers' : IDL.Opt(IDL.Vec(Header)),
    'allow_raw_access' : IDL.Opt(IDL.Bool),
    'max_age' : IDL.Opt(IDL.Nat64),
    'enable_aliasing' : IDL.Opt(IDL.Bool),
  });
  const UnsetAssetContentArguments = IDL.Record({
    'key' : Key,
    'content_encoding' : IDL.Text,
  });
  const DeleteAssetArguments = IDL.Record({ 'key' : Key });
  const ChunkId = IDL.Nat;
  const SetAssetContentArguments = IDL.Record({
    'key' : Key,
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'chunk_ids' : IDL.Vec(ChunkId),
    'content_encoding' : IDL.Text,
  });
  const BatchOperationKind = IDL.Variant({
    'SetAssetProperties' : SetAssetPropertiesArguments,
    'CreateAsset' : CreateAssetArguments,
    'UnsetAssetContent' : UnsetAssetContentArguments,
    'DeleteAsset' : DeleteAssetArguments,
    'SetAssetContent' : SetAssetContentArguments,
    'Clear' : ClearArguments,
  });
  const CommitBatchArguments = IDL.Record({
    'batch_id' : BatchId,
    'operations' : IDL.Vec(BatchOperationKind),
  });
  const CommitProposedBatchArguments = IDL.Record({
    'batch_id' : BatchId,
    'evidence' : IDL.Vec(IDL.Nat8),
  });
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
  const FileMetadata = IDL.Record({
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'thumbnailKey' : IDL.Opt(IDL.Text),
    'contentType' : IDL.Text,
    'size' : IDL.Nat,
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
  const CreateBatchResponse__1 = IDL.Record({ 'batch_id' : BatchId });
  const CreateChunkArguments__1 = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'batch_id' : BatchId,
  });
  const CreateChunkResponse__1 = IDL.Record({ 'chunk_id' : IDL.Nat });
  const CreateChunksArguments = IDL.Record({
    'content' : IDL.Vec(IDL.Vec(IDL.Nat8)),
    'batch_id' : BatchId,
  });
  const CreateChunksResponse = IDL.Record({ 'chunk_ids' : IDL.Vec(ChunkId) });
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
  const DeleteBatchArguments = IDL.Record({ 'batch_id' : BatchId });
  TreeNode.fill(
    IDL.Record({ 'name' : IDL.Text, 'children' : IDL.Opt(IDL.Vec(TreeNode)) })
  );
  const GetArgs = IDL.Record({
    'key' : Key,
    'accept_encodings' : IDL.Vec(IDL.Text),
  });
  const EncodedAsset = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'content_type' : IDL.Text,
    'content_encoding' : IDL.Text,
    'total_length' : IDL.Nat,
  });
  const GetChunkArgs = IDL.Record({
    'key' : Key,
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'index' : IDL.Nat,
    'content_encoding' : IDL.Text,
  });
  const ChunkContent = IDL.Record({ 'content' : IDL.Vec(IDL.Nat8) });
  const GetChunkArguments = IDL.Record({
    'chunkIndex' : IDL.Nat,
    'entry' : Entry,
  });
  const TransportKey = IDL.Vec(IDL.Nat8);
  const VetKey = IDL.Vec(IDL.Nat8);
  const VetKeyVerificationKey = IDL.Vec(IDL.Nat8);
  const GrantPermissionArguments = IDL.Record({
    'permission' : Permission,
    'user' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const HasPermissionArguments = IDL.Record({
    'permission' : Permission,
    'user' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const RawQueryHttpRequest = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'certificate_version' : IDL.Opt(IDL.Nat16),
  });
  const StreamingToken = IDL.Vec(IDL.Nat8);
  const StreamingCallbackResponse = IDL.Record({
    'token' : IDL.Opt(StreamingToken),
    'body' : IDL.Vec(IDL.Nat8),
  });
  const StreamingCallback = IDL.Func(
      [StreamingToken],
      [StreamingCallbackResponse],
      ['query'],
    );
  const CallbackStreamingStrategy = IDL.Record({
    'token' : StreamingToken,
    'callback' : StreamingCallback,
  });
  const StreamingStrategy = IDL.Variant({
    'Callback' : CallbackStreamingStrategy,
  });
  const RawQueryHttpResponse = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'upgrade' : IDL.Opt(IDL.Bool),
    'streaming_strategy' : IDL.Opt(StreamingStrategy),
    'status_code' : IDL.Nat16,
  });
  const RawUpdateHttpRequest = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
  });
  const RawUpdateHttpResponse = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(Header),
    'streaming_strategy' : IDL.Opt(StreamingStrategy),
    'status_code' : IDL.Nat16,
  });
  const PermissionExt = IDL.Variant({
    'Read' : IDL.Null,
    'ReadWrite' : IDL.Null,
    'ReadWriteManage' : IDL.Null,
    'Controller' : IDL.Null,
  });
  const MoveArguments = IDL.Record({
    'entry' : Entry,
    'target' : IDL.Opt(Entry),
  });
  const RevokePermissionArguments = IDL.Record({
    'user' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const SaveThumbnailArguments = IDL.Record({
    'thumbnail' : IDL.Record({
      'content' : IDL.Vec(IDL.Nat8),
      'contentType' : IDL.Text,
    }),
    'entry' : Entry,
  });
  const StoreArgs = IDL.Record({
    'key' : Key,
    'content' : IDL.Vec(IDL.Nat8),
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'content_type' : IDL.Text,
    'is_aliased' : IDL.Opt(IDL.Bool),
    'content_encoding' : IDL.Text,
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
    'apiVersion' : IDL.Func([], [IDL.Nat16], ['query']),
    'certifiedTree' : IDL.Func([IDL.Record({})], [CertifiedTree], []),
    'clear' : IDL.Func([], [], []),
    'clearAssets' : IDL.Func([ClearArguments], [], []),
    'commitAssetBatch' : IDL.Func([CommitBatchArguments], [], []),
    'commitProposedAssetBatch' : IDL.Func(
        [CommitProposedBatchArguments],
        [],
        [],
      ),
    'create' : IDL.Func([CreateArguments], [NodeDetails], []),
    'createAsset' : IDL.Func([CreateAssetArguments], [], []),
    'createAssetBatch' : IDL.Func(
        [IDL.Record({})],
        [CreateBatchResponse__1],
        [],
      ),
    'createAssetChunk' : IDL.Func(
        [CreateChunkArguments__1],
        [CreateChunkResponse__1],
        [],
      ),
    'createAssetChunks' : IDL.Func(
        [CreateChunksArguments],
        [CreateChunksResponse],
        [],
      ),
    'createBatch' : IDL.Func([CreateArguments], [CreateBatchResponse], []),
    'createChunk' : IDL.Func([CreateChunkArguments], [CreateChunkResponse], []),
    'delete' : IDL.Func([DeleteArguments], [], []),
    'deleteAsset' : IDL.Func([DeleteAssetArguments], [], []),
    'deleteAssetBatch' : IDL.Func([DeleteBatchArguments], [], []),
    'fsTree' : IDL.Func([], [IDL.Vec(TreeNode)], ['query']),
    'getAsset' : IDL.Func([GetArgs], [EncodedAsset], ['query']),
    'getAssetChunk' : IDL.Func([GetChunkArgs], [ChunkContent], ['query']),
    'getChunk' : IDL.Func([GetChunkArguments], [ChunkContent], ['query']),
    'getEncryptedVetkey' : IDL.Func([KeyId, TransportKey], [VetKey], []),
    'getVetkeyVerificationKey' : IDL.Func([], [VetKeyVerificationKey], []),
    'grantPermission' : IDL.Func([GrantPermissionArguments], [], []),
    'hasPermission' : IDL.Func([HasPermissionArguments], [IDL.Bool], ['query']),
    'http_request' : IDL.Func(
        [RawQueryHttpRequest],
        [RawQueryHttpResponse],
        ['query'],
      ),
    'http_request_streaming_callback' : IDL.Func(
        [StreamingToken],
        [StreamingCallbackResponse],
        ['query'],
      ),
    'http_request_update' : IDL.Func(
        [RawUpdateHttpRequest],
        [RawUpdateHttpResponse],
        [],
      ),
    'list' : IDL.Func([IDL.Opt(Entry)], [IDL.Vec(NodeDetails)], ['query']),
    'listPermitted' : IDL.Func(
        [IDL.Opt(Entry)],
        [IDL.Vec(IDL.Tuple(IDL.Principal, PermissionExt))],
        [],
      ),
    'move' : IDL.Func([MoveArguments], [], []),
    'proposeCommitAssetBatch' : IDL.Func([CommitBatchArguments], [], []),
    'revokePermission' : IDL.Func([RevokePermissionArguments], [], []),
    'saveThumbnail' : IDL.Func([SaveThumbnailArguments], [NodeDetails], []),
    'setAssetContent' : IDL.Func([SetAssetContentArguments], [], []),
    'setAssetProperties' : IDL.Func([SetAssetPropertiesArguments], [], []),
    'showTree' : IDL.Func([IDL.Opt(Entry)], [IDL.Text], ['query']),
    'storeAsset' : IDL.Func([StoreArgs], [], []),
    'unsetAssetContent' : IDL.Func([UnsetAssetContentArguments], [], []),
    'update' : IDL.Func([UpdateArguments], [], []),
  });
  return EncryptedStorageCanister;
};
export const init = ({ IDL }) => { return []; };
