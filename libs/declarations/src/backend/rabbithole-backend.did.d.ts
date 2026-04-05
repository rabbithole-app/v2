import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type AddStorageError = {
    'CanisterAlreadyUsed' : { 'canisterId' : Principal }
  } |
  { 'InvalidWasm' : string };
export interface AmbassadorChain {
  'l1' : [] | [Principal],
  'l2' : [] | [Principal],
}
export type AssetDownloadStatus = { 'Error' : string } |
  {
    'Downloading' : {
      'chunksCompleted' : bigint,
      'chunksError' : bigint,
      'chunksTotal' : bigint,
    }
  } |
  { 'Completed' : { 'size' : bigint } } |
  { 'NotStarted' : null };
export interface AssetFullStatus {
  'sha256' : [] | [Uint8Array | number[]],
  'contentType' : string,
  'name' : string,
  'size' : bigint,
  'downloadStatus' : AssetDownloadStatus,
  'extractionStatus' : [] | [ExtractionStatus],
}
export interface BalanceEntry { 'tokenId' : TokenId, 'balance' : bigint }
export type BlockIndex = bigint;
export interface CallbackStreamingStrategy {
  'token' : StreamingToken,
  'callback' : [Principal, string],
}
export interface CreateProfileArgs {
  'username' : string,
  'displayName' : [] | [string],
  'avatarUrl' : [] | [string],
}
export interface CreateProfileAvatarArgs {
  'content' : Uint8Array | number[],
  'contentType' : string,
  'filename' : string,
}
export type CreateStorageError = { 'NotifyFailed' : NotifyError } |
  { 'FrontendInstallFailed' : string } |
  { 'CanisterAlreadyUsed' : { 'canisterId' : Principal } } |
  { 'InsufficientAllowance' : { 'available' : bigint, 'required' : bigint } } |
  { 'AlreadyInProgress' : null } |
  { 'UpdateControllersFailed' : string } |
  { 'WasmInstallFailed' : string } |
  { 'ReleaseNotFound' : null } |
  { 'TransferFailed' : TransferFromError };
export interface CreateStorageOptions {
  'releaseSelector' : ReleaseSelector,
  'target' : TargetCanister,
  'initArg' : Uint8Array | number[],
}
export type CreationStatus = { 'Failed' : string } |
  { 'UpdatingControllers' : { 'canisterId' : Principal } } |
  { 'UpgradingWasm' : { 'progress' : Progress, 'canisterId' : Principal } } |
  { 'CanisterCreated' : { 'canisterId' : Principal } } |
  { 'RevokingInstallerPermission' : { 'canisterId' : Principal } } |
  { 'CheckingAllowance' : null } |
  {
    'UploadingFrontend' : { 'progress' : Progress, 'canisterId' : Principal }
  } |
  { 'TransferringICP' : { 'amount' : bigint } } |
  { 'NotifyingCMC' : { 'blockIndex' : bigint } } |
  {
    'UpgradingFrontend' : { 'progress' : Progress, 'canisterId' : Principal }
  } |
  { 'Completed' : { 'canisterId' : Principal } } |
  { 'InstallingWasm' : { 'progress' : Progress, 'canisterId' : Principal } } |
  { 'Pending' : null };
export type DeleteStorageError = { 'NotFailed' : null } |
  { 'NotFound' : null } |
  { 'NotOwner' : null };
export interface DistributionLogOptions { 'offset' : bigint, 'limit' : bigint }
export interface DistributionRecord {
  'id' : bigint,
  'status' : DistributionStatus,
  'tokenId' : TokenId,
  'l1Amount' : bigint,
  'transfers' : Array<TransferRecord>,
  'l2Amount' : bigint,
  'ambassadorL1' : [] | [Principal],
  'ambassadorL2' : [] | [Principal],
  'totalAmount' : bigint,
  'paymentId' : string,
  'timestamp' : bigint,
  'payer' : Principal,
  'treasuryAmount' : bigint,
}
export type DistributionStatus = { 'completed' : null } |
  { 'partial' : null };
export interface EvmConfig {
  'evmRpcCanisterId' : string,
  'rpcUrls' : Array<string>,
  'usdcContract' : string,
  'usdtContract' : string,
  'ecdsaKeyName' : string,
  'chainId' : bigint,
}
export type ExtractionStatus = { 'Idle' : null } |
  { 'Complete' : Array<FileMetadata> } |
  { 'Decoding' : { 'total' : bigint, 'processed' : bigint } };
