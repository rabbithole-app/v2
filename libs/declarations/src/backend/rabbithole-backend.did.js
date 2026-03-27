export const idlFactory = ({ IDL }) => {
  const GithubOptions = IDL.Record({
    'token' : IDL.Opt(IDL.Text),
    'owner' : IDL.Text,
    'repo' : IDL.Text,
    'apiUrl' : IDL.Text,
  });
  const InitArgs = IDL.Record({ 'github' : IDL.Opt(GithubOptions) });
  const Plan = IDL.Variant({
    'Pro' : IDL.Null,
    'Free' : IDL.Null,
    'License' : IDL.Null,
    'Trial' : IDL.Null,
  });
  const AddStorageError = IDL.Variant({
    'CanisterAlreadyUsed' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'InvalidWasm' : IDL.Text,
  });
  const Result_3 = IDL.Variant({ 'ok' : IDL.Nat, 'err' : AddStorageError });
  const UpdateInfo = IDL.Record({
    'currentWasmHash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'wasmUpdateAvailable' : IDL.Bool,
    'availableReleaseTag' : IDL.Opt(IDL.Text),
    'currentReleaseTag' : IDL.Opt(IDL.Text),
    'frontendUpdateAvailable' : IDL.Bool,
    'availableWasmHash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const SubscriptionCheckResult = IDL.Variant({
    'trial' : IDL.Record({ 'remainingBytes' : IDL.Nat }),
    'active' : IDL.Record({ 'plan' : Plan }),
    'expired' : IDL.Null,
    'free' : IDL.Null,
    'unknownCanister' : IDL.Null,
    'invalidWasm' : IDL.Null,
  });
  const CreateProfileArgs = IDL.Record({
    'username' : IDL.Text,
    'displayName' : IDL.Opt(IDL.Text),
    'avatarUrl' : IDL.Opt(IDL.Text),
  });
  const ReleaseSelector = IDL.Variant({
    'LatestPrerelease' : IDL.Null,
    'Version' : IDL.Text,
    'Latest' : IDL.Null,
    'LatestDraft' : IDL.Null,
  });
  const TargetCanister = IDL.Variant({
    'Existing' : IDL.Principal,
    'Create' : IDL.Record({
      'initialCycles' : IDL.Nat,
      'subnetId' : IDL.Opt(IDL.Principal),
    }),
  });
  const CreateStorageOptions = IDL.Record({
    'releaseSelector' : ReleaseSelector,
    'target' : TargetCanister,
    'initArg' : IDL.Vec(IDL.Nat8),
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
    'CanisterAlreadyUsed' : IDL.Record({ 'canisterId' : IDL.Principal }),
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
  const Result_2 = IDL.Variant({ 'ok' : IDL.Null, 'err' : CreateStorageError });
  const DeleteStorageError = IDL.Variant({
    'NotFailed' : IDL.Null,
    'NotFound' : IDL.Null,
    'NotOwner' : IDL.Null,
  });
  const Result_1 = IDL.Variant({ 'ok' : IDL.Null, 'err' : DeleteStorageError });
  const AmbassadorChain = IDL.Record({
    'l1' : IDL.Opt(IDL.Principal),
    'l2' : IDL.Opt(IDL.Principal),
  });
  const Time = IDL.Int;
  const TypedEvent = IDL.Variant({
    'trialStarted' : IDL.Record({ 'limitBytes' : IDL.Nat }),
    'subscriptionExpired' : IDL.Null,
    'subscriptionActivated' : IDL.Record({ 'plan' : Plan }),
    'updateAvailable' : IDL.Record({
      'releaseTag' : IDL.Text,
      'canisterId' : IDL.Principal,
    }),
    'lowCycles' : IDL.Record({
      'estimatedDaysLeft' : IDL.Nat,
      'severity' : IDL.Variant({ 'warning' : IDL.Null, 'critical' : IDL.Null }),
      'remaining' : IDL.Nat,
      'canisterId' : IDL.Principal,
    }),
  });
  const StoredNotification = IDL.Record({
    'id' : IDL.Nat,
    'createdAt' : Time,
    'read' : IDL.Bool,
    'event' : TypedEvent,
  });
  const NotificationsPage = IDL.Record({
    'data' : IDL.Vec(StoredNotification),
    'unreadCount' : IDL.Nat,
  });
  const Profile = IDL.Record({
    'id' : IDL.Principal,
    'referralCode' : IDL.Opt(IDL.Text),
    'username' : IDL.Text,
    'displayName' : IDL.Opt(IDL.Text),
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
    'sha256' : IDL.Opt(IDL.Vec(IDL.Nat8)),
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
  const Status = IDL.Variant({
    'Active' : IDL.Null,
    'Cancelled' : IDL.Null,
    'Expired' : IDL.Null,
  });
  const Subscription = IDL.Record({
    'status' : Status,
    'expiresAt' : IDL.Opt(Time),
    'activatedAt' : Time,
    'userId' : IDL.Principal,
    'createdAt' : Time,
    'plan' : Plan,
    'updatedAt' : Time,
    'trialUsedBytes' : IDL.Nat,
    'autoRenew' : IDL.Bool,
  });
  const User = IDL.Record({
    'id' : IDL.Principal,
    'inviter' : IDL.Opt(IDL.Principal),
    'createdAt' : Time,
    'updatedAt' : Time,
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
  const KnownWasmHash = IDL.Record({
    'hash' : IDL.Vec(IDL.Nat8),
    'releaseTag' : IDL.Text,
    'registeredAt' : Time,
  });
  const SortDirection = IDL.Variant({
    'Descending' : IDL.Null,
    'Ascending' : IDL.Null,
  });
  const ListOptions__1 = IDL.Record({
    'pagination' : IDL.Record({ 'offset' : IDL.Nat, 'limit' : IDL.Nat }),
    'count' : IDL.Bool,
    'sort' : IDL.Vec(IDL.Tuple(IDL.Text, SortDirection)),
    'filter' : IDL.Record({
      'id' : IDL.Opt(IDL.Vec(IDL.Principal)),
      'username' : IDL.Opt(IDL.Text),
      'displayName' : IDL.Opt(IDL.Text),
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
  const Progress = IDL.Record({ 'total' : IDL.Nat, 'processed' : IDL.Nat });
  const CreationStatus = IDL.Variant({
    'Failed' : IDL.Text,
    'UpdatingControllers' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'UpgradingWasm' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'CanisterCreated' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'RevokingInstallerPermission' : IDL.Record({
      'canisterId' : IDL.Principal,
    }),
    'CheckingAllowance' : IDL.Null,
    'UploadingFrontend' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'TransferringICP' : IDL.Record({ 'amount' : IDL.Nat }),
    'NotifyingCMC' : IDL.Record({ 'blockIndex' : IDL.Nat }),
    'UpgradingFrontend' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'Completed' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'InstallingWasm' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'Pending' : IDL.Null,
  });
  const StorageInfo = IDL.Record({
    'id' : IDL.Nat,
    'status' : CreationStatus,
    'completedAt' : IDL.Opt(Time),
    'createdAt' : Time,
    'lastUpgradeError' : IDL.Opt(IDL.Text),
    'releaseTag' : IDL.Text,
    'updateAvailable' : IDL.Opt(UpdateInfo),
    'canisterId' : IDL.Opt(IDL.Principal),
  });
  const ListOptions = IDL.Record({
    'pagination' : IDL.Record({ 'offset' : IDL.Nat, 'limit' : IDL.Nat }),
    'count' : IDL.Bool,
    'sort' : IDL.Vec(IDL.Tuple(IDL.Text, SortDirection)),
    'filter' : IDL.Record({
      'status' : IDL.Opt(IDL.Vec(Status)),
      'expiresAt' : IDL.Opt(
        IDL.Record({ 'max' : IDL.Opt(IDL.Int), 'min' : IDL.Opt(IDL.Int) })
      ),
      'userId' : IDL.Opt(IDL.Vec(IDL.Principal)),
      'plan' : IDL.Opt(IDL.Vec(Plan)),
    }),
  });
  const GetSubscriptionsResponse = IDL.Record({
    'total' : IDL.Opt(IDL.Nat),
    'data' : IDL.Vec(Subscription),
    'instructions' : IDL.Nat,
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
  const UpgradeStorageError = IDL.Variant({
    'AlreadyUpgrading' : IDL.Null,
    'NoUpdateAvailable' : IDL.Null,
    'NotFound' : IDL.Null,
    'NotOwner' : IDL.Null,
    'ReleaseNotReady' : IDL.Null,
    'NotCompleted' : IDL.Null,
  });
  const Result = IDL.Variant({ 'ok' : IDL.Null, 'err' : UpgradeStorageError });
  const Rabbithole = IDL.Service({
    'activateSubscription' : IDL.Func(
        [IDL.Principal, Plan, IDL.Opt(IDL.Int)],
        [],
        [],
      ),
    'activateTrial' : IDL.Func([], [], []),
    'addAdmin' : IDL.Func([IDL.Principal], [], []),
    'addStorage' : IDL.Func([IDL.Principal, IDL.Vec(IDL.Nat8)], [Result_3], []),
    'checkStorageUpdate' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(UpdateInfo)],
        ['query'],
      ),
    'checkSubscription' : IDL.Func(
        [IDL.Vec(IDL.Nat8)],
        [SubscriptionCheckResult],
        [],
      ),
    'createProfile' : IDL.Func([CreateProfileArgs], [IDL.Nat], []),
    'createStorage' : IDL.Func([CreateStorageOptions], [Result_2], []),
    'deleteProfile' : IDL.Func([], [], []),
    'deleteStorage' : IDL.Func([IDL.Nat], [Result_1], []),
    'getAmbassadorChainQuery' : IDL.Func([], [AmbassadorChain], ['query']),
    'getNotifications' : IDL.Func(
        [IDL.Opt(Time), IDL.Nat],
        [NotificationsPage],
        ['query'],
      ),
    'getProfile' : IDL.Func([], [IDL.Opt(Profile)], ['query']),
    'getReleasesFullStatus' : IDL.Func([], [ReleasesFullStatus], ['query']),
    'getSubscription' : IDL.Func([], [IDL.Opt(Subscription)], ['query']),
    'getUnreadCount' : IDL.Func([], [IDL.Nat], ['query']),
    'getUser' : IDL.Func([], [IDL.Opt(User)], ['query']),
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
    'isAdmin' : IDL.Func([IDL.Principal], [IDL.Bool], ['query']),
    'isKnownWasmHash' : IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Bool], ['query']),
    'isStorageDeployerRunning' : IDL.Func([], [IDL.Bool], ['query']),
    'listAdmins' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'listKnownWasmHashes' : IDL.Func([], [IDL.Vec(KnownWasmHash)], ['query']),
    'listProfiles' : IDL.Func(
        [ListOptions__1],
        [GetProfilesResponse],
        ['query'],
      ),
    'listStorages' : IDL.Func([], [IDL.Vec(StorageInfo)], ['query']),
    'listSubscriptions' : IDL.Func(
        [ListOptions],
        [GetSubscriptionsResponse],
        ['query'],
      ),
    'markAllNotificationsAsRead' : IDL.Func([], [], []),
    'markNotificationsAsRead' : IDL.Func([IDL.Vec(IDL.Nat)], [], []),
    'onStorageLowCycles' : IDL.Func(
        [
          IDL.Principal,
          IDL.Nat,
          IDL.Nat,
          IDL.Variant({ 'warning' : IDL.Null, 'critical' : IDL.Null }),
        ],
        [],
        [],
      ),
    'refreshReleases' : IDL.Func([], [], []),
    'register' : IDL.Func([IDL.Opt(IDL.Text)], [], []),
    'registerLatestWasmHash' : IDL.Func([], [], []),
    'removeAdmin' : IDL.Func([IDL.Principal], [], []),
    'reportTrialBytes' : IDL.Func([IDL.Nat], [], []),
    'saveAvatar' : IDL.Func([CreateProfileAvatarArgs], [IDL.Text], []),
    'startStorageDeployer' : IDL.Func([], [], []),
    'stopStorageDeployer' : IDL.Func([], [], []),
    'updateProfile' : IDL.Func([UpdateProfileArgs], [], []),
    'upgradeStorage' : IDL.Func([IDL.Principal], [Result], []),
    'usernameExists' : IDL.Func([IDL.Text], [IDL.Bool], ['query']),
  });
  return Rabbithole;
};
export const init = ({ IDL }) => {
  const GithubOptions = IDL.Record({
    'token' : IDL.Opt(IDL.Text),
    'owner' : IDL.Text,
    'repo' : IDL.Text,
    'apiUrl' : IDL.Text,
  });
  const InitArgs = IDL.Record({ 'github' : IDL.Opt(GithubOptions) });
  return [InitArgs];
};
