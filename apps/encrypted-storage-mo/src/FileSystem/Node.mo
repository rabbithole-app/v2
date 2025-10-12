import Principal "mo:core/Principal";
import Iter "mo:core/Iter";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Order "mo:core/Order";
import Text "mo:core/Text";

import Map "mo:map/Map";
import TID "mo:tid";
import Vector "mo:vector";

import T "../Types";
import File "File";
import { permissionCompare } "../Utils";

/// Module for node level operations.
module Node {
  let { phash } = Map;

  /// Creates a new node.
  public func new(nodeKey : T.NodeKey, owner : Principal, tid : TID.TID) : T.NodeStore {
    let now = Time.now();
    let (parentId, name, metadata) : (?Nat64, Text, T.NodeMetadataStore) = switch (nodeKey) {
      case (#File, parentId, name) (parentId, name, #File(File.new()));
      case (#Directory, parentId, name) (parentId, name, #Directory { var color = null });
    };

    {
      id = TID.toNat64(tid);
      keyId = (owner, Text.encodeUtf8(TID.toText(tid)));
      createdAt = now;
      var modifiedAt = ?now;
      var parentId;
      var name;
      permissions = Map.new();
      metadata;
    };
  };

  public func getDetails(node : T.NodeStore) : T.NodeDetails {
    let permissions = Map.entries(node.permissions) |> Iter.toArray(_);
    let metadata : {
      #File : T.FileMetadata;
      #Directory : T.DirectoryMetadata;
    } = switch (node.metadata) {
      case (#File metadata) #File {
        sha256 = metadata.sha256;
        contentType = metadata.contentType;
        size = metadata.size;
      };
      case (#Directory metadata) #Directory { color = metadata.color };
    };
    {
      id = node.id;
      keyId = node.keyId;
      createdAt = node.createdAt;
      modifiedAt = node.modifiedAt;
      name = node.name;
      parentId = node.parentId;
      permissions;
      metadata;
    };
  };

  public func copy(self : T.NodeStore) : T.NodeStore {
    let metadata : T.NodeMetadataStore = switch (self.metadata) {
      case (#File file) #File(File.copy(file));
      case (#Directory dir) #Directory { var color = dir.color };
    };
    let newNode : T.NodeStore = {
      id = self.id;
      keyId = self.keyId;
      createdAt = self.createdAt;
      var modifiedAt = ?Time.now();
      var parentId = self.parentId;
      var name = self.name;
      permissions = Map.clone(self.permissions);
      metadata;
    };

    newNode;
  };

  public func merge(a : T.NodeStore, b : T.NodeStore) : T.NodeStore {
    let newNode = copy(a);

    for ((key, value) in Map.entries(b.permissions)) {
      switch (Map.get(newNode.permissions, phash, key)) {
        case (?found) {
          let isLess = Order.isLess(permissionCompare(value, found));
          if isLess ignore Map.put(newNode.permissions, phash, key, value);
        };
        case null ignore Map.add(newNode.permissions, phash, key, value);
      };
    };

    newNode;
  };
};
