import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export type Entry = { 'Directory' : string } |
  { 'Asset' : string };
export type NodeKey = { 'Directory' : [[] | [bigint], string] } |
  { 'Asset' : [[] | [bigint], string] };
export type Permission = { 'Read' : null } |
  { 'Write' : null } |
  { 'Admin' : null } |
  { 'Permissions' : null };
export interface PermissionsCanister {
  'clear' : ActorMethod<[[] | [Entry], boolean], Result_3>,
  'create' : ActorMethod<[Entry], Result_2>,
  'delete' : ActorMethod<[Entry, boolean], Result_1>,
  'grant_permission' : ActorMethod<
    [[] | [Entry], Principal, Permission],
    Result
  >,
  'has_permission' : ActorMethod<[[] | [Entry], Permission], boolean>,
  'node_entries' : ActorMethod<
    [],
    Array<[NodeKey, bigint, Array<[Principal, Permission]>]>
  >,
  'revoke_permission' : ActorMethod<
    [[] | [Entry], Principal, Permission],
    Result
  >,
  'show_tree' : ActorMethod<[[] | [Entry]], string>,
}
export type Result = { 'ok' : null } |
  { 'err' : string };
export type Result_1 = { 'ok' : null } |
  {
    'err' : { 'NotFound' : null } |
      { 'NotAMember' : null } |
      { 'NotEmpty' : null }
  };
export type Result_2 = { 'ok' : bigint } |
  {
    'err' : { 'ParentNotFound' : null } |
      { 'AlreadyExists' : null } |
      { 'IllegalCharacters' : null } |
      { 'NotAMember' : null }
  };
export type Result_3 = { 'ok' : null } |
  { 'err' : { 'NotFound' : null } | { 'NotAMember' : null } };
export interface _SERVICE extends PermissionsCanister {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
