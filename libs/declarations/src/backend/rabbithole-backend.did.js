export const idlFactory = ({ IDL }) => {
  const ThresholdKeyName = IDL.Text;
  const TokenId = IDL.Variant({
    'ICP' : IDL.Null,
    'SOL' : IDL.Null,
    'SolUSDC' : IDL.Null,
    'SolUSDT' : IDL.Null,
    'ckETH' : IDL.Null,
    'ckUSDC' : IDL.Null,
    'ckUSDT' : IDL.Null,
    'BaseUSDC' : IDL.Null,
    'BaseUSDT' : IDL.Null,
    'BaseETH' : IDL.Null,
  });
  const AssetLocator = IDL.Variant({
    'Contract' : IDL.Text,
    'Mint' : IDL.Text,
    'Native' : IDL.Null,
  });
  const SupportedAsset = IDL.Record({
    'decimals' : IDL.Nat8,
    'tokenId' : TokenId,
    'locator' : AssetLocator,
    'symbol' : IDL.Text,
  });
  const EvmChainConfig = IDL.Record({
    'evmRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrls' : IDL.Vec(IDL.Text),
    'chainId' : IDL.Nat,
    'networkId' : IDL.Text,
  });
  const SolanaChainConfig = IDL.Record({
    'solRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrl' : IDL.Opt(IDL.Text),
    'networkId' : IDL.Text,
  });
  const ChainConfig = IDL.Variant({
    'Evm' : EvmChainConfig,
    'Solana' : SolanaChainConfig,
  });
  const GithubOptions = IDL.Record({
    'token' : IDL.Opt(IDL.Text),
    'owner' : IDL.Text,
    'repo' : IDL.Text,
    'apiUrl' : IDL.Text,
  });
  const InitArgs = IDL.Record({
    'thresholdKeyName' : ThresholdKeyName,
    'icpaySecretKey' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'chains' : IDL.Vec(ChainConfig),
    'github' : IDL.Opt(GithubOptions),
    'cashierCanisterId' : IDL.Principal,
  });
  const Plan = IDL.Variant({
    'Pro' : IDL.Null,
    'Free' : IDL.Null,
    'Trial' : IDL.Null,
  });
  const AddStorageError = IDL.Variant({
    'NotController' : IDL.Null,
    'CanisterAlreadyUsed' : IDL.Record({ 'canisterId' : IDL.Principal }),
    'InvalidWasm' : IDL.Text,
  });
  const Result_5 = IDL.Variant({ 'ok' : IDL.Nat, 'err' : AddStorageError });
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
  const DeleteStorageError = IDL.Variant({
    'NotFailed' : IDL.Null,
    'NotFound' : IDL.Null,
    'NotOwner' : IDL.Null,
  });
  const Result_4 = IDL.Variant({ 'ok' : IDL.Null, 'err' : DeleteStorageError });
  const AmbassadorChain = IDL.Record({
    'l1' : IDL.Opt(IDL.Principal),
    'l2' : IDL.Opt(IDL.Principal),
  });
  const DistributionLogOptions = IDL.Record({
    'offset' : IDL.Nat,
    'limit' : IDL.Nat,
  });
  const DistributionStatus = IDL.Variant({
    'completed' : IDL.Null,
    'partial' : IDL.Null,
  });
  const TransferRecord = IDL.Record({
    'tokenId' : TokenId,
    'solSignature' : IDL.Opt(IDL.Text),
    'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'recipient' : IDL.Principal,
    'solAddress' : IDL.Opt(IDL.Text),
    'error' : IDL.Opt(IDL.Text),
    'blockIndex' : IDL.Opt(IDL.Nat),
    'txHash' : IDL.Opt(IDL.Text),
    'amount' : IDL.Nat,
    'evmAddress' : IDL.Opt(IDL.Text),
  });
  const DistributionRecord = IDL.Record({
    'id' : IDL.Nat,
    'status' : DistributionStatus,
    'tokenId' : TokenId,
    'l1Amount' : IDL.Nat,
    'transfers' : IDL.Vec(TransferRecord),
    'l2Amount' : IDL.Nat,
    'ambassadorL1' : IDL.Opt(IDL.Principal),
    'ambassadorL2' : IDL.Opt(IDL.Principal),
    'totalAmount' : IDL.Nat,
    'paymentId' : IDL.Text,
    'timestamp' : IDL.Int,
    'payer' : IDL.Principal,
    'treasuryAmount' : IDL.Nat,
  });
  const Time = IDL.Int;
  const TypedEvent = IDL.Variant({
    'topUpCompleted' : IDL.Record({
      'canisterId' : IDL.Principal,
      'cyclesAmount' : IDL.Nat,
    }),
    'depositReceived' : IDL.Record({
      'tokenId' : IDL.Text,
      'amount' : IDL.Nat,
    }),
    'trialStarted' : IDL.Record({ 'limitBytes' : IDL.Nat }),
    'subscriptionExpired' : IDL.Null,
    'autoRenewFailed' : IDL.Record({ 'reason' : IDL.Text }),
    'topUpFailed' : IDL.Record({
      'canisterId' : IDL.Principal,
      'reason' : IDL.Text,
    }),
    'autoTopUpCompleted' : IDL.Record({
      'canisterId' : IDL.Principal,
      'cyclesAmount' : IDL.Nat,
    }),
    'subscriptionRenewed' : IDL.Record({
      'expiresAt' : IDL.Opt(IDL.Int),
      'plan' : IDL.Variant({
        'Pro' : IDL.Null,
        'Free' : IDL.Null,
        'Trial' : IDL.Null,
      }),
    }),
    'balanceLow' : IDL.Record({ 'requiredAmount' : IDL.Nat }),
    'paymentReceived' : IDL.Record({
      'tokenId' : IDL.Text,
      'amount' : IDL.Nat,
      'purpose' : IDL.Text,
    }),
    'subscriptionActivated' : IDL.Record({
      'plan' : IDL.Variant({
        'Pro' : IDL.Null,
        'Free' : IDL.Null,
        'Trial' : IDL.Null,
      }),
    }),
    'updateAvailable' : IDL.Record({
      'releaseTag' : IDL.Text,
      'canisterId' : IDL.Principal,
    }),
    'autoTopUpFailed' : IDL.Record({
      'canisterId' : IDL.Principal,
      'reason' : IDL.Text,
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
  const PendingRefund = IDL.Record({
    'tokenId' : TokenId,
    'userId' : IDL.Principal,
    'createdAt' : IDL.Int,
    'amount' : IDL.Nat,
    'reason' : IDL.Text,
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
  const UserSettings = IDL.Record({
    'spendingPriority' : IDL.Vec(TokenId),
    'topUpAmountCycles' : IDL.Nat,
    'autoRenew' : IDL.Bool,
    'autoTopUp' : IDL.Bool,
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
  const BalanceEntry = IDL.Record({ 'tokenId' : TokenId, 'balance' : IDL.Nat });
  const User = IDL.Record({
    'id' : IDL.Principal,
    'inviter' : IDL.Opt(IDL.Principal),
    'createdAt' : Time,
    'trialUsed' : IDL.Bool,
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
  const PaymentReceipt = IDL.Record({
    'tokenId' : TokenId,
    'paymentId' : IDL.Text,
    'amount' : IDL.Nat,
    'paidAt' : Time,
  });
  const License = IDL.Record({
    'receipt' : PaymentReceipt,
    'createdAt' : Time,
    'canisterId' : IDL.Opt(IDL.Principal),
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
    'CheckingBalance' : IDL.Null,
    'UploadingFrontend' : IDL.Record({
      'progress' : Progress,
      'canisterId' : IDL.Principal,
    }),
    'TransferringICP' : IDL.Record({ 'amount' : IDL.Nat }),
    'NotifyingCMC' : IDL.Record({ 'blockIndex' : IDL.Nat }),
    'ProcessingPayment' : IDL.Null,
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
  const StorageBackendType = IDL.Variant({
    'OnChain' : IDL.Null,
    'BlobStorage' : IDL.Null,
  });
  const PurchaseError = IDL.Variant({
    'ActivationFailed' : IDL.Text,
    'InvalidPlan' : IDL.Text,
    'ChargeFailed' : IDL.Text,
    'AlreadyActive' : IDL.Null,
    'InsufficientFunds' : IDL.Record({ 'required' : IDL.Nat }),
  });
  const Result_3 = IDL.Variant({ 'ok' : IDL.Null, 'err' : PurchaseError });
  const Result_2 = IDL.Variant({ 'ok' : IDL.Null, 'err' : IDL.Text });
  const CreateProfileAvatarArgs = IDL.Record({
    'content' : IDL.Vec(IDL.Nat8),
    'contentType' : IDL.Text,
    'filename' : IDL.Text,
  });
  const Result_1 = IDL.Variant({
    'ok' : IDL.Record({ 'cyclesAdded' : IDL.Nat }),
    'err' : IDL.Text,
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
  const WithdrawDestination = IDL.Variant({
    'IC' : IDL.Record({
      'owner' : IDL.Principal,
      'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    }),
    'EVM' : IDL.Record({ 'address' : IDL.Text }),
    'SOL' : IDL.Record({ 'address' : IDL.Text }),
  });
  const WithdrawArgs = IDL.Record({
    'to' : WithdrawDestination,
    'tokenId' : TokenId,
    'amount' : IDL.Nat,
  });
  const WithdrawError = IDL.Variant({
    'BelowMinimum' : IDL.Record({ 'minimum' : IDL.Nat }),
    'InsufficientBalance' : IDL.Record({ 'available' : IDL.Nat }),
    'TransferFailed' : IDL.Text,
    'EvmNotConfigured' : IDL.Null,
    'SolNotConfigured' : IDL.Null,
  });
  const WithdrawResult = IDL.Variant({ 'ok' : IDL.Nat, 'err' : WithdrawError });
  const Rabbithole = IDL.Service({
    'activateSubscription' : IDL.Func(
        [IDL.Principal, Plan, IDL.Opt(IDL.Int)],
        [],
        [],
      ),
    'activateTrial' : IDL.Func([], [], []),
    'addAdmin' : IDL.Func([IDL.Principal], [], []),
    'addStorage' : IDL.Func([IDL.Principal, IDL.Vec(IDL.Nat8)], [Result_5], []),
    'adminRegisterWasmHash' : IDL.Func([IDL.Vec(IDL.Nat8), IDL.Text], [], []),
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
    'createProfile' : IDL.Func([CreateProfileArgs], [IDL.Vec(IDL.Nat8)], []),
    'deleteProfile' : IDL.Func([], [], []),
    'deleteStorage' : IDL.Func([IDL.Nat], [Result_4], []),
    'flushPaymentQueue' : IDL.Func([], [], []),
    'getAmbassadorChainQuery' : IDL.Func([], [AmbassadorChain], ['query']),
    'getDistributionLog' : IDL.Func(
        [DistributionLogOptions],
        [IDL.Vec(DistributionRecord)],
        ['query'],
      ),
    'getEvmAddress' : IDL.Func([], [IDL.Opt(IDL.Text)], []),
    'getMyWalletAddresses' : IDL.Func(
        [],
        [
          IDL.Record({
            'icSubaccount' : IDL.Vec(IDL.Nat8),
            'solAddress' : IDL.Opt(IDL.Text),
            'evmAddress' : IDL.Opt(IDL.Text),
          }),
        ],
        ['query'],
      ),
    'getNotifications' : IDL.Func(
        [IDL.Opt(Time), IDL.Nat],
        [NotificationsPage],
        ['query'],
      ),
    'getPendingRefunds' : IDL.Func([], [IDL.Vec(PendingRefund)], ['query']),
    'getProfile' : IDL.Func([], [IDL.Opt(Profile)], ['query']),
    'getReleasesFullStatus' : IDL.Func([], [ReleasesFullStatus], ['query']),
    'getSettings' : IDL.Func([], [UserSettings], ['query']),
    'getSolAddress' : IDL.Func([], [IDL.Opt(IDL.Text)], []),
    'getSubscription' : IDL.Func([], [IDL.Opt(Subscription)], ['query']),
    'getTreasuryBalances' : IDL.Func([], [IDL.Vec(BalanceEntry)], []),
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
    'listLicenses' : IDL.Func([], [IDL.Vec(License)], ['query']),
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
          IDL.Nat,
          IDL.Nat,
          IDL.Variant({ 'warning' : IDL.Null, 'critical' : IDL.Null }),
        ],
        [],
        [],
      ),
    'processPendingRefunds' : IDL.Func([], [IDL.Nat], []),
    'purchaseLicenseAndCreateStorage' : IDL.Func(
        [
          StorageBackendType,
          IDL.Opt(
            IDL.Vec(IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text }))
          ),
        ],
        [Result_3],
        [],
      ),
    'purchaseSubscription' : IDL.Func([Plan], [Result_3], []),
    'queryExpiredSubscriptions' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Principal, Subscription))],
        ['query'],
      ),
    'queryExpiringSubscriptions' : IDL.Func(
        [IDL.Nat],
        [IDL.Vec(IDL.Tuple(IDL.Principal, Subscription))],
        ['query'],
      ),
    'refreshReleases' : IDL.Func([], [], []),
    'register' : IDL.Func([IDL.Opt(IDL.Text)], [], []),
    'registerLatestWasmHash' : IDL.Func([], [], []),
    'removeAdmin' : IDL.Func([IDL.Principal], [], []),
    'renewSubscription' : IDL.Func(
        [IDL.Principal, Plan, IDL.Opt(IDL.Int)],
        [],
        [],
      ),
    'reportTrialBytes' : IDL.Func([IDL.Nat], [], []),
    'retryStorageCreation' : IDL.Func([IDL.Nat], [Result_2], []),
    'saveAvatar' : IDL.Func([CreateProfileAvatarArgs], [IDL.Text], []),
    'startStorageDeployer' : IDL.Func([], [], []),
    'stopStorageDeployer' : IDL.Func([], [], []),
    'topUpFromBalance' : IDL.Func([IDL.Principal, IDL.Nat], [Result_1], []),
    'triggerAutoRenewals' : IDL.Func([], [], []),
    'triggerExpireOverdue' : IDL.Func([], [IDL.Vec(IDL.Principal)], []),
    'updateProfile' : IDL.Func([UpdateProfileArgs], [], []),
    'updateSettings' : IDL.Func([UserSettings], [], []),
    'upgradeStorage' : IDL.Func([IDL.Principal], [Result], []),
    'usernameExists' : IDL.Func([IDL.Text], [IDL.Bool], ['query']),
    'withdraw' : IDL.Func([WithdrawArgs], [WithdrawResult], []),
  });
  return Rabbithole;
};
export const init = ({ IDL }) => {
  const ThresholdKeyName = IDL.Text;
  const TokenId = IDL.Variant({
    'ICP' : IDL.Null,
    'SOL' : IDL.Null,
    'SolUSDC' : IDL.Null,
    'SolUSDT' : IDL.Null,
    'ckETH' : IDL.Null,
    'ckUSDC' : IDL.Null,
    'ckUSDT' : IDL.Null,
    'BaseUSDC' : IDL.Null,
    'BaseUSDT' : IDL.Null,
    'BaseETH' : IDL.Null,
  });
  const AssetLocator = IDL.Variant({
    'Contract' : IDL.Text,
    'Mint' : IDL.Text,
    'Native' : IDL.Null,
  });
  const SupportedAsset = IDL.Record({
    'decimals' : IDL.Nat8,
    'tokenId' : TokenId,
    'locator' : AssetLocator,
    'symbol' : IDL.Text,
  });
  const EvmChainConfig = IDL.Record({
    'evmRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrls' : IDL.Vec(IDL.Text),
    'chainId' : IDL.Nat,
    'networkId' : IDL.Text,
  });
  const SolanaChainConfig = IDL.Record({
    'solRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrl' : IDL.Opt(IDL.Text),
    'networkId' : IDL.Text,
  });
  const ChainConfig = IDL.Variant({
    'Evm' : EvmChainConfig,
    'Solana' : SolanaChainConfig,
  });
  const GithubOptions = IDL.Record({
    'token' : IDL.Opt(IDL.Text),
    'owner' : IDL.Text,
    'repo' : IDL.Text,
    'apiUrl' : IDL.Text,
  });
  const InitArgs = IDL.Record({
    'thresholdKeyName' : ThresholdKeyName,
    'icpaySecretKey' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'chains' : IDL.Vec(ChainConfig),
    'github' : IDL.Opt(GithubOptions),
    'cashierCanisterId' : IDL.Principal,
  });
  return [InitArgs];
};
