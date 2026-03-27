import Blob "mo:core/Blob";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Time "mo:core/Time";

mixin() {
  public type KnownWasmHash = {
    hash : Blob;
    releaseTag : Text;
    registeredAt : Time.Time;
  };

  let knownHashes = Map.empty<Blob, KnownWasmHash>();

  /// Register a WASM hash as known. Available to other mixins.
  func registerWasmHash(hash : Blob, releaseTag : Text) {
    Map.add(knownHashes, Blob.compare, hash, {
      hash;
      releaseTag;
      registeredAt = Time.now();
    });
  };

  /// Check if a WASM hash is known. Available to other mixins.
  func isKnownWasm(hash : Blob) : Bool {
    Map.containsKey(knownHashes, Blob.compare, hash);
  };

  public query func isKnownWasmHash(hash : Blob) : async Bool {
    Map.containsKey(knownHashes, Blob.compare, hash);
  };

  public query func listKnownWasmHashes() : async [KnownWasmHash] {
    Iter.toArray(Map.values(knownHashes));
  };

};
