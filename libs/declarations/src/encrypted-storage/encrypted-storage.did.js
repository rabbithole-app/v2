export const idlFactory = ({ IDL }) => {
  const TreeNode = IDL.Rec();
  const EncryptedStorageInitArgs = IDL.Record({
    'vetKeyName' : IDL.Text,
    'owner' : IDL.Principal,
  });
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
  const ComputeEvidenceArguments = IDL.Record({
    'batch_id' : BatchId,
    'max_iterations' : IDL.Opt(IDL.Nat16),
  });
  const ConfigureArguments = IDL.Record({
    'max_batches' : IDL.Opt(IDL.Opt(IDL.Nat64)),
    'max_bytes' : IDL.Opt(IDL.Opt(IDL.Nat64)),
    'max_chunks' : IDL.Opt(IDL.Opt(IDL.Nat64)),
  });
  const Entry = IDL.Tuple(
    IDL.Variant({ 'File' : IDL.Null, 'Directory' : IDL.Null }),
    IDL.Text,
  );
  const CreateArguments = IDL.Record({
    'entry' : Entry,
    'overwrite' : IDL.Bool,
  });
  const Permission__1 = IDL.Variant({
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
    'permissions' : IDL.Vec(IDL.Tuple(IDL.Principal, Permission__1)),
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
  const CreateBatchArguments = IDL.Record({ 'entry' : Entry });
  const CreateBatchResponse__1 = IDL.Record({ 'batchId' : BatchId });
  const CreateChunkArguments__1 = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'batchId' : BatchId,
  });
  const CreateChunkResponse__1 = IDL.Record({ 'chunkId' : IDL.Nat });
  const CreateBatchResponse = IDL.Record({ 'batch_id' : BatchId });
  const CreateChunkArguments = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'batch_id' : BatchId,
  });
  const CreateChunkResponse = IDL.Record({ 'chunk_id' : IDL.Nat });
  const CreateChunksArguments = IDL.Record({
    'content' : IDL.Vec(IDL.Vec(IDL.Nat8)),
    'batch_id' : BatchId,
  });
  const CreateChunksResponse = IDL.Record({ 'chunk_ids' : IDL.Vec(ChunkId) });
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
  const TransportKey = IDL.Vec(IDL.Nat8);
  const VetKey = IDL.Vec(IDL.Nat8);
  const GetChunkArguments = IDL.Record({
    'chunkIndex' : IDL.Nat,
    'entry' : Entry,
  });
  const ChunkContent = IDL.Record({ 'content' : IDL.Vec(IDL.Nat8) });
  const VetKeyVerificationKey = IDL.Vec(IDL.Nat8);
  const GetChunkArgs = IDL.Record({
    'key' : Key,
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'index' : IDL.Nat,
    'content_encoding' : IDL.Text,
  });
  const ConfigurationResponse = IDL.Record({
    'max_batches' : IDL.Opt(IDL.Nat64),
    'max_bytes' : IDL.Opt(IDL.Nat64),
    'max_chunks' : IDL.Opt(IDL.Nat64),
  });
  const GrantPermissionArguments = IDL.Record({
    'permission' : Permission__1,
    'user' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const Permission = IDL.Variant({
    'Prepare' : IDL.Null,
    'Manage' : IDL.Null,
    'Commit' : IDL.Null,
  });
  const GrantPermission = IDL.Record({
    'permission' : Permission,
    'to_principal' : IDL.Principal,
  });
  const HasPermissionArguments = IDL.Record({
    'permission' : Permission__1,
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
  const AssetEncodingDetails = IDL.Record({
    'modified' : Time,
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'length' : IDL.Nat,
    'content_encoding' : IDL.Text,
  });
  const AssetDetails = IDL.Record({
    'key' : Key,
    'encodings' : IDL.Vec(AssetEncodingDetails),
    'content_type' : IDL.Text,
  });
  const PermissionExt = IDL.Variant({
    'Read' : IDL.Null,
    'ReadWrite' : IDL.Null,
    'ReadWriteManage' : IDL.Null,
    'Controller' : IDL.Null,
  });
  const ListPermitted = IDL.Record({ 'permission' : Permission });
  const MoveArguments = IDL.Record({
    'entry' : Entry,
    'target' : IDL.Opt(Entry),
  });
  const RevokePermissionArguments = IDL.Record({
    'user' : IDL.Principal,
    'entry' : IDL.Opt(Entry),
  });
  const RevokePermission = IDL.Record({
    'permission' : Permission,
    'of_principal' : IDL.Principal,
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
  const Result = IDL.Variant({ 'ok' : IDL.Text, 'err' : IDL.Text });
  const EncryptedStorageCanister = IDL.Service({
    'api_version' : IDL.Func([], [IDL.Nat16], ['query']),
    'certified_tree' : IDL.Func([IDL.Record({})], [CertifiedTree], []),
    'clear' : IDL.Func([ClearArguments], [], []),
    'clearStorage' : IDL.Func([], [], []),
    'commit_batch' : IDL.Func([CommitBatchArguments], [], []),
    'commit_proposed_batch' : IDL.Func([CommitProposedBatchArguments], [], []),
    'compute_evidence' : IDL.Func(
        [ComputeEvidenceArguments],
        [IDL.Opt(IDL.Vec(IDL.Nat8))],
        [],
      ),
    'configure' : IDL.Func([ConfigureArguments], [], []),
    'create' : IDL.Func([CreateArguments], [NodeDetails], []),
    'createStorageBatch' : IDL.Func(
        [CreateBatchArguments],
        [CreateBatchResponse__1],
        [],
      ),
    'createStorageChunk' : IDL.Func(
        [CreateChunkArguments__1],
        [CreateChunkResponse__1],
        [],
      ),
    'create_asset' : IDL.Func([CreateAssetArguments], [], []),
    'create_batch' : IDL.Func([IDL.Record({})], [CreateBatchResponse], []),
    'create_chunk' : IDL.Func(
        [CreateChunkArguments],
        [CreateChunkResponse],
        [],
      ),
    'create_chunks' : IDL.Func(
        [CreateChunksArguments],
        [CreateChunksResponse],
        [],
      ),
    'delete' : IDL.Func([DeleteArguments], [], []),
    'delete_asset' : IDL.Func([DeleteAssetArguments], [], []),
    'delete_batch' : IDL.Func([DeleteBatchArguments], [], []),
    'fsTree' : IDL.Func([], [IDL.Vec(TreeNode)], ['query']),
    'get' : IDL.Func([GetArgs], [EncodedAsset], ['query']),
    'getEncryptedVetkey' : IDL.Func([KeyId, TransportKey], [VetKey], []),
    'getStorageChunk' : IDL.Func(
        [GetChunkArguments],
        [ChunkContent],
        ['query'],
      ),
    'getVetkeyVerificationKey' : IDL.Func([], [VetKeyVerificationKey], []),
    'get_chunk' : IDL.Func([GetChunkArgs], [ChunkContent], ['query']),
    'get_configuration' : IDL.Func([], [ConfigurationResponse], []),
    'grantStoragePermission' : IDL.Func([GrantPermissionArguments], [], []),
    'grant_permission' : IDL.Func([GrantPermission], [], []),
    'hasStoragePermission' : IDL.Func(
        [HasPermissionArguments],
        [IDL.Bool],
        ['query'],
      ),
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
    'list' : IDL.Func([IDL.Record({})], [IDL.Vec(AssetDetails)], ['query']),
    'listPermitted' : IDL.Func(
        [IDL.Opt(Entry)],
        [IDL.Vec(IDL.Tuple(IDL.Principal, PermissionExt))],
        [],
      ),
    'listStorage' : IDL.Func(
        [IDL.Opt(Entry)],
        [IDL.Vec(NodeDetails)],
        ['query'],
      ),
    'list_permitted' : IDL.Func([ListPermitted], [IDL.Vec(IDL.Principal)], []),
    'move' : IDL.Func([MoveArguments], [], []),
    'propose_commit_batch' : IDL.Func([CommitBatchArguments], [], []),
    'revokeStoragePermission' : IDL.Func([RevokePermissionArguments], [], []),
    'revoke_permission' : IDL.Func([RevokePermission], [], []),
    'saveThumbnail' : IDL.Func([SaveThumbnailArguments], [NodeDetails], []),
    'set_asset_content' : IDL.Func([SetAssetContentArguments], [], []),
    'set_asset_properties' : IDL.Func([SetAssetPropertiesArguments], [], []),
    'showTree' : IDL.Func([IDL.Opt(Entry)], [IDL.Text], ['query']),
    'store' : IDL.Func([StoreArgs], [], []),
    'take_ownership' : IDL.Func([], [], []),
    'unset_asset_content' : IDL.Func([UnsetAssetContentArguments], [], []),
    'update' : IDL.Func([UpdateArguments], [], []),
    'validate_commit_proposed_batch' : IDL.Func(
        [CommitProposedBatchArguments],
        [Result],
        [],
      ),
    'validate_configure' : IDL.Func([ConfigureArguments], [Result], []),
    'validate_grant_permission' : IDL.Func([GrantPermission], [Result], []),
    'validate_revoke_permission' : IDL.Func([RevokePermission], [Result], []),
    'validate_take_ownership' : IDL.Func([], [Result], []),
  });
  return EncryptedStorageCanister;
};
export const init = ({ IDL }) => {
  const EncryptedStorageInitArgs = IDL.Record({
    'vetKeyName' : IDL.Text,
    'owner' : IDL.Principal,
  });
  return [EncryptedStorageInitArgs];
};
