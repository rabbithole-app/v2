export const idlFactory = ({ IDL }) => {
  const Permission = IDL.Variant({
    Read: IDL.Null,
    Write: IDL.Null,
    Admin: IDL.Null,
    Permissions: IDL.Null,
  });
  const SetPermissions = IDL.Vec(IDL.Tuple(Permission, IDL.Vec(IDL.Principal)));
  const UpgradeArgs = IDL.Record({
    set_permissions: IDL.Opt(SetPermissions),
  });
  const InitArgs = IDL.Record({});
  const CanisterArgs = IDL.Variant({
    Upgrade: UpgradeArgs,
    Init: InitArgs,
  });
  const CertifiedTree = IDL.Record({
    certificate: IDL.Vec(IDL.Nat8),
    tree: IDL.Vec(IDL.Nat8),
  });
  const ClearArguments = IDL.Record({});
  const BatchId = IDL.Nat;
  const Key = IDL.Text;
  const Header = IDL.Tuple(IDL.Text, IDL.Text);
  const SetAssetPropertiesArguments = IDL.Record({
    key: Key,
    headers: IDL.Opt(IDL.Opt(IDL.Vec(Header))),
    is_aliased: IDL.Opt(IDL.Opt(IDL.Bool)),
    allow_raw_access: IDL.Opt(IDL.Opt(IDL.Bool)),
    max_age: IDL.Opt(IDL.Opt(IDL.Nat64)),
  });
  const CreateAssetArguments = IDL.Record({
    key: Key,
    content_type: IDL.Text,
    headers: IDL.Opt(IDL.Vec(Header)),
    allow_raw_access: IDL.Opt(IDL.Bool),
    max_age: IDL.Opt(IDL.Nat64),
    enable_aliasing: IDL.Opt(IDL.Bool),
  });
  const UnsetAssetContentArguments = IDL.Record({
    key: Key,
    content_encoding: IDL.Text,
  });
  const DeleteAssetArguments = IDL.Record({ key: Key });
  const ChunkId = IDL.Nat;
  const SetAssetContentArguments = IDL.Record({
    key: Key,
    sha256: IDL.Opt(IDL.Vec(IDL.Nat8)),
    chunk_ids: IDL.Vec(ChunkId),
    content_encoding: IDL.Text,
  });
  const BatchOperationKind = IDL.Variant({
    SetAssetProperties: SetAssetPropertiesArguments,
    CreateAsset: CreateAssetArguments,
    UnsetAssetContent: UnsetAssetContentArguments,
    DeleteAsset: DeleteAssetArguments,
    SetAssetContent: SetAssetContentArguments,
    Clear: ClearArguments,
  });
  const CommitBatchArguments = IDL.Record({
    batch_id: BatchId,
    operations: IDL.Vec(BatchOperationKind),
  });
  const CommitProposedBatchArguments = IDL.Record({
    batch_id: BatchId,
    evidence: IDL.Vec(IDL.Nat8),
  });
  const ComputeEvidenceArguments = IDL.Record({
    batch_id: BatchId,
    max_iterations: IDL.Opt(IDL.Nat16),
  });
  const ConfigureArguments = IDL.Record({
    max_batches: IDL.Opt(IDL.Opt(IDL.Nat64)),
    max_bytes: IDL.Opt(IDL.Opt(IDL.Nat64)),
    max_chunks: IDL.Opt(IDL.Opt(IDL.Nat64)),
  });
  const CreateBatchResponse = IDL.Record({ batch_id: BatchId });
  const CreateChunkArguments = IDL.Record({
    content: IDL.Vec(IDL.Nat8),
    batch_id: BatchId,
  });
  const CreateChunkResponse = IDL.Record({ chunk_id: IDL.Nat });
  const CreateChunksArguments = IDL.Record({
    content: IDL.Vec(IDL.Vec(IDL.Nat8)),
    batch_id: BatchId,
  });
  const CreateChunksResponse = IDL.Record({ chunk_ids: IDL.Vec(ChunkId) });
  const DeleteBatchArguments = IDL.Record({ batch_id: BatchId });
  const GetArgs = IDL.Record({
    key: Key,
    accept_encodings: IDL.Vec(IDL.Text),
  });
  const EncodedAsset = IDL.Record({
    content: IDL.Vec(IDL.Nat8),
    sha256: IDL.Opt(IDL.Vec(IDL.Nat8)),
    content_type: IDL.Text,
    content_encoding: IDL.Text,
    total_length: IDL.Nat,
  });
  const GetChunkArgs = IDL.Record({
    key: Key,
    sha256: IDL.Opt(IDL.Vec(IDL.Nat8)),
    index: IDL.Nat,
    content_encoding: IDL.Text,
  });
  const ChunkContent = IDL.Record({ content: IDL.Vec(IDL.Nat8) });
  const ConfigurationResponse = IDL.Record({
    max_batches: IDL.Opt(IDL.Nat64),
    max_bytes: IDL.Opt(IDL.Nat64),
    max_chunks: IDL.Opt(IDL.Nat64),
  });
  const Entry = IDL.Variant({ Directory: IDL.Text, Asset: IDL.Text });
  const GrantPermission = IDL.Record({
    permission: Permission,
    to_principal: IDL.Principal,
    entry: IDL.Opt(Entry),
  });
  const HttpRequest = IDL.Record({
    url: IDL.Text,
    method: IDL.Text,
    body: IDL.Vec(IDL.Nat8),
    headers: IDL.Vec(Header),
    certificate_version: IDL.Opt(IDL.Nat16),
  });
  const StreamingToken = IDL.Vec(IDL.Nat8);
  const StreamingCallbackResponse = IDL.Record({
    token: IDL.Opt(StreamingToken),
    body: IDL.Vec(IDL.Nat8),
  });
  const StreamingCallback = IDL.Func(
    [StreamingToken],
    [StreamingCallbackResponse],
    ['query'],
  );
  const StreamingStrategy = IDL.Variant({
    Callback: IDL.Record({
      token: StreamingToken,
      callback: StreamingCallback,
    }),
  });
  const HttpResponse = IDL.Record({
    body: IDL.Vec(IDL.Nat8),
    headers: IDL.Vec(Header),
    upgrade: IDL.Opt(IDL.Bool),
    streaming_strategy: IDL.Opt(StreamingStrategy),
    status_code: IDL.Nat16,
  });
  const Time = IDL.Int;
  const AssetEncodingDetails = IDL.Record({
    modified: Time,
    sha256: IDL.Opt(IDL.Vec(IDL.Nat8)),
    length: IDL.Nat,
    content_encoding: IDL.Text,
  });
  const AssetDetails = IDL.Record({
    key: Key,
    encodings: IDL.Vec(AssetEncodingDetails),
    content_type: IDL.Text,
  });
  const ListPermitted = IDL.Record({
    permission: IDL.Opt(Permission),
    entry: IDL.Opt(Entry),
  });
  const PermissionInfo = IDL.Record({
    permission: Permission,
    principal: IDL.Principal,
  });
  const RevokePermission = IDL.Record({
    permission: Permission,
    of_principal: IDL.Principal,
    entry: IDL.Opt(Entry),
  });
  const Result = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  const StoreArgs = IDL.Record({
    key: Key,
    content: IDL.Vec(IDL.Nat8),
    sha256: IDL.Opt(IDL.Vec(IDL.Nat8)),
    content_type: IDL.Text,
    is_aliased: IDL.Opt(IDL.Bool),
    content_encoding: IDL.Text,
  });
  const AssetsCanister = IDL.Service({
    api_version: IDL.Func([], [IDL.Nat16], ['query']),
    certified_tree: IDL.Func([IDL.Record({})], [CertifiedTree], []),
    clear: IDL.Func([ClearArguments], [], []),
    commit_batch: IDL.Func([CommitBatchArguments], [], []),
    commit_proposed_batch: IDL.Func([CommitProposedBatchArguments], [], []),
    compute_evidence: IDL.Func(
      [ComputeEvidenceArguments],
      [IDL.Opt(IDL.Vec(IDL.Nat8))],
      [],
    ),
    configure: IDL.Func([ConfigureArguments], [], []),
    create_asset: IDL.Func([CreateAssetArguments], [], []),
    create_batch: IDL.Func([IDL.Record({})], [CreateBatchResponse], []),
    create_chunk: IDL.Func([CreateChunkArguments], [CreateChunkResponse], []),
    create_chunks: IDL.Func(
      [CreateChunksArguments],
      [CreateChunksResponse],
      [],
    ),
    delete_asset: IDL.Func([DeleteAssetArguments], [], []),
    delete_batch: IDL.Func([DeleteBatchArguments], [], []),
    get: IDL.Func([GetArgs], [EncodedAsset], ['query']),
    get_chunk: IDL.Func([GetChunkArgs], [ChunkContent], ['query']),
    get_configuration: IDL.Func([], [ConfigurationResponse], []),
    grant_permission: IDL.Func([GrantPermission], [], []),
    http_request: IDL.Func([HttpRequest], [HttpResponse], ['query']),
    http_request_streaming_callback: IDL.Func(
      [StreamingToken],
      [StreamingCallbackResponse],
      ['query'],
    ),
    list: IDL.Func([IDL.Record({})], [IDL.Vec(AssetDetails)], ['query']),
    list_permitted: IDL.Func([ListPermitted], [IDL.Vec(PermissionInfo)], []),
    propose_commit_batch: IDL.Func([CommitBatchArguments], [], []),
    revoke_permission: IDL.Func([RevokePermission], [], []),
    set_asset_content: IDL.Func([SetAssetContentArguments], [], []),
    set_asset_properties: IDL.Func([SetAssetPropertiesArguments], [], []),
    show_tree: IDL.Func([], [Result], ['query']),
    store: IDL.Func([StoreArgs], [], []),
    take_ownership: IDL.Func([], [], []),
    unset_asset_content: IDL.Func([UnsetAssetContentArguments], [], []),
    validate_commit_proposed_batch: IDL.Func(
      [CommitProposedBatchArguments],
      [Result],
      [],
    ),
    validate_configure: IDL.Func([ConfigureArguments], [Result], []),
    validate_grant_permission: IDL.Func([GrantPermission], [Result], []),
    validate_revoke_permission: IDL.Func([RevokePermission], [Result], []),
    validate_take_ownership: IDL.Func([], [Result], []),
  });
  return AssetsCanister;
};
export const init = ({ IDL }) => {
  const Permission = IDL.Variant({
    Read: IDL.Null,
    Write: IDL.Null,
    Admin: IDL.Null,
    Permissions: IDL.Null,
  });
  const SetPermissions = IDL.Vec(IDL.Tuple(Permission, IDL.Vec(IDL.Principal)));
  const UpgradeArgs = IDL.Record({
    set_permissions: IDL.Opt(SetPermissions),
  });
  const InitArgs = IDL.Record({});
  const CanisterArgs = IDL.Variant({
    Upgrade: UpgradeArgs,
    Init: InitArgs,
  });
  return [CanisterArgs];
};
