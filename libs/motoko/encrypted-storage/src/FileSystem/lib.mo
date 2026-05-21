import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import Result "mo:core/Result";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Option "mo:core/Option";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import CoreMap "mo:core/Map";

import Map "mo:map/Map";
import TID "mo:tid";
import Vector "mo:vector";

import StableTID "../StableTID";
import T "../Types";
import Utils "../Utils";
import ErrorMessages "../ErrorMessages";
import Path "../Path";
import Thumbnail "../Thumbnail";
import File "File";
import Node "Node";
import { findNodeById; findNodeByKeyId } "Common";

module FileSystem {
  public type Store = T.FileSystemStore;

  let { phash } = Map;

  let { hashNodes; repeat } = Utils;

  /// Create a new stable FileSystem instance on the heap.
  /// This instance is stable and will not be cleared on canister upgrade.
  ///
  /// Example:
  /// ```motoko
  /// let region = MemoryRegion.new();
  /// let canisterId = Principal.fromActor(self);
  /// stable var fs = FileSystem.new({
  ///   region;
  ///   canisterId;
  ///   permissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)]
  /// });
  /// ```
  public func new(args : T.FileSystemInitArgs) : Store {
    let state : Store = {
      region = args.region;
      nodes = Map.new();
      rootPermissions = Map.fromIter(Iter.fromArray(args.rootPermissions), phash);
      tid = StableTID.new();
    };

    state;
  };

  func findNodeByEntry(self : Store, entry : ?T.Entry) : ?T.NodeStore {
    let ?nodeKey = findKeyByEntry(self, entry) else return null;
    Map.get(self.nodes, hashNodes, nodeKey);
  };

