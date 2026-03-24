import Blob "mo:core/Blob";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import { Tuple2 } "mo:core/Tuples";

import Map "mo:map/Map";

import T "../Types";

module Common {
  func keyIdEqual(a : T.KeyId, b : T.KeyId) : Bool = Tuple2.equal(a, b, Principal.equal, Blob.equal);

  public func findNodeByKeyId(fs : T.FileSystemStore, keyId : T.KeyId) : ?T.NodeStore {
    Map.find(fs.nodes, func(_, value) = keyIdEqual(value.keyId, keyId)) |> Option.map(_, func(k, v) = v);
  };

  public func findNodeById(fs : T.FileSystemStore, parentId : Nat64) : ?T.NodeStore {
    Map.find(fs.nodes, func(_, value) = Nat64.equal(value.id, parentId)) |> Option.map(_, func(k, v) = v);
  };

  public func findRootAncestor(fs : T.FileSystemStore, node : T.NodeStore) : T.NodeStore {
    switch (node.parentId) {
      case null node;
      case (?pid) {
        switch (findNodeById(fs, pid)) {
          case (?parent) findRootAncestor(fs, parent);
          case null node;
        };
      };
    };
  };
};
