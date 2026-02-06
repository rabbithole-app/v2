import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

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
  'inviter' : [] | [Principal],
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
  { 'CanisterCreated' : { 'canisterId' : Principal } } |
  { 'RevokingInstallerPermission' : { 'canisterId' : Principal } } |
  { 'CheckingAllowance' : null } |
  {
    'UploadingFrontend' : { 'progress' : Progress, 'canisterId' : Principal }
  } |
  { 'TransferringICP' : { 'amount' : bigint } } |
  { 'NotifyingCMC' : { 'blockIndex' : bigint } } |
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
export interface ListOptions {
  'pagination' : { 'offset' : bigint, 'limit' : bigint },
  'count' : boolean,
  'sort' : Array<[string, SortDirection]>,
  'filter' : {
    'id' : [] | [Array<Principal>],
    'username' : [] | [string],
    'displayName' : [] | [string],
    'inviter' : [] | [Array<Principal>],
    'createdAt' : [] | [{ 'max' : [] | [bigint], 'min' : [] | [bigint] }],
    'avatarUrl' : [] | [boolean],
  },
}
export type NotifyError = {
    'Refunded' : { 'block_index' : [] | [BlockIndex], 'reason' : string }
  } |
  { 'InvalidTransaction' : string } |
  { 'Other' : { 'error_message' : string, 'error_code' : bigint } } |
  { 'Processing' : null } |
  { 'TransactionTooOld' : BlockIndex };
export interface Profile {
  'id' : Principal,
  'username' : string,
  'displayName' : [] | [string],
  'inviter' : [] | [Principal],
  'createdAt' : Time,
  'updatedAt' : Time,
  'avatarUrl' : [] | [string],
}
export interface Progress { 'total' : bigint, 'processed' : bigint }
export interface Rabbithole {
  'addCanister' : ActorMethod<[Principal], undefined>,
  'createProfile' : ActorMethod<[CreateProfileArgs], bigint>,
  'createStorage' : ActorMethod<[CreateStorageOptions], Result_1>,
  'deleteCanister' : ActorMethod<[Principal], undefined>,
  'deleteProfile' : ActorMethod<[], undefined>,
  'deleteStorage' : ActorMethod<[bigint], Result>,
  'getProfile' : ActorMethod<[], [] | [Profile]>,
  'getReleasesFullStatus' : ActorMethod<[], ReleasesFullStatus>,
  'http_request' : ActorMethod<[RawQueryHttpRequest], RawQueryHttpResponse>,
  'http_request_streaming_callback' : ActorMethod<
    [StreamingToken],
    StreamingCallbackResponse
  >,
  'http_request_update' : ActorMethod<
    [RawUpdateHttpRequest],
    RawUpdateHttpResponse
  >,
  'isStorageDeployerRunning' : ActorMethod<[], boolean>,
  'listCanisters' : ActorMethod<[], Array<Principal>>,
  'listProfiles' : ActorMethod<[ListOptions], GetProfilesResponse>,
  'listStorages' : ActorMethod<[], Array<StorageInfo>>,
  'refreshReleases' : ActorMethod<[], undefined>,
  'removeAvatar' : ActorMethod<[string], undefined>,
  'saveAvatar' : ActorMethod<[CreateProfileAvatarArgs], string>,
  'startStorageDeployer' : ActorMethod<[], undefined>,
  'stopStorageDeployer' : ActorMethod<[], undefined>,
  'updateProfile' : ActorMethod<[UpdateProfileArgs], undefined>,
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
  { 'err' : DeleteStorageError };
export type Result_1 = { 'ok' : null } |
  { 'err' : CreateStorageError };
export type SortDirection = { 'Descending' : null } |
  { 'Ascending' : null };
export interface StorageInfo {
  'id' : bigint,
  'status' : CreationStatus,
  'completedAt' : [] | [Time],
  'createdAt' : Time,
  'releaseTag' : string,
  'canisterId' : [] | [Principal],
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
export interface UpdateProfileArgs {
  'displayName' : [] | [string],
  'avatarUrl' : [] | [string],
}
export interface _SERVICE extends Rabbithole {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