export interface FileMetadata {
  'key' : string,
  'sha256' : Uint8Array | number[],
  'contentType' : string,
  'size' : bigint,
}
export interface GetProfilesResponse {
  'total' : [] | [bigint],
  'data' : Array<Profile>,
  'instructions' : bigint,
}
export interface GetSubscriptionsResponse {
  'total' : [] | [bigint],
  'data' : Array<Subscription>,
  'instructions' : bigint,
}
export interface GithubOptions {
  'token' : [] | [string],
  'owner' : string,
  'repo' : string,
  'apiUrl' : string,
}
export type Header = [string, string];
export type Icrc1BlockIndex = bigint;
export type Icrc1Timestamp = bigint;
export type Icrc1Tokens = bigint;
export interface InitArgs {
  'solConfig' : [] | [SolConfig],
  'vetKeyName' : string,
  'evmConfig' : [] | [EvmConfig],
  'icpaySecretKey' : [] | [Uint8Array | number[]],
  'github' : [] | [GithubOptions],
  'cashierCanisterId' : Principal,
}
export interface KnownWasmHash {
  'hash' : Uint8Array | number[],
  'releaseTag' : string,
  'registeredAt' : Time,
}
export interface ListOptions {
  'pagination' : { 'offset' : bigint, 'limit' : bigint },
  'count' : boolean,
  'sort' : Array<[string, SortDirection]>,
  'filter' : {
    'status' : [] | [Array<Status>],
    'expiresAt' : [] | [{ 'max' : [] | [bigint], 'min' : [] | [bigint] }],
    'userId' : [] | [Array<Principal>],
    'plan' : [] | [Array<Plan>],
  },
}
export interface ListOptions__1 {
  'pagination' : { 'offset' : bigint, 'limit' : bigint },
  'count' : boolean,
  'sort' : Array<[string, SortDirection]>,
  'filter' : {
    'id' : [] | [Array<Principal>],
    'username' : [] | [string],
    'displayName' : [] | [string],
    'createdAt' : [] | [{ 'max' : [] | [bigint], 'min' : [] | [bigint] }],
    'avatarUrl' : [] | [boolean],
  },
}
export interface NotificationsPage {
  'data' : Array<StoredNotification>,
  'unreadCount' : bigint,
}
export type NotifyError = {
    'Refunded' : { 'block_index' : [] | [BlockIndex], 'reason' : string }
  } |
  { 'InvalidTransaction' : string } |
  { 'Other' : { 'error_message' : string, 'error_code' : bigint } } |
  { 'Processing' : null } |
  { 'TransactionTooOld' : BlockIndex };
export interface PendingRefund {
  'tokenId' : TokenId,
  'userId' : Principal,
  'createdAt' : bigint,
  'amount' : bigint,
  'reason' : string,
}
export type Plan = { 'Pro' : null } |
  { 'Free' : null } |
  { 'License' : null } |
  { 'Trial' : null };
export interface Profile {
  'id' : Principal,
  'referralCode' : [] | [string],
  'username' : string,
  'displayName' : [] | [string],
  'createdAt' : Time,
  'updatedAt' : Time,
  'avatarUrl' : [] | [string],
}
export interface Progress { 'total' : bigint, 'processed' : bigint }
export type PurchaseError = { 'ActivationFailed' : string } |
  { 'InvalidPlan' : string } |
  { 'ChargeFailed' : string } |
  { 'AlreadyActive' : null } |
  { 'InsufficientFunds' : { 'required' : bigint } };
