import Text "mo:core/Text";
import Time "mo:core/Time";

import Map "mo:map/Map";
import Vector "mo:vector";

import Const "../Const";
import File "../FileSystem/File";
import FileSystem "../FileSystem";
import T "../Types";
import Upload "../Upload";
import Utils "../Utils";

module {
  public type EntryArguments = {
    entry : T.Entry;
  };

  public type NodeDetailsArguments = {
    node : T.NodeDetails;
  };

  public type BindBatchArguments = {
    entry : T.Entry;
    batchId : T.BatchId;
  };

  public type BatchTargetArguments = {
    nodeKey : T.NodeKey;
    node : T.NodeStore;
    batchId : T.BatchId;
  };

  public type NodeKeyArguments = {
    nodeKey : T.NodeKey;
  };

  public type NodeCleanupArguments = {
    nodeKey : T.NodeKey;
    node : T.NodeStore;
  };

  public type BatchArguments = {
    batchId : T.BatchId;
  };

  /// Converts an entry path to a NodeKey by resolving parent directories.
  /// Returns null if parent directories do not exist or if the entry is a directory.
  public func entryToNodeKey(self : T.FileSystemStore, args : EntryArguments) : ?T.NodeKey {
    let (kind, path) = args.entry;
    let dirnames = Text.split(path, #char '/') |> Vector.fromIter<Text>(_);

    let cleaned = Vector.new<Text>();
    for (seg in Vector.vals(dirnames)) {
      if (seg != "") Vector.add(cleaned, seg);
    };

    let filename : ?Text = if (kind == #File) Vector.removeLast(cleaned) else null;

    var parentId : ?Nat64 = null;
    for (name in Vector.vals(cleaned)) {
      let ?{ id } = Map.get(self.nodes, Utils.hashNodes, (#Directory, parentId, name)) else return null;
      parentId := ?id;
    };

    switch (filename) {
      case (?fname) ?(#File, parentId, fname);
      case null null;
    };
  };

  public func nodeHasCommittedFileVersion(node : T.NodeStore) : Bool {
    switch (node.metadata) {
      case (#File(fileMeta)) File.getCurrentVersion(fileMeta) != null;
      case (#Directory(_)) false;
    };
  };

  public func isStaged(self : T.StableStore, args : NodeDetailsArguments) : Bool {
    let node = args.node;
    let nodeKey : T.NodeKey = switch (node.metadata) {
      case (#File(_)) (#File, node.parentId, node.name);
      case (#Directory(_)) return false;
    };
    let ?_ = Map.get(self.staging, Utils.hashNodes, nodeKey) else return false;
    let ?storeNode = Map.get(self.fs.nodes, Utils.hashNodes, nodeKey) else return false;
    let #File(fileMeta) = storeNode.metadata else return false;
    File.getCurrentVersion(fileMeta) == null;
  };

  public func bindBatch(self : T.StableStore, args : BindBatchArguments) {
    switch (entryToNodeKey(self.fs, { entry = args.entry })) {
      case (?nodeKey) switch (Map.get(self.staging, Utils.hashNodes, nodeKey)) {
        case (?staging) staging.batchId := ?args.batchId;
        case null {};
      };
      case null {};
    };
  };

  public func putBatchTarget(self : T.StableStore, args : BatchTargetArguments) {
    ignore Map.put(self.staging, Utils.hashNodes, args.nodeKey, {
      node = args.node;
      var batchId : ?T.BatchId = ?args.batchId;
      createdAt = Time.now();
    });
  };

  public func removeByNodeKey(self : T.StableStore, args : NodeKeyArguments) {
    ignore Map.remove(self.staging, Utils.hashNodes, args.nodeKey);
  };

  public func removeNodeIfUncommitted(self : T.StableStore, args : NodeCleanupArguments) {
    let { nodeKey; node } = args;
    ignore Map.remove(self.staging, Utils.hashNodes, nodeKey);
    if (not nodeHasCommittedFileVersion(node)) {
      ignore FileSystem.removeNodeByKey(self.fs, nodeKey);
    };
  };

  public func findByBatchId(self : T.StableStore, args : BatchArguments) : ?(T.NodeKey, T.StagingEntry) {
    for ((nodeKey, staging) in Map.entries(self.staging)) {
      if (staging.batchId == ?args.batchId) return ?(nodeKey, staging);
    };
    null;
  };

  public func cleanupExpired(self : T.StableStore) {
    let now = Time.now();
    let keysToRemove = Vector.new<T.NodeKey>();

    for ((nodeKey, staging) in Map.entries(self.staging)) {
      let shouldRemove = switch (staging.batchId) {
        case (?batchId) switch (Upload.getBatch(self.upload, batchId)) {
          case null true;
          case _ false;
        };
        case null (now - staging.createdAt) > Const.BATCH_EXPIRY_DURATION;
      };
      if (shouldRemove) Vector.add(keysToRemove, nodeKey);
    };

    for (key in Vector.vals(keysToRemove)) {
      let removed = Map.remove(self.staging, Utils.hashNodes, key);
      switch (removed) {
        case (?staging) {
          if (not nodeHasCommittedFileVersion(staging.node)) {
            ignore FileSystem.removeNodeByKey(self.fs, key);
          };
        };
        case null {};
      };
    };
  };

  public func removeBatchTargets(self : T.StableStore, args : BatchArguments) {
    let stagingKeysToRemove = Vector.new<T.NodeKey>();
    for ((nodeKey, staging) in Map.entries(self.staging)) {
      if (staging.batchId == ?args.batchId) {
        Vector.add(stagingKeysToRemove, nodeKey);
      };
    };
    for (nodeKey in Vector.vals(stagingKeysToRemove)) {
      switch (Map.remove(self.staging, Utils.hashNodes, nodeKey)) {
        case (?staging) {
          if (not nodeHasCommittedFileVersion(staging.node)) {
            ignore FileSystem.removeNodeByKey(self.fs, nodeKey);
          };
        };
        case null {};
      };
    };
  };
};