  func findKeyByEntry(fs : T.FileSystemStore, entry : ?T.Entry) : ?T.NodeKey {
    let (kind, path) = switch (entry) {
      case null return null;
      case (?v) v;
    };

    let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
    let filename : ?Text = if (kind == #File) Vector.removeLast(dirnames) else null;

    var parentId : ?Nat64 = null;
    var currentNodeKey : ?T.NodeKey = null;
    for (name in Vector.vals(dirnames)) {
      let nodeKey : T.NodeKey = (#Directory, parentId, name);
      let ?{ id } = Map.get(fs.nodes, hashNodes, nodeKey) else return null;
      parentId := ?id;
      currentNodeKey := ?nodeKey;
    };

    switch (filename, currentNodeKey) {
      case (?fname, _) {
        let ?_ = Map.get(fs.nodes, hashNodes, (#File, parentId, fname)) else return null;
        ?(#File, parentId, fname);
      };
      case (null, ?nodeKey) ?nodeKey;
      case _ null;
    };
  };

  public func getFilterByFromEntry(fs : Store, entry : ?T.Entry) : Result.Result<T.FindBy, Text> {
    switch (entry) {
      case (?v) switch (findKeyByEntry(fs, ?v)) {
        case (?key) #ok(#nodeKey(key));
        case null #err(ErrorMessages.entryNotFound(v));
      };
      case null #ok(#root);
    };
  };

  func sortByName(arr : [T.NodeStore]) : [T.NodeStore] = Array.sort(arr, func(a, b) = Text.compare(a.name, b.name));

  public func listByParentId(self : Store, id : ?Nat64) : [T.NodeStore] {
    let (files, directories) = (Vector.new<T.NodeStore>(), Vector.new<T.NodeStore>());
    for (node in Map.vals(self.nodes)) {
      if (id == node.parentId) {
        switch (node) {
          case ({ metadata = #File(_) }) Vector.add(files, node);
          case ({ metadata = #Directory(_) }) Vector.add(directories, node);
        };
      };
    };
    let sortedDirectories = Vector.toArray(directories) |> sortByName _;
    let sortedFiles = Vector.toArray(files) |> sortByName _;
    Array.concat(sortedDirectories, sortedFiles);
  };

  func hasChildren(self : Store, id : Nat64) : Bool {
    label forLoop for ((nodeKey, node) in Map.entries(self.nodes)) {
      let ?parentId = nodeKey.1 else continue forLoop;
      if (id == parentId) return true;
    };
    false;
  };

  // func findNearestNodeKeyByEntry(self : Store, entry : T.Entry) : ?T.NodeKey {
  //   let (kind, path) = extractFromEntry(entry);
  //   let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
  //   let filename : ?Text = if (kind == #File) Vector.removeLast(dirnames) else null;

  //   var parentId : ?Nat64 = null;
  //   var currentNodeKey : ?T.NodeKey = null;

  //   label dirsLoop for (name in Vector.vals(dirnames)) {
  //     let nodeKey : T.NodeKey = #Directory(parentId, name);
  //     let ?{ id } = Map.get(self.nodes, hashNodes, nodeKey) else break dirsLoop;
  //     parentId := ?id;
  //     currentNodeKey := ?nodeKey;
  //   };

  //   switch (filename, currentNodeKey) {
  //     case (?fname, nodeKey) switch (Map.get(self.nodes, hashNodes, #File(parentId, fname)), nodeKey) {
  //       case (null, ?nodeKey) ?nodeKey;
  //       case _ ?#File(parentId, fname);
  //     };
  //     case (null, ?nodeKey) ?nodeKey;
  //     case _ return null;
  //   };
  // };

  public func get(self : Store, findBy : { #entry : T.Entry; #keyId : T.KeyId }) : ?T.NodeStore {
    switch (findBy) {
      case (#entry(entry)) findNodeByEntry(self, ?entry);
      case (#keyId(keyId)) findNodeByKeyId(self, keyId);
    };
  };

  func encryptionPolicyFromMode(mode : T.EncryptionMode) : T.DirectoryEncryptionPolicy {
    switch (mode) {
      case (#Encrypted) #Encrypted;
      case (#Plaintext) #Plaintext;
    };
  };

  func modeFromEncryptionPolicy(policy : T.DirectoryEncryptionPolicy) : ?T.EncryptionMode {
    switch (policy) {
      case (#Auto) null;
      case (#Encrypted) ?#Encrypted;
      case (#Plaintext) ?#Plaintext;
    };
  };

  func isBlobStorage(backend : T.StorageBackend) : Bool {
    switch (backend) {
      case (#BlobStorage) true;
      case (#OnChain) false;
    };
  };

  func inheritedDirectoryEncryptionMode(self : Store, node : T.NodeStore) : T.EncryptionMode {
    switch (node.parentId) {
      case (?parentId) switch (findNodeById(self, parentId)) {
        case (?parent) resolveDirectoryEncryptionMode(self, parent);
        case null #Encrypted;
      };
      case null #Encrypted;
    };
  };

  public func resolveDirectoryEncryptionMode(self : Store, node : T.NodeStore) : T.EncryptionMode {
    switch (node.metadata) {
      case (#Directory(dir)) switch (modeFromEncryptionPolicy(dir.encryptionPolicy)) {
        case (?mode) mode;
        case null inheritedDirectoryEncryptionMode(self, node);
      };
      case (#File(file)) file.encryptionMode;
    };
  };

  func inheritedThumbnailStorageBackend(self : Store, storageBackendType : T.StorageBackend, node : T.NodeStore) : T.StorageBackend {
    if (isBlobStorage(storageBackendType)) return #BlobStorage;
    switch (node.parentId) {
      case (?parentId) switch (findNodeById(self, parentId)) {
        case (?parent) resolveThumbnailStorageBackend(self, storageBackendType, parent);
        case null #OnChain;
      };
      case null #OnChain;
    };
  };

  public func resolveThumbnailStorageBackend(self : Store, storageBackendType : T.StorageBackend, node : T.NodeStore) : T.StorageBackend {
    if (isBlobStorage(storageBackendType)) return #BlobStorage;
    switch (node.metadata) {
      case (#Directory(dir)) switch (dir.thumbnailStoragePolicy) {
        case (#Inherit) inheritedThumbnailStorageBackend(self, storageBackendType, node);
        case (#OnChain) #OnChain;
        case (#BlobStorage) #BlobStorage;
      };
      case (#File(_)) inheritedThumbnailStorageBackend(self, storageBackendType, node);
    };
  };

  func inheritedThumbnailEncryptionPolicy(self : Store, node : T.NodeStore) : T.ThumbnailEncryptionPolicy {
    switch (node.parentId) {
      case (?parentId) switch (findNodeById(self, parentId)) {
        case (?parent) resolveThumbnailEncryptionPolicy(self, parent);
        case null #FollowFile;
      };
      case null #FollowFile;
    };
  };

  func resolveThumbnailEncryptionPolicy(self : Store, node : T.NodeStore) : T.ThumbnailEncryptionPolicy {
    switch (node.metadata) {
      case (#Directory(dir)) switch (dir.thumbnailEncryptionPolicy) {
        case (#Inherit) inheritedThumbnailEncryptionPolicy(self, node);
        case (#FollowFile) #FollowFile;
      };
      case (#File(_)) inheritedThumbnailEncryptionPolicy(self, node);
    };
  };

  func thumbnailScopeKeyId(self : Store, node : T.NodeStore) : T.KeyId {
    switch (node.parentId) {
      case (?parentId) switch (findNodeById(self, parentId)) {
        case (?parent) parent.keyId;
        case null node.keyId;
      };
      case null node.keyId;
    };
  };

  public func resolveThumbnailEncryption(self : Store, node : T.NodeStore) : T.ThumbnailEncryptionRequirement {
    switch (node.metadata) {
      case (#File(file)) switch (file.encryptionMode) {
        case (#Plaintext) #Plaintext;
        case (#Encrypted) switch (resolveThumbnailEncryptionPolicy(self, node)) {
          case (#FollowFile or #Inherit) #Encrypted({ scopeKeyId = thumbnailScopeKeyId(self, node) });
        };
      };
      case (#Directory(_)) #Plaintext;
    };
  };

  func newDirectoryPolicy(self : Store, storageBackendType : T.StorageBackend, parent : ?T.NodeStore) : Node.DirectoryPolicyInit {
    {
      encryptionPolicy = #Auto;
      defaultEncryptionMode = switch (parent) {
        case (?node) resolveDirectoryEncryptionMode(self, node);
        case null #Encrypted;
      };
      thumbnailStoragePolicy = #Inherit;
      defaultThumbnailStorageBackend = switch (parent) {
        case (?node) resolveThumbnailStorageBackend(self, storageBackendType, node);
        case null {
          if (isBlobStorage(storageBackendType)) #BlobStorage else #OnChain
        };
      };
      thumbnailEncryptionPolicy = #Inherit;
    };
  };

  public func getDetails(self : Store, storageBackendType : T.StorageBackend, node : T.NodeStore) : T.NodeDetails {
    let details = Node.getDetails(node);
    switch (details.metadata) {
      case (#Directory(metadata)) {
        let directoryMetadata : T.DirectoryMetadata = {
          color = metadata.color;
          defaultEncryptionMode = resolveDirectoryEncryptionMode(self, node);
          encryptionPolicy = metadata.encryptionPolicy;
          thumbnailStoragePolicy = metadata.thumbnailStoragePolicy;
          defaultThumbnailStorageBackend = resolveThumbnailStorageBackend(self, storageBackendType, node);
          thumbnailEncryptionPolicy = metadata.thumbnailEncryptionPolicy;
        };
        {
          details with metadata = #Directory(directoryMetadata);
        };
      };
      case (#File(_)) details;
    };
  };

  public func create(self : Store, owner : Principal, { entry; createMode; encryptionMode } : T.CreateArguments, storageBackendType : T.StorageBackend) : Result.Result<T.NodeStore, Text> {
    switch (findNodeByEntry(self, ?entry), createMode) {
      case (null, _) #ok(createPath(self, owner, entry, encryptionMode, storageBackendType));
      case (?node, #GetOrCreate) #ok(node);
      case (?_, #CreateNew) #err(ErrorMessages.entryAlreadyExists(entry));
    };
  };

  // func commitBatch(self : Store, operations : [CommitBatchOperation]) {};

  func createPath(self : Store, owner : Principal, (kind, path) : T.Entry, encryptionMode : ?T.EncryptionMode, storageBackendType : T.StorageBackend) : T.NodeStore {
    let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
    let filename : ?Text = if (kind == #File) Vector.removeLast(dirnames) else null;

    var parent : ?T.NodeStore = null;
    var parentId : ?Nat64 = null;
    for (name in Vector.vals(dirnames)) {
      let node = switch (Map.get(self.nodes, hashNodes, (#Directory, parentId, name))) {
        case (?v) v;
        case null switch (createNode(self, (#Directory, parentId, name), owner, null, ?newDirectoryPolicy(self, storageBackendType, parent))) {
          case (#ok v or #err(#AlreadyExists v)) v;
        };
      };
      parent := ?node;
      parentId := ?node.id;
    };

    // Resolve encryption mode: explicit > inherit from parent directory > #Encrypted
    let resolvedMode : ?T.EncryptionMode = switch (encryptionMode) {
      case (?mode) ?mode;
      case null switch (parent) {
        case (?node) ?resolveDirectoryEncryptionMode(self, node);
        case _ ?#Encrypted;
      };
    };

    switch (parent, filename) {
      case (_, ?name) switch (createNode(self, (#File, parentId, name), owner, resolvedMode, null)) {
        case (#ok v or #err(#AlreadyExists v)) v;
      };
      case (?node, null) {
        // If creating a directory with explicit encryption mode, update it
        switch (encryptionMode, node.metadata) {
          case (?mode, #Directory(dir)) {
            dir.encryptionPolicy := encryptionPolicyFromMode(mode);
            dir.defaultEncryptionMode := mode;
          };
          case _ {};
        };
        node;
      };
      case _ Runtime.unreachable();
    };
  };

  /// Removes a node from the FS nodes map by its NodeKey.
  /// Used to clean up staged placeholder nodes.
  public func removeNodeByKey(self : Store, nodeKey : T.NodeKey) : ?T.NodeStore {
    Map.remove(self.nodes, hashNodes, nodeKey);
  };

  func createNode(self : Store, nodeKey : T.NodeKey, owner : Principal, encryptionMode : ?T.EncryptionMode, directoryPolicy : ?Node.DirectoryPolicyInit) : Result.Result<T.NodeStore, { #AlreadyExists : T.NodeStore }> {
    switch (Map.get(self.nodes, hashNodes, nodeKey)) {
      case (?v) #err(#AlreadyExists v);
      case null {
        let tid = StableTID.next(self.tid);
        let node = Node.new(nodeKey, owner, tid, encryptionMode, directoryPolicy);
        ignore Map.put(self.nodes, hashNodes, nodeKey, node);
        #ok node;
      };
    };
  };

  public func delete(self : Store, { entry; recursive } : T.DeleteArguments) : Result.Result<[T.NodeStore], Text> {
    let ?nodeKey = findKeyByEntry(self, ?entry) else return #err(ErrorMessages.entryNotFound(entry));
    deleteNode(self, nodeKey, recursive) |> Result.mapErr<[T.NodeStore], { #NotFound; #NotEmpty }, Text>(
      _,
      func e = switch e {
        case (#NotFound) ErrorMessages.entryNotFound(entry);
        case (#NotEmpty) ErrorMessages.directoryNotEmpty(entry.1);
      },
    );
  };

  func nodeKeyFromNode(node : T.NodeStore) : T.NodeKey {
    switch (node.metadata) {
      case (#File(_)) (#File, node.parentId, node.name);
      case (#Directory(_)) (#Directory, node.parentId, node.name);
    };
  };

  func deleteNode(self : Store, nodeKey : T.NodeKey, recursive : Bool) : Result.Result<[T.NodeStore], { #NotFound; #NotEmpty }> {
    let ?node = Map.get(self.nodes, hashNodes, nodeKey) else return #err(#NotFound);
    let notEmpty = not recursive and hasChildren(self, node.id);

    if (notEmpty) return #err(#NotEmpty);

    let removedNodes = Vector.new<T.NodeStore>();

    switch (nodeKey) {
      case (#File, _, _) {};
      case (#Directory, _, name) {
        if (recursive) {
          let iter = listByParentId(self, ?node.id) |> Iter.fromArray _;
          for (subnode in iter) {
            switch (deleteNode(self, nodeKeyFromNode(subnode), true)) {
              case (#ok(children)) {
                for (child in children.vals()) {
                  Vector.add(removedNodes, child);
                };
              };
              case (#err(err)) return #err(err);
            };
          };
        };
      };
    };

    let ?removed = Map.remove(self.nodes, hashNodes, nodeKey) else return #err(#NotFound);
    Vector.add(removedNodes, removed);

    #ok(Vector.toArray(removedNodes));
  };

  public func move(self : Store, source : T.Entry, optTarget : ?T.Entry, storageBackendType : T.StorageBackend) : Result.Result<(), Text> {
    let ?sourceNode = findNodeByEntry(self, ?source) else return #err(ErrorMessages.sourceNotFound(source));

    switch (sourceNode, optTarget, findNodeByEntry(self, optTarget)) {
      case ({ metadata = #Directory(_) }, _, ?{ metadata = #File(_) }) return #err(ErrorMessages.badArgs());
      case (_, ?target, null) return #err(ErrorMessages.targetNotFound(target));
      case (_, _, ?{ id }) {
        // No-op: already in target directory
        if (sourceNode.parentId == ?id) return #ok;
        // Prevent moving a directory into itself or its own descendant
        switch (sourceNode.metadata) {
          case (#Directory(_)) {
            if (isDescendant(self, id, sourceNode.id)) {
              return #err("Cannot move a directory into itself or its subdirectory");
            };
          };
          case _ {};
        };
        moveNode(self, sourceNode, ?id, storageBackendType);
      };
      case (_, null, null) {
        // No-op: already at root
        if (sourceNode.parentId == null) return #ok;
        moveNode(self, sourceNode, null, storageBackendType);
      };
    };

    #ok;
  };

  /// Checks if `candidateId` is a descendant of `ancestorId` (or equal to it).
  func isDescendant(self : Store, candidateId : Nat64, ancestorId : Nat64) : Bool {
    if (candidateId == ancestorId) return true;
    for (child in Iter.fromArray(listByParentId(self, ?ancestorId))) {
      switch (child.metadata) {
        case (#Directory(_)) {
          if (isDescendant(self, candidateId, child.id)) return true;
        };
        case _ {};
      };
    };
    false;
  };

  func moveNode(self : Store, node : T.NodeStore, newParentId : ?Nat64, storageBackendType : T.StorageBackend) {
    let oldParentId = node.parentId;
    let (oldEntry, newEntry) = switch (node.metadata) {
      case (#Directory(_)) ((#Directory, node.parentId, node.name), (#Directory, newParentId, node.name));
      case (#File(_)) ((#File, node.parentId, node.name), (#File, newParentId, node.name));
    };
    let updatedNode : T.NodeStore = switch (Map.get(self.nodes, hashNodes, newEntry)) {
      case (?v) {
        switch (node.metadata) {
          case (#File _) {
            // TODO: merge files

          };
          case (#Directory _) {
            for (children in Iter.fromArray(listByParentId(self, ?node.id))) {
              moveNode(self, children, ?v.id, storageBackendType);
            };
          };
        };

        v.parentId := newParentId;
        Node.merge(v, node);
      };
      case null {
        node.parentId := newParentId;
        let copiedNode = Node.copy(node);
        clearThumbnailAfterParentChange(self, copiedNode, oldParentId, newParentId, storageBackendType);
        copiedNode;
      };
    };
    Map.set(self.nodes, hashNodes, newEntry, updatedNode);
    if (oldEntry != newEntry) {
      Map.delete(self.nodes, hashNodes, oldEntry);
    };
  };

  func thumbnailStorageBackendForFileParent(self : Store, storageBackendType : T.StorageBackend, parentId : ?Nat64) : T.StorageBackend {
    if (isBlobStorage(storageBackendType)) return #BlobStorage;
    switch (parentId) {
      case (?id) switch (findNodeById(self, id)) {
        case (?parent) resolveThumbnailStorageBackend(self, storageBackendType, parent);
        case null #OnChain;
      };
      case null #OnChain;
    };
  };

  func shouldClearThumbnailAfterParentChange(self : Store, ref : T.ThumbnailRef, oldParentId : ?Nat64, newParentId : ?Nat64, storageBackendType : T.StorageBackend) : Bool {
    if (oldParentId == newParentId) return false;
    if (Thumbnail.isEncrypted(ref)) return true;

    thumbnailStorageBackendForFileParent(self, storageBackendType, oldParentId) !=
    thumbnailStorageBackendForFileParent(self, storageBackendType, newParentId);
  };

  func clearThumbnailAfterParentChange(self : Store, node : T.NodeStore, oldParentId : ?Nat64, newParentId : ?Nat64, storageBackendType : T.StorageBackend) {
    if (oldParentId == newParentId) return;
    switch (node.metadata) {
      case (#File(file)) switch (file.thumbnailRef) {
        case (?ref) if (shouldClearThumbnailAfterParentChange(self, ref, oldParentId, newParentId, storageBackendType)) file.thumbnailRef := null;
        case _ {};
      };
      case (#Directory(_)) {};
    };
  };

  public func rename(self : Store, entry : T.Entry, newName : Text) : Result.Result<(), Text> {
    let ?sourceNode = findNodeByEntry(self, ?entry) else return #err(ErrorMessages.sourceNotFound(entry));

    let oldKey : T.NodeKey = switch (sourceNode.metadata) {
      case (#Directory(_)) (#Directory, sourceNode.parentId, sourceNode.name);
      case (#File(_)) (#File, sourceNode.parentId, sourceNode.name);
    };
    let newKey : T.NodeKey = switch (sourceNode.metadata) {
      case (#Directory(_)) (#Directory, sourceNode.parentId, newName);
      case (#File(_)) (#File, sourceNode.parentId, newName);
    };

    // Check if a node with newName already exists at the same parent
    switch (Map.get(self.nodes, hashNodes, newKey)) {
      case (?_) return #err("An entry with name \"" # newName # "\" already exists");
      case null {};
    };

    let updatedNode = Node.copy(sourceNode);
    updatedNode.name := newName;
    Map.set(self.nodes, hashNodes, newKey, updatedNode);
    Map.delete(self.nodes, hashNodes, oldKey);

    #ok;
  };

  public func clear(self : Store) {
    Map.clear(self.nodes);
  };

  /// Builds the full path of a node by traversing parents up to root.
  public func getEntryPath(self : Store, node : T.NodeStore) : Text {
    func buildPath(n : T.NodeStore) : Text {
      switch (n.parentId) {
        case null n.name;
        case (?pid) {
          let parent = Map.find(self.nodes, func(_, v) = v.id == pid);
          switch (parent) {
            case (?(_, p)) buildPath(p) # "/" # n.name;
            case null n.name;
          };
        };
      };
    };
    buildPath(node);
  };

  public func tree(self : Store, parentId : ?Nat64) : [T.TreeNode] {
    let vector = Vector.new<T.TreeNode>();
    let items = listByParentId(self, parentId);
    for (item in Iter.fromArray(items)) {
      let children = switch (item) {
        case ({ metadata = #File _ }) null;
        case ({ metadata = #Directory _; id }) ?tree(self, ?id);
      };
      Vector.add(vector, { name = item.name; children });
    };
    Vector.toArray(vector);
  };

  // Tree visualization for debugging
  /* for example,
    .
    ├─crypto [id]
    │ └─nfts
    │   └─punks
    ├─images
    └─icons
    */
  public func showTree(self : Store, entry : ?T.Entry) : Text {
    let content = switch (findNodeByEntry(self, entry)) {
      case (?node) {
        let treeContent = showSubTree(self, ?node.id, 0, null, null);
        let id = node.name # " [" # formatId(node.id) # "]" # treeContent;
      };
      case null " ." # showSubTree(self, null, 0, null, null);
    };
    "\n" # content # "\n";
  };

  func formatId(id : Nat64) : Text = switch (TID.fromNat64(id)) {
    case (#ok tid) TID.toText(tid);
    case (#err _) Nat64.toText(id);
  };

  func showSubTree(self : Store, id : ?Nat64, depth : Nat, prefix_ : ?Text, optIsParentLast : ?Bool) : Text {
    var output : Text = "";
    var i : Nat = 0;
    var isParentLast = Option.get(optIsParentLast, true);
    var prefix : Text = Option.get(prefix_, "");
    if (depth > 0) { prefix #= if isParentLast "░░" else "░│" };

    let items = listByParentId(self, id);
    let count = items.size();
    let prefixLength = prefix.size();
    for (item in items.vals()) {
      let isLast : Bool = Nat.equal(i, count - 1);
      let node = if isLast "└─" else "├─";
      output #= "\n" # prefix # repeat("░", depth * 2 - prefixLength) # node # item.name # "[" # formatId(item.id) # "]";
      output #= showSubTree(self, ?item.id, depth + 1, ?prefix, ?isLast);
      i += 1;
    };
    output;
  };

  public func listVersions(self : Store, entry : T.Entry) : Result.Result<[T.FileVersionDetails], Text> {
    let ?node = findNodeByEntry(self, ?entry) else return #err(ErrorMessages.entryNotFound(entry));
    switch (node.metadata) {
      case (#File(file)) {
        let result = CoreMap.foldLeft<Nat, T.FileVersion, [T.FileVersionDetails]>(
          file.versions,
          [],
          func(acc, key, v) {
            let detail : T.FileVersionDetails = {
              index = key;
              sha256 = v.sha256;
              size = v.size;
              contentType = v.contentType;
              createdAt = v.createdAt;
              storageBackend = File.storageBackendOf(v.chunks);
            };
            Array.concat(acc, [detail]);
          },
        );
        #ok(result);
      };
      case (#Directory _) #err(ErrorMessages.cannotVersionDirectory());
    };
  };

  public func restoreVersion(self : Store, entry : T.Entry, version : Nat) : Result.Result<(), Text> {
    let ?node = findNodeByEntry(self, ?entry) else return #err(ErrorMessages.entryNotFound(entry));
    switch (node.metadata) {
      case (#File(file)) {
        if (not File.hasVersion(file, version)) return #err(ErrorMessages.versionOutOfBounds(version));
        file.currentVersion := version;
        #ok;
      };
      case (#Directory _) #err(ErrorMessages.cannotVersionDirectory());
    };
  };

  public func setThumbnail(self : Store, args : T.SetThumbnailArguments) : Result.Result<T.NodeStore, Text> {
    let ?node = findNodeByEntry(self, ?args.entry) else return #err(ErrorMessages.entryNotFound(args.entry));
    switch (node.metadata) {
      case (#File(file)) {
        file.thumbnailRef := args.thumbnailRef;
        #ok node;
      };
      case (#Directory(_)) #err(ErrorMessages.badArgs());
    };
  };

  public func setDirectoryPolicy(self : Store, storageBackendType : T.StorageBackend, args : T.UpdateDirectoryPolicyArguments) : Result.Result<T.NodeStore, Text> {
    let ?node = findNodeByEntry(self, ?args.entry) else return #err(ErrorMessages.entryNotFound(args.entry));
    switch (node.metadata) {
      case (#Directory(dir)) {
        switch (args.thumbnailStoragePolicy) {
          case (?#OnChain) {
            if (isBlobStorage(storageBackendType)) {
              return #err("On-chain thumbnails are not available for Blob Storage canisters.");
            };
          };
          case _ {};
        };

        switch (args.encryptionPolicy) {
          case (?policy) dir.encryptionPolicy := policy;
          case null {};
        };
        switch (args.thumbnailStoragePolicy) {
          case (?policy) dir.thumbnailStoragePolicy := policy;
          case null {};
        };
        switch (args.thumbnailEncryptionPolicy) {
          case (?policy) dir.thumbnailEncryptionPolicy := policy;
          case null {};
        };

        dir.defaultEncryptionMode := resolveDirectoryEncryptionMode(self, node);
        dir.defaultThumbnailStorageBackend := resolveThumbnailStorageBackend(self, storageBackendType, node);
        #ok node;
      };
      case (#File(_)) #err(ErrorMessages.badArgs());
    };
  };
};