export interface Rabbithole {
  'activateSubscription' : ActorMethod<
    [Principal, Plan, [] | [bigint]],
    undefined
  >,
  'activateTrial' : ActorMethod<[], undefined>,
  'addAdmin' : ActorMethod<[Principal], undefined>,
  'addStorage' : ActorMethod<[Principal, Uint8Array | number[]], Result_5>,
  'adminRegisterWasmHash' : ActorMethod<
    [Uint8Array | number[], string],
    undefined
  >,
  'checkStorageUpdate' : ActorMethod<[Principal], [] | [UpdateInfo]>,
  'checkSubscription' : ActorMethod<
    [Uint8Array | number[]],
    SubscriptionCheckResult
  >,
  'createProfile' : ActorMethod<[CreateProfileArgs], Uint8Array | number[]>,
  'createStorage' : ActorMethod<[CreateStorageOptions], Result_4>,
  'deleteProfile' : ActorMethod<[], undefined>,
  'deleteStorage' : ActorMethod<[bigint], Result_3>,
  'flushPaymentQueue' : ActorMethod<[], undefined>,
  'getAmbassadorChainQuery' : ActorMethod<[], AmbassadorChain>,
  'getDistributionLog' : ActorMethod<
    [DistributionLogOptions],
    Array<DistributionRecord>
  >,
  'getEvmAddress' : ActorMethod<[], [] | [string]>,
  'getMyWalletAddresses' : ActorMethod<
    [],
    {
      'icSubaccount' : Uint8Array | number[],
      'solAddress' : [] | [string],
      'evmAddress' : [] | [string],
    }
  >,
  'getNotifications' : ActorMethod<[[] | [Time], bigint], NotificationsPage>,
  'getPendingRefunds' : ActorMethod<[], Array<PendingRefund>>,
  'getProfile' : ActorMethod<[], [] | [Profile]>,
  'getReleasesFullStatus' : ActorMethod<[], ReleasesFullStatus>,
  'getSettings' : ActorMethod<[], UserSettings>,
  'getSolAddress' : ActorMethod<[], [] | [string]>,
  'getSubscription' : ActorMethod<[], [] | [Subscription]>,
  'getTreasuryBalances' : ActorMethod<[], Array<BalanceEntry>>,
  'getUnreadCount' : ActorMethod<[], bigint>,
  'getUser' : ActorMethod<[], [] | [User]>,
  'http_request' : ActorMethod<[RawQueryHttpRequest], RawQueryHttpResponse>,
  'http_request_streaming_callback' : ActorMethod<
    [StreamingToken],
    StreamingCallbackResponse
  >,
  'http_request_update' : ActorMethod<
    [RawUpdateHttpRequest],
    RawUpdateHttpResponse
  >,
  'isAdmin' : ActorMethod<[Principal], boolean>,
  'isKnownWasmHash' : ActorMethod<[Uint8Array | number[]], boolean>,
  'isStorageDeployerRunning' : ActorMethod<[], boolean>,
  'listAdmins' : ActorMethod<[], Array<Principal>>,
  'listKnownWasmHashes' : ActorMethod<[], Array<KnownWasmHash>>,
  'listProfiles' : ActorMethod<[ListOptions__1], GetProfilesResponse>,
  'listStorages' : ActorMethod<[], Array<StorageInfo>>,
  'listSubscriptions' : ActorMethod<[ListOptions], GetSubscriptionsResponse>,
  'markAllNotificationsAsRead' : ActorMethod<[], undefined>,
  'markNotificationsAsRead' : ActorMethod<[Array<bigint>], undefined>,
  'onStorageLowCycles' : ActorMethod<
    [bigint, bigint, { 'warning' : null } | { 'critical' : null }],
    undefined
  >,
  'processPendingRefunds' : ActorMethod<[], bigint>,
  'purchaseSubscription' : ActorMethod<[Plan], Result_2>,
  'refreshReleases' : ActorMethod<[], undefined>,
  'register' : ActorMethod<[[] | [string]], undefined>,
  /**
   * / Register the latest downloaded WASM hash as known.
   */
  'registerLatestWasmHash' : ActorMethod<[], undefined>,
  'removeAdmin' : ActorMethod<[Principal], undefined>,
  'reportTrialBytes' : ActorMethod<[bigint], undefined>,
  'saveAvatar' : ActorMethod<[CreateProfileAvatarArgs], string>,
  'startStorageDeployer' : ActorMethod<[], undefined>,
  'stopStorageDeployer' : ActorMethod<[], undefined>,
  'topUpFromBalance' : ActorMethod<[Principal, bigint], Result_1>,
  'triggerAutoRenewals' : ActorMethod<[], undefined>,
  'updateProfile' : ActorMethod<[UpdateProfileArgs], undefined>,
  'updateSettings' : ActorMethod<[UserSettings], undefined>,
  'upgradeStorage' : ActorMethod<[Principal], Result>,
  'usernameExists' : ActorMethod<[string], boolean>,
  'withdraw' : ActorMethod<[WithdrawArgs], WithdrawResult>,
}
export interface RawQueryHttpRequest {
  'url' : string,
  'method' : string,
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
  'certificate_version' : [] | [number],
}
export interface RawQueryHttpResponse {
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
  'upgrade' : [] | [boolean],
  'streaming_strategy' : [] | [StreamingStrategy],
  'status_code' : number,
}
export interface RawUpdateHttpRequest {
  'url' : string,
  'method' : string,
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
}
export interface RawUpdateHttpResponse {
  'body' : Uint8Array | number[],
  'headers' : Array<Header>,
  'streaming_strategy' : [] | [StreamingStrategy],
  'status_code' : number,
}
export interface ReleaseFullStatus {
  'tagName' : string,
  'isDownloaded' : boolean,
  'name' : string,
  'createdAt' : Time,
  'assets' : Array<AssetFullStatus>,
  'publishedAt' : [] | [Time],
  'isDeploymentReady' : boolean,
  'draft' : boolean,
  'prerelease' : boolean,
}
export type ReleaseSelector = { 'LatestPrerelease' : null } |
  { 'Version' : string } |
  { 'Latest' : null } |
  { 'LatestDraft' : null };
