import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

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
export interface GetProfilesResponse {
  'total' : [] | [bigint],
  'data' : Array<Profile>,
  'instructions' : bigint,
}
export type Header = [string, string];
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
export interface Profile {
  'id' : Principal,
  'username' : string,
  'displayName' : [] | [string],
  'inviter' : [] | [Principal],
  'createdAt' : Time,
  'updatedAt' : Time,
  'avatarUrl' : [] | [string],
}
export interface Rabbithole {
  'createProfile' : ActorMethod<[CreateProfileArgs], bigint>,
  'deleteProfile' : ActorMethod<[], undefined>,
  'getProfile' : ActorMethod<[], [] | [Profile]>,
  'http_request' : ActorMethod<[RawQueryHttpRequest], RawQueryHttpResponse>,
  'http_request_streaming_callback' : ActorMethod<
    [StreamingToken],
    StreamingCallbackResponse
  >,
  'http_request_update' : ActorMethod<
    [RawUpdateHttpRequest],
    RawUpdateHttpResponse
  >,
  'listProfiles' : ActorMethod<[ListOptions], GetProfilesResponse>,
  'removeAvatar' : ActorMethod<[string], undefined>,
  'saveAvatar' : ActorMethod<[CreateProfileAvatarArgs], string>,
  'updateProfile' : ActorMethod<[UpdateProfileArgs], undefined>,
  'usernameExists' : ActorMethod<[string], boolean>,
  'whoami' : ActorMethod<[], string>,
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
export type SortDirection = { 'Descending' : null } |
  { 'Ascending' : null };
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
export type Time = bigint;
export interface UpdateProfileArgs {
  'displayName' : [] | [string],
  'avatarUrl' : [] | [string],
}
export interface _SERVICE extends Rabbithole {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
