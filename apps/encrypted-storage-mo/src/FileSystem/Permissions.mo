import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Order "mo:core/Order";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Option "mo:core/Option";
import Blob "mo:core/Blob";
import List "mo:core/List";
import Array "mo:core/Array";

import IC "mo:ic";
import Map "mo:map/Map";
import Vector "mo:vector";

import Common "Common";
import T "../Types";
import Path "../Path";
import Utils "../Utils";

module Permissions {
  let { ic } = IC;

  let { hashNodes; permissionCompare } = Utils;

  let { phash } = Map;

  func getPermissionsWithKeyId(fs : T.FileSystemStore, findBy : T.FindBy) : Result.Result<(T.PermissionMap, ?T.KeyId), Text> {
    switch (findBy) {
      case (#keyId keyId) {
        let ?{ permissions } = Common.findNodeByKeyId(fs, keyId) else return #err("not found");
        #ok(permissions, ?keyId);
      };
      case (#nodeKey key) {
        let ?{ permissions; keyId } = Map.get(fs.nodes, hashNodes, key) else return #err("not found");
        #ok(permissions, ?keyId);
      };
      case (#entry entry) switch (findNearestNodeByEntry(fs, entry)) {
        case (?{ permissions; keyId }) #ok(permissions, ?keyId);
        case null #ok(fs.rootPermissions, null);
      };
      case (#root) #ok(fs.rootPermissions, null);
    };
  };

  func getPermissions(fs : T.FileSystemStore, findBy : T.FindBy) : Result.Result<T.PermissionMap, Text> {
    getPermissionsWithKeyId(fs, findBy) |> Result.mapOk(_, func v = v.0);
  };

  func getParentNode(fs : T.FileSystemStore, parentId : Nat64) : ?T.NodeStore {
    Map.find(fs.nodes, func(_, value) = Nat64.equal(value.id, parentId)) |> Option.map(_, func(k, v) = v);
  };

  func getMaxPermission(fs : T.FileSystemStore, user : Principal, findBy : T.FindBy, lastPermission : ?T.Permission) : ?T.Permission {
    getUserMaxPermission(fs, user, findBy, lastPermission, findBy == #root);
  };

  func getUserMaxPermission(fs : T.FileSystemStore, user : Principal, findBy : T.FindBy, lastPermission : ?T.Permission, root : Bool) : ?T.Permission {
    let (permissions, parentId) = switch (findBy) {
      case (#nodeKey key) switch (Map.get(fs.nodes, hashNodes, key)) {
        case (?node) (node.permissions, node.parentId);
        case null return lastPermission;
      };
      case (#keyId keyId) switch (Common.findNodeByKeyId(fs, keyId)) {
        case (?node) (node.permissions, node.parentId);
        case null return lastPermission;
      };
      case (#entry entry) switch (findNearestNodeByEntry(fs, entry)) {
        case (?node) (node.permissions, node.parentId);
        case null (fs.rootPermissions, null);
      };
      case (#root) (fs.rootPermissions, null);
    };
    let rights : [T.Permission] = switch (lastPermission, Map.get(permissions, phash, user), Map.get(permissions, phash, Principal.anonymous())) {
      case (?v1, ?v2, ?v3) [v1, v2, v3];
      case ((null, ?v1, ?v2) or (?v1, ?v2, null) or (?v1, null, ?v2)) [v1, v2];
      case ((?v1, null, null) or (null, ?v1, null) or (null, null, ?v1)) [v1];
      case _ [];
    };
    let sortedRights = Array.sort(rights, permissionCompare);
    let permission = switch(sortedRights.size()) {
      case (0) null;
      case (size) ?sortedRights[size - 1];
    };
    let hasOwnerPermission = permission == ?#ReadWriteManage;
    switch (hasOwnerPermission, parentId, root) {
      case (false, ?id, _) {
        switch (getParentNode(fs, id)) {
          case (?{ keyId }) getUserMaxPermission(fs, user, #keyId(keyId), permission, false);
          case null permission;
        };
      };
      case (false, null, false) getUserMaxPermission(fs, user, #root, permission, true);
      case _ permission;
    };
  };

  func findNearestNodeByEntry(fs : T.FileSystemStore, (kind, path) : T.Entry) : ?T.NodeStore {
    let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
    let filename : ?Text = if (kind == #File) Vector.removeLast(dirnames) else null;

    var parentId : ?Nat64 = null;
    var currentNodeKey : ?T.NodeKey = null;

    label dirsLoop for (name in Vector.vals(dirnames)) {
      let nodeKey : T.NodeKey = (#Directory, parentId, name);
      let ?{ id } = Map.get(fs.nodes, hashNodes, nodeKey) else break dirsLoop;
      parentId := ?id;
      currentNodeKey := ?nodeKey;
    };

    let nodeKey : T.NodeKey = switch (filename, currentNodeKey) {
      case (?fname, nodeKey) switch (Map.get(fs.nodes, hashNodes, (#File, parentId, fname)), nodeKey) {
        case (null, ?nodeKey) nodeKey;
        case _ (#File, parentId, fname);
      };
      case (null, ?nodeKey) nodeKey;
      case _ return null;
    };

    Map.get(fs.nodes, hashNodes, nodeKey);
  };

  /// Retrieves a list of users with whom a given vetKey has been shared, along with their access rights.
  /// The caller must have appropriate permissions to view this information.
  public func getSharedUserAccessForKey(fs : T.FileSystemStore, caller : T.Caller, findBy : T.FindBy) : Result.Result<[(Principal, T.Permission)], Text> {
    switch (ensureUserCanRead(fs, caller, findBy)) {
      case (#err message) return #err message;
      case _ {};
    };

    switch (getPermissions(fs, findBy)) {
      case (#ok permissions) Map.entries(permissions) |> Iter.toArray(_) |> #ok(_);
      case (#err _) #ok([]);
    };
  };

  /// Retrieves the access rights a given user has to a specific vetKey.
  /// The caller must have appropriate permissions to view this information.
  public func getUserRights(fs : T.FileSystemStore, caller : T.Caller, findBy : T.FindBy, user : Principal) : Result.Result<?T.Permission, Text> {
    switch (ensureUserCanGetUserRights(fs, caller, findBy)) {
      case (#err message) #err message;
      case (#ok _) #ok(getMaxPermission(fs, user, findBy, null));
    };
  };

  /// Grants or modifies access rights for a user to a given vetKey.
  /// Only the vetKey owner or a user with management rights can perform this action.
  /// The vetKey owner cannot change their own rights.
  public func setUserRights(fs : T.FileSystemStore, caller : T.Caller, findBy : T.FindBy, user : Principal, permission : T.Permission) : Result.Result<(), Text> {
    switch (ensureUserCanSetUserRights(fs, caller, findBy)) {
      case (#err message) #err message;
      case (#ok _) {
        let permissions = switch (getPermissionsWithKeyId(fs, findBy)) {
          case (#ok(permissions, ?keyId)) {
            if (Principal.equal(caller, keyId.0) and Principal.equal(caller, user)) {
              return #err("Cannot change key owner's user rights");
            };
            permissions;
          };
          case (#ok(permissions, null)) {
            // TODO: check is user controller or owner of the canister
            permissions;
          };
          case (#err message) return #err message;
        };

        ignore Map.put(permissions, phash, user, permission);
        #ok;
      };
    };
  };

  /// Revokes a user's access to a shared vetKey.
  /// The vetKey owner cannot remove their own access.
  /// Only the vetKey owner or a user with management rights can perform this action.
  public func removeUserRights(fs : T.FileSystemStore, caller : T.Caller, findBy : T.FindBy, user : Principal) : Result.Result<(), Text> {
    switch (ensureUserCanSetUserRights(fs, caller, findBy)) {
      case (#err message) #err message;
      case (#ok _) {
        let permissions = switch (getPermissionsWithKeyId(fs, findBy)) {
          case (#ok(permissions, ?keyId)) {
            if (Principal.equal(caller, keyId.0) and Principal.equal(caller, user)) {
              return #err("Cannot remove key owner");
            };
            permissions;
          };
          case (#ok(permissions, null)) {
            // TODO: check is user controller or owner of the canister
            permissions;
          };
          case (#err message) return #err message;
        };

        Map.delete(permissions, phash, user);
        #ok;
      };
    };
  };

  /// Ensures that a user has read access to a vetKey before proceeding.
  /// Returns an error if the user is not authorized.
  public func ensureUserCanRead(fs : T.FileSystemStore, user : Principal, findBy : T.FindBy) : Result.Result<T.Permission, Text> {
    switch (getMaxPermission(fs, user, findBy, null)) {
      case (?permission) if (not Order.isLess(permissionCompare(permission, #Read))) return #ok(permission);
      case null {};
    };
    #err("unauthorized");
  };

  /// Ensures that a user has write access to a vetKey before proceeding.
  /// Returns an error if the user is not authorized.
  public func ensureUserCanWrite(fs : T.FileSystemStore, user : Principal, findBy : T.FindBy) : Result.Result<T.Permission, Text> {
    switch (getMaxPermission(fs, user, findBy, null)) {
      case (?permission) if (not Order.isLess(permissionCompare(permission, #ReadWrite))) return #ok(permission);
      case null {};
    };
    #err("unauthorized");
  };

  /// Ensures that a user has permission to view user rights for a vetKey.
  /// Returns an error if the user is not authorized.
  func ensureUserCanGetUserRights(fs : T.FileSystemStore, user : Principal, findBy : T.FindBy) : Result.Result<T.Permission, Text> {
    switch (getMaxPermission(fs, user, findBy, null)) {
      case (?permission) if (not Order.isLess(permissionCompare(permission, #ReadWriteManage))) return #ok(permission);
      case null {};
    };
    #err("unauthorized");
  };

  /// Ensures that a user has management access to a vetKey before proceeding.
  /// Returns an error if the user is not authorized.
  func ensureUserCanSetUserRights(fs : T.FileSystemStore, user : Principal, findBy : T.FindBy) : Result.Result<T.Permission, Text> {
    switch (getMaxPermission(fs, user, findBy, null)) {
      case (?permission) if (not Order.isLess(permissionCompare(permission, #ReadWriteManage))) return #ok(permission);
      case null {};
    };
    #err("unauthorized");
  };

  public func getCanisterControllers(canisterId : Principal) : async* [Principal] {
    let { controllers } = await ic.canister_info({
      canister_id = canisterId;
      num_requested_changes = ?0;
    });
    controllers;
  };

  /// Checks if a principal is a controller of the asset canister.
  func isController(canisterId : Principal, caller : Principal) : async* Result.Result<(), Text> {
    let controllers = await* getCanisterControllers(canisterId);

    let res = Array.find(controllers, func(p : Principal) : Bool = p == caller);
    switch (res) {
      case (?_) #ok();
      case (_) #err("Caller is not a controller.");
    };
  };
};