export interface ReleasesFullStatus {
  'defaultVersionKey' : string,
  'releasesCount' : bigint,
  'pendingDownloads' : bigint,
  'hasDeploymentReadyRelease' : boolean,
  'hasDownloadedRelease' : boolean,
  'releases' : Array<ReleaseFullStatus>,
  'completedDownloads' : bigint,
}
export type Result = { 'ok' : null } |
  { 'err' : UpgradeStorageError };
export type Result_1 = { 'ok' : { 'cyclesAdded' : bigint } } |
  { 'err' : string };
export type Result_2 = { 'ok' : null } |
  { 'err' : PurchaseError };
export type Result_3 = { 'ok' : null } |
  { 'err' : DeleteStorageError };
export type Result_4 = { 'ok' : null } |
  { 'err' : CreateStorageError };
export type Result_5 = { 'ok' : bigint } |
  { 'err' : AddStorageError };
export interface SolConfig {
  'usdcMint' : string,
  'solRpcCanisterId' : string,
  'rpcUrl' : [] | [string],
  'schnorrKeyName' : string,
  'usdtMint' : string,
}
export type SortDirection = { 'Descending' : null } |
  { 'Ascending' : null };
export type Status = { 'Active' : null } |
  { 'Cancelled' : null } |
  { 'Expired' : null };
export interface StorageInfo {
  'id' : bigint,
  'status' : CreationStatus,
  'completedAt' : [] | [Time],
  'createdAt' : Time,
  'lastUpgradeError' : [] | [string],
  'releaseTag' : string,
  'updateAvailable' : [] | [UpdateInfo],
  'canisterId' : [] | [Principal],
}
export interface StoredNotification {
  'id' : bigint,
  'createdAt' : Time,
  'read' : boolean,
  'event' : TypedEvent,
}
export type StreamingCallback = ActorMethod<
  [StreamingToken],
  StreamingCallbackResponse
>;
export interface StreamingCallbackResponse {
  'token' : [] | [StreamingToken],
  'body' : Uint8Array | number[],
}
export type StreamingStrategy = { 'Callback' : CallbackStreamingStrategy };
export type StreamingToken = Uint8Array | number[];
export interface Subscription {
  'status' : Status,
  'expiresAt' : [] | [Time],
  'activatedAt' : Time,
  'userId' : Principal,
  'createdAt' : Time,
  'plan' : Plan,
  'updatedAt' : Time,
  'trialUsedBytes' : bigint,
  'autoRenew' : boolean,
}
export type SubscriptionCheckResult = {
    'trial' : { 'remainingBytes' : bigint }
  } |
  { 'active' : { 'plan' : Plan } } |
  { 'expired' : null } |
  { 'free' : null } |
  { 'unknownCanister' : null } |
  { 'invalidWasm' : null };
export type TargetCanister = { 'Existing' : Principal } |
  { 'Create' : { 'initialCycles' : bigint, 'subnetId' : [] | [Principal] } };
export type Time = bigint;
export type TokenId = { 'ICP' : null } |
  { 'SOL' : null } |
  { 'SolUSDC' : null } |
  { 'SolUSDT' : null } |
  { 'ckETH' : null } |
  { 'ckUSDC' : null } |
  { 'ckUSDT' : null } |
  { 'BaseUSDC' : null } |
  { 'BaseUSDT' : null } |
  { 'BaseETH' : null };
