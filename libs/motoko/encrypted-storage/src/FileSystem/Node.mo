import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Order "mo:core/Order";
import Option "mo:core/Option";
import Text "mo:core/Text";

import Map "mo:map/Map";
import TID "mo:tid";
import T "../Types";
import File "File";
import { permissionCompare } "../Utils";

/// Module for node level operations.
module Node {
  let { phash } = Map;

  /// Creates a new node with optional encryption mode.
  public func new(nodeKey : T.NodeKey, owner : Principal, tid : TID.TID, encryptionMode : ?T.EncryptionMode) : T.NodeStore {
    let now = Time.now();
    let mode = Option.get(encryptionMode, #Encrypted);
    let (parentId, name, metadata) : (?Nat64, Text, T.NodeMetadataStore) = switch (nodeKey) {
      case (#File, parentId, name) (parentId, name, #File(File.new(mode, ?1)));
      case (#Directory, parentId, name) (parentId, name, #Directory { var color = null; var defaultEncryptionMode = mode });
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
    let metadata : {
      #File : T.FileMetadata;
      #Directory : T.DirectoryMetadata;
    } = switch (node.metadata) {
      case (#File file) {
        let currentVer = File.getCurrentVersion(file);
        #File {
          sha256 = switch (currentVer) { case (?v) v.sha256; case null null };
          contentType = switch (currentVer) { case (?v) v.contentType; case null "" };
          size = switch (currentVer) { case (?v) v.size; case null 0 };
          thumbnailKey = file.thumbnailKey;
          encryptionMode = file.encryptionMode;
          versionCount = File.versionCount(file);
          currentVersion = file.currentVersion;
          chunkCount = File.getChunksSize(file, null);
          storageBackend = switch (currentVer) {
            case (?v) File.storageBackendOf(v.chunks);
            case null #OnChain;
          };
        };
      };
      case (#Directory metadata) #Directory {
        color = metadata.color;
        defaultEncryptionMode = metadata.defaultEncryptionMode;
      };
    };
    {
      id = node.id;
      keyId = node.keyId;
      createdAt = node.createdAt;
      modifiedAt = node.modifiedAt;
      name = node.name;
      parentId = node.parentId;
      callerPermission = null;
      sharing = null;
      metadata;
    };
  };

  public func copy(self : T.NodeStore) : T.NodeStore {
    let metadata : T.NodeMetadataStore = switch (self.metadata) {
      case (#File file) #File(File.copy(file));
      case (#Directory dir) #Directory { var color = dir.color; var defaultEncryptionMode = dir.defaultEncryptionMode };
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
