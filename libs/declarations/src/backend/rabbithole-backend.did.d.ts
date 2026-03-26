import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

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
export interface InitArgs { 'github' : [] | [GithubOptions] }
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
export interface Rabbithole {
  'activateSubscription' : ActorMethod<
    [Principal, Plan, [] | [bigint]],
    undefined
  >,
  'activateTrial' : ActorMethod<[], undefined>,
  'addAdmin' : ActorMethod<[Principal], undefined>,
  'checkStorageUpdate' : ActorMethod<[Principal], [] | [UpdateInfo]>,
  'checkSubscription' : ActorMethod<
    [Uint8Array | number[]],
    SubscriptionCheckResult
  >,
  'createProfile' : ActorMethod<[CreateProfileArgs], bigint>,
  'createStorage' : ActorMethod<[CreateStorageOptions], Result_2>,
  'deleteProfile' : ActorMethod<[], undefined>,
  'deleteStorage' : ActorMethod<[bigint], Result_1>,
  'getAmbassadorChainQuery' : ActorMethod<[], AmbassadorChain>,
  'getNotifications' : ActorMethod<[[] | [Time], bigint], NotificationsPage>,
  'getProfile' : ActorMethod<[], [] | [Profile]>,
  'getReleasesFullStatus' : ActorMethod<[], ReleasesFullStatus>,
  'getSubscription' : ActorMethod<[], [] | [Subscription]>,
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
  'refreshReleases' : ActorMethod<[], undefined>,
  'register' : ActorMethod<[[] | [string]], undefined>,
  'removeAdmin' : ActorMethod<[Principal], undefined>,
  'saveAvatar' : ActorMethod<[CreateProfileAvatarArgs], string>,
  'startStorageDeployer' : ActorMethod<[], undefined>,
  'stopStorageDeployer' : ActorMethod<[], undefined>,
  'updateProfile' : ActorMethod<[UpdateProfileArgs], undefined>,
  'upgradeStorage' : ActorMethod<[Principal], Result>,
  'usernameExists' : ActorMethod<[string], boolean>,
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
export type Result_1 = { 'ok' : null } |
  { 'err' : DeleteStorageError };
export type Result_2 = { 'ok' : null } |
  { 'err' : CreateStorageError };
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
export type TypedEvent = { 'trialStarted' : { 'limitBytes' : bigint } } |
  { 'subscriptionExpired' : null } |
  { 'subscriptionActivated' : { 'plan' : Plan } } |
  { 'updateAvailable' : { 'releaseTag' : string, 'canisterId' : Principal } } |
  { 'lowCycles' : { 'remaining' : bigint, 'canisterId' : Principal } };
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
  'updatedAt' : Time,
}
export interface _SERVICE extends Rabbithole {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