export type TransferFromError = {
    'GenericError' : { 'message' : string, 'error_code' : bigint }
  } |
  { 'TemporarilyUnavailable' : null } |
  { 'InsufficientAllowance' : { 'allowance' : Icrc1Tokens } } |
  { 'BadBurn' : { 'min_burn_amount' : Icrc1Tokens } } |
  { 'Duplicate' : { 'duplicate_of' : Icrc1BlockIndex } } |
  { 'BadFee' : { 'expected_fee' : Icrc1Tokens } } |
  { 'CreatedInFuture' : { 'ledger_time' : Icrc1Timestamp } } |
  { 'TooOld' : null } |
  { 'InsufficientFunds' : { 'balance' : Icrc1Tokens } };
export interface TransferRecord {
  'tokenId' : TokenId,
  'solSignature' : [] | [string],
  'subaccount' : [] | [Uint8Array | number[]],
  'recipient' : Principal,
  'solAddress' : [] | [string],
  'error' : [] | [string],
  'blockIndex' : [] | [bigint],
  'txHash' : [] | [string],
  'amount' : bigint,
  'evmAddress' : [] | [string],
}
export type TypedEvent = {
    'topUpCompleted' : { 'canisterId' : Principal, 'cyclesAmount' : bigint }
  } |
  { 'depositReceived' : { 'tokenId' : string, 'amount' : bigint } } |
  { 'trialStarted' : { 'limitBytes' : bigint } } |
  { 'subscriptionExpired' : null } |
  { 'autoRenewFailed' : { 'reason' : string } } |
  { 'topUpFailed' : { 'canisterId' : Principal, 'reason' : string } } |
  {
    'autoTopUpCompleted' : { 'canisterId' : Principal, 'cyclesAmount' : bigint }
  } |
  {
    'subscriptionRenewed' : {
      'expiresAt' : [] | [bigint],
      'plan' : { 'Pro' : null } |
        { 'Free' : null } |
        { 'License' : null } |
        { 'Trial' : null },
    }
  } |
  { 'balanceLow' : { 'requiredAmount' : bigint } } |
  {
    'paymentReceived' : {
      'tokenId' : string,
      'amount' : bigint,
      'purpose' : string,
    }
  } |
  {
    'subscriptionActivated' : {
      'plan' : { 'Pro' : null } |
        { 'Free' : null } |
        { 'License' : null } |
        { 'Trial' : null },
    }
  } |
  { 'updateAvailable' : { 'releaseTag' : string, 'canisterId' : Principal } } |
  { 'autoTopUpFailed' : { 'canisterId' : Principal, 'reason' : string } } |
  {
    'lowCycles' : {
      'estimatedDaysLeft' : bigint,
      'severity' : { 'warning' : null } |
        { 'critical' : null },
      'remaining' : bigint,
      'canisterId' : Principal,
    }
  };
export interface UpdateInfo {
  'currentWasmHash' : [] | [Uint8Array | number[]],
  'wasmUpdateAvailable' : boolean,
  'availableReleaseTag' : [] | [string],
  'currentReleaseTag' : [] | [string],
  'frontendUpdateAvailable' : boolean,
  'availableWasmHash' : [] | [Uint8Array | number[]],
}
export interface UpdateProfileArgs {
  'displayName' : [] | [string],
  'avatarUrl' : [] | [string],
}
export type UpgradeStorageError = { 'AlreadyUpgrading' : null } |
  { 'NoUpdateAvailable' : null } |
  { 'NotFound' : null } |
  { 'NotOwner' : null } |
  { 'ReleaseNotReady' : null } |
  { 'NotCompleted' : null };
export interface User {
  'id' : Principal,
  'inviter' : [] | [Principal],
  'createdAt' : Time,
  'trialUsed' : boolean,
  'updatedAt' : Time,
}
export interface UserSettings {
  'spendingPriority' : Array<TokenId>,
  'topUpAmountCycles' : bigint,
  'autoRenew' : boolean,
  'autoTopUp' : boolean,
}
export interface WithdrawArgs {
  'to' : WithdrawDestination,
  'tokenId' : TokenId,
  'amount' : bigint,
}
export type WithdrawDestination = {
    'IC' : { 'owner' : Principal, 'subaccount' : [] | [Uint8Array | number[]] }
  } |
  { 'EVM' : { 'address' : string } } |
  { 'SOL' : { 'address' : string } };
export type WithdrawError = { 'BelowMinimum' : { 'minimum' : bigint } } |
  { 'InsufficientBalance' : { 'available' : bigint } } |
  { 'TransferFailed' : string } |
  { 'EvmNotConfigured' : null } |
  { 'SolNotConfigured' : null };
export type WithdrawResult = { 'ok' : bigint } |
  { 'err' : WithdrawError };
export interface _SERVICE extends Rabbithole {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
