export const idlFactory = ({ IDL }) => {
  const CreateProfileArgs = IDL.Record({
    'username' : IDL.Text,
    'displayName' : IDL.Opt(IDL.Text),
    'inviter' : IDL.Opt(IDL.Principal),
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const ReleaseSelector = IDL.Variant({
    'LatestPrerelease' : IDL.Null,
    'Version' : IDL.Text,
    'Latest' : IDL.Null,
    'LatestDraft' : IDL.Null,
  });
  const CreateStorageOptions = IDL.Record({
    'initialCycles' : IDL.Nat,
    'subnetId' : IDL.Opt(IDL.Principal),
    'releaseSelector' : ReleaseSelector,
    'initArg' : IDL.Vec(IDL.Nat8),
    'canisterId' : IDL.Opt(IDL.Principal),
  });
  const BlockIndex = IDL.Nat64;
  const NotifyError = IDL.Variant({
    'Refunded' : IDL.Record({
      'block_index' : IDL.Opt(BlockIndex),
      'reason' : IDL.Text,
    }),
    'InvalidTransaction' : IDL.Text,
    'Other' : IDL.Record({
      'error_message' : IDL.Text,
      'error_code' : IDL.Nat64,
    }),
    'Processing' : IDL.Null,
    'TransactionTooOld' : BlockIndex,
  });
  const Icrc1Tokens = IDL.Nat;
  const Icrc1BlockIndex = IDL.Nat;
  const Icrc1Timestamp = IDL.Nat64;
  const TransferFromError = IDL.Variant({
    'GenericError' : IDL.Record({
      'message' : IDL.Text,
      'error_code' : IDL.Nat,
    }),
    'TemporarilyUnavailable' : IDL.Null,
    'InsufficientAllowance' : IDL.Record({ 'allowance' : Icrc1Tokens }),
    'BadBurn' : IDL.Record({ 'min_burn_amount' : Icrc1Tokens }),
    'Duplicate' : IDL.Record({ 'duplicate_of' : Icrc1BlockIndex }),
    'BadFee' : IDL.Record({ 'expected_fee' : Icrc1Tokens }),
    'CreatedInFuture' : IDL.Record({ 'ledger_time' : Icrc1Timestamp }),
    'TooOld' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'balance' : Icrc1Tokens }),
  });
  const CreateStorageError = IDL.Variant({
    'NotifyFailed' : NotifyError,
    'FrontendInstallFailed' : IDL.Text,
    'InsufficientAllowance' : IDL.Record({
      'available' : IDL.Nat,
      'required' : IDL.Nat,
    }),
    'AlreadyInProgress' : IDL.Null,
    'UpdateControllersFailed' : IDL.Text,
    'WasmInstallFailed' : IDL.Text,
    'ReleaseNotFound' : IDL.Null,
    'TransferFailed' : TransferFromError,
  });
  const Result = IDL.Variant({ 'ok' : IDL.Null, 'err' : CreateStorageError });
  const Time = IDL.Int;
  const Profile = IDL.Record({
    'id' : IDL.Principal,
    'username' : IDL.Text,
    'displayName' : IDL.Opt(IDL.Text),
    'inviter' : IDL.Opt(IDL.Principal),
    'createdAt' : Time,
    'updatedAt' : Time,
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const AssetDownloadStatus = IDL.Variant({
    'Error' : IDL.Text,
    'Downloading' : IDL.Record({
      'chunksCompleted' : IDL.Nat,
      'chunksError' : IDL.Nat,
      'chunksTotal' : IDL.Nat,
    }),
    'Completed' : IDL.Record({ 'size' : IDL.Nat }),
    'NotStarted' : IDL.Null,
  });
  const FileMetadata = IDL.Record({
    'key' : IDL.Text,
    'sha256' : IDL.Vec(IDL.Nat8),
    'contentType' : IDL.Text,
    'size' : IDL.Nat,
  });
  const ExtractionStatus = IDL.Variant({
    'Idle' : IDL.Null,
    'Complete' : IDL.Vec(FileMetadata),
    'Decoding' : IDL.Record({ 'total' : IDL.Nat, 'processed' : IDL.Nat }),
  });
  const AssetFullStatus = IDL.Record({
    'contentType' : IDL.Text,
    'name' : IDL.Text,
    'size' : IDL.Nat,
    'downloadStatus' : AssetDownloadStatus,
    'extractionStatus' : IDL.Opt(ExtractionStatus),
  });
  const ReleaseFullStatus = IDL.Record({
    'tagName' : IDL.Text,
    'isDownloaded' : IDL.Bool,
    'name' : IDL.Text,
    'createdAt' : Time,
    'assets' : IDL.Vec(AssetFullStatus),
    'publishedAt' : IDL.Opt(Time),
    'isDeploymentReady' : IDL.Bool,
    'draft' : IDL.Bool,
    'prerelease' : IDL.Bool,
  });
  const ReleasesFullStatus = IDL.Record({
    'defaultVersionKey' : IDL.Text,
    'releasesCount' : IDL.Nat,
    'pendingDownloads' : IDL.Nat,
    'hasDeploymentReadyRelease' : IDL.Bool,
    'hasDownloadedRelease' : IDL.Bool,
    'releases' : IDL.Vec(ReleaseFullStatus),
    'completedDownloads' : IDL.Nat,
  });
  const Progress = IDL.Record({ 'total' : IDL.Nat, 'processed' : IDL.Nat });
  const CreationStatus = IDL.Variant({
    'Failed' : IDL.Text,
    'UpdatingControllers' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'CanisterCreated' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'CheckingAllowance' : IDL.Null,
    'UploadingFrontend' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'TransferringICP' : IDL.Record({ 'amount' : IDL.Nat }),
    'NotifyingCMC' : IDL.Record({ 'blockIndex' : IDL.Nat }),
    'Completed' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'InstallingWasm' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'Pending' : IDL.Null,
  });
  const Header = IDL.Tuple(IDL.Text, IDL.Text);
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
  const SortDirection = IDL.Variant({
    'Descending' : IDL.Null,
    'Ascending' : IDL.Null,
  });
  const ListOptions = IDL.Record({
    'pagination' : IDL.Record({ 'offset' : IDL.Nat, 'limit' : IDL.Nat }),
    'count' : IDL.Bool,
    'sort' : IDL.Vec(IDL.Tuple(IDL.Text, SortDirection)),
    'filter' : IDL.Record({
      'id' : IDL.Opt(IDL.Vec(IDL.Principal)),
      'username' : IDL.Opt(IDL.Text),
      'displayName' : IDL.Opt(IDL.Text),
      'inviter' : IDL.Opt(IDL.Vec(IDL.Principal)),
      'createdAt' : IDL.Opt(
        IDL.Record({ 'max' : IDL.Opt(IDL.Int), 'min' : IDL.Opt(IDL.Int) })
      ),
      'avatarUrl' : IDL.Opt(IDL.Bool),
    }),
  });
  const GetProfilesResponse = IDL.Record({
    'total' : IDL.Opt(IDL.Nat),
    'data' : IDL.Vec(Profile),
    'instructions' : IDL.Nat,
  });
  const StorageCreationRecord = IDL.Record({
    'status' : CreationStatus,
    'completedAt' : IDL.Opt(Time),
    'owner' : IDL.Principal,
    'wasmHash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'createdAt' : Time,
    'releaseTag' : IDL.Text,
    'frontendHash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'initArg' : IDL.Vec(IDL.Nat8),
    'canisterId' : IDL.Opt(IDL.Principal),
  });
  const CreateProfileAvatarArgs = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'contentType' : IDL.Text,
    'filename' : IDL.Text,
  });
  const UpdateProfileArgs = IDL.Record({
    'displayName' : IDL.Opt(IDL.Text),
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const Rabbithole = IDL.Service({
    'addCanister' : IDL.Func([IDL.Principal], [], []),
    'createProfile' : IDL.Func([CreateProfileArgs], [IDL.Nat], []),
    'createStorage' : IDL.Func([CreateStorageOptions], [Result], []),
    'cyclesToE8s' : IDL.Func([IDL.Nat], [IDL.Nat], []),
    'deleteCanister' : IDL.Func([IDL.Principal], [], []),
    'deleteProfile' : IDL.Func([], [], []),
    'getProfile' : IDL.Func([], [IDL.Opt(Profile)], ['query']),
    'getReleasesFullStatus' : IDL.Func([], [ReleasesFullStatus], ['query']),
    'getStorageCreationStatus' : IDL.Func(
        [],
        [IDL.Opt(CreationStatus)],
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
    'isStorageDeployerRunning' : IDL.Func([], [IDL.Bool], ['query']),
    'listCanisters' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'listProfiles' : IDL.Func([ListOptions], [GetProfilesResponse], ['query']),
    'listStorages' : IDL.Func([], [IDL.Vec(StorageCreationRecord)], ['query']),
    'removeAvatar' : IDL.Func([IDL.Text], [], []),
    'saveAvatar' : IDL.Func([CreateProfileAvatarArgs], [IDL.Text], []),
    'startStorageDeployer' : IDL.Func([], [], []),
    'stopStorageDeployer' : IDL.Func([], [], []),
    'updateProfile' : IDL.Func([UpdateProfileArgs], [], []),
    'usernameExists' : IDL.Func([IDL.Text], [IDL.Bool], ['query']),
    'whoami' : IDL.Func([], [IDL.Text], ['query']),
  });
  return Rabbithole;
};
export const init = ({ IDL }) => { return []; };
