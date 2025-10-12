import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import Result "mo:core/Result";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Option "mo:core/Option";
import Nat "mo:core/Nat";
import Array "mo:core/Array";

import Map "mo:map/Map";
import TID "mo:tid";
import Vector "mo:vector";

import StableTID "../StableTID";
import T "../Types";
import Utils "../Utils";
import ErrorMessages "../ErrorMessages";
import Path "../Path";
import Node "Node";
import { findNodeByKeyId } "Common";

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

  public func create(self : Store, owner : Principal, { entry } : T.CreateArguments) : Result.Result<T.NodeStore, Text> {
    switch (findNodeByEntry(self, ?entry)) {
      case null #ok(createPath(self, owner, entry));
      case (?_) #err(ErrorMessages.entryAlreadyExists(entry));
    };
  };

  // func commitBatch(self : Store, operations : [CommitBatchOperation]) {};

  func createPath(self : Store, owner : Principal, (kind, path) : T.Entry) : T.NodeStore {
    let dirnames = Path.normalize(path) |> Text.split(_, #char '/') |> Vector.fromIter<Text>(_);
    let filename : ?Text = if (kind == #File) Vector.removeLast(dirnames) else null;

    var parent : ?T.NodeStore = null;
    var parentId : ?Nat64 = null;
    for (name in Vector.vals(dirnames)) {
      let node = switch (Map.get(self.nodes, hashNodes, (#Directory, parentId, name))) {
        case (?v) v;
        case null switch (createNode(self, (#Directory, parentId, name), owner)) {
          case (#ok v or #err(#AlreadyExists v)) v;
        };
      };
      parent := ?node;
      parentId := ?node.id;
    };
    switch (parent, filename) {
      case (_, ?name) switch (createNode(self, (#File, parentId, name), owner)) {
        case (#ok v or #err(#AlreadyExists v)) v;
      };
      case (?node, null) node;
      case _ Runtime.unreachable();
    };
  };

  func createNode(self : Store, nodeKey : T.NodeKey, owner : Principal) : Result.Result<T.NodeStore, { #AlreadyExists : T.NodeStore }> {
    switch (Map.get(self.nodes, hashNodes, nodeKey)) {
      case (?v) #err(#AlreadyExists v);
      case null {
        let tid = StableTID.next(self.tid);
        let node = Node.new(nodeKey, owner, tid);
        ignore Map.put(self.nodes, hashNodes, nodeKey, node);
        #ok node;
      };
    };
  };

  public func delete(self : Store, { entry; recursive } : T.DeleteArguments) : Result.Result<?T.NodeStore, Text> {
    let ?nodeKey = findKeyByEntry(self, ?entry) else return #err(ErrorMessages.entryNotFound(entry));
    deleteNode(self, nodeKey, recursive) |> Result.mapErr<?T.NodeStore, { #NotFound; #NotEmpty }, Text>(
      _,
      func e = switch e {
        case (#NotFound) ErrorMessages.entryNotFound(entry);
        case (#NotEmpty) ErrorMessages.directoryNotEmpty(entry.1);
      },
    );
  };

  func deleteNode(self : Store, nodeKey : T.NodeKey, recursive : Bool) : Result.Result<?T.NodeStore, { #NotFound; #NotEmpty }> {
    let ?node = Map.get(self.nodes, hashNodes, nodeKey) else return #err(#NotFound);
    let notEmpty = not recursive and hasChildren(self, node.id);

    if (notEmpty) return #err(#NotEmpty);

    switch (nodeKey) {
      case (#File, _, _) {};
      case (#Directory, _, name) {
        if (recursive) {
          let iter = listByParentId(self, ?node.id) |> Iter.fromArray _;
          for (subnode in iter) {
            ignore deleteNode(self, (#Directory, ?node.id, subnode.name), true);
          };
        };
      };
    };

    let removed = Map.remove(self.nodes, hashNodes, nodeKey);

    #ok removed;
  };

  public func move(self : Store, source : T.Entry, optTarget : ?T.Entry) : Result.Result<(), Text> {
    let ?sourceNode = findNodeByEntry(self, ?source) else return #err(ErrorMessages.sourceNotFound(source));
    // let ?targetNode =  else return #err(ErrorMessages.targetNotFound(target));

    switch (sourceNode, optTarget, findNodeByEntry(self, optTarget)) {
      case ({ metadata = #Directory(_) }, _, ?{ metadata = #File(_) }) return #err(ErrorMessages.badArgs());
      case (_, ?target, null) return #err(ErrorMessages.targetNotFound(target));
      case (_, _, ?{ id }) moveNode(self, sourceNode, ?id);
      case (_, null, null) moveNode(self, sourceNode, null);
    };

    #ok;
  };

  func moveNode(self : Store, node : T.NodeStore, newParentId : ?Nat64) {
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
              moveNode(self, children, ?v.id);
            };
          };
        };

        v.parentId := newParentId;
        Node.merge(v, node);
      };
      case null {
        node.parentId := newParentId;
        Node.copy(node);
      };
    };
    Map.set(self.nodes, hashNodes, newEntry, updatedNode);
    Map.delete(self.nodes, hashNodes, oldEntry);
  };

  public func clear(self : Store) {
    Map.clear(self.nodes);
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
};
