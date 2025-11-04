import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Array "mo:core/Array";

import MemoryRegion "mo:memory-region/MemoryRegion";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";

import EncryptedStorage "";
import T "Types";

shared ({ caller = owner }) persistent actor class EncryptedStorageCanister() = this {
  let keyId : ManagementCanister.VetKdKeyid = {
    curve = #bls12_381_g2;
    name = "dfx_test_key";
  };
  let canisterId = Principal.fromActor(this);
  let storage = EncryptedStorage.new({
    canisterId;
    vetKdKeyId = keyId;
    domainSeparator = "file_storage_dapp";
    region = MemoryRegion.new();
    rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
    // If you are going to use HttpAssets, initialize it before EncryptedStorage,
    // and use httpAssetsState.fs.certs as the value for certs:
    // ```motoko
    // var assetStableData = HttpAssets.init_stable_store(canisterId, owner);
    // assetStableData := HttpAssets.upgrade_stable_store(assetStableData);
    // let httpAssetsState = HttpAssets.from_version(assetStableData);
    // certs = ?httpAssetsState.fs.certs;
    // ```
    // Otherwise, use null.
    certs = null;
  });

  public query ({ caller }) func list(entry : ?T.Entry) : async [T.NodeDetails] {
    switch (EncryptedStorage.list(storage, caller, entry)) {
      case (#ok items) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func listPermitted(entry : ?T.Entry) : async [(Principal, T.PermissionExt)] {
    switch (await* EncryptedStorage.listPermitted(storage, caller, entry)) {
      case (#ok items) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func store(args : T.StoreArguments) : async () {
    switch (EncryptedStorage.store(storage, caller, args)) {
      case (#ok value) value;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func create(args : T.CreateArguments) : async T.NodeDetails {
    switch (EncryptedStorage.create(storage, caller, args)) {
      case (#ok node) node;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func update(args : T.UpdateArguments) : async () {
    switch (await* EncryptedStorage.update(storage, caller, args)) {
      case (#ok _) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func delete(args : T.DeleteArguments) : async () {
    switch (EncryptedStorage.delete(storage, caller, args)) {
      case (#ok _) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createBatch(args : T.CreateArguments) : async T.CreateBatchResponse {
    switch (EncryptedStorage.createBatch(storage, caller, args)) {
      case (#ok batch) batch;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared func createChunk(args : T.CreateChunkArguments) : async T.CreateChunkResponse {
    switch (EncryptedStorage.createChunk(storage, args)) {
      case (#ok chunk) chunk;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func move(args : T.MoveArguments) : async () {
    switch (EncryptedStorage.move(storage, caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clear() : async () {
    switch (EncryptedStorage.clear(storage, caller)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func hasPermission(args : T.HasPermissionArguments) : async Bool {
    EncryptedStorage.hasPermission(storage, caller, args);
  };

  public shared ({ caller }) func grantPermission(args : T.GrantPermissionArguments) : async () {
    switch (EncryptedStorage.grantPermission(storage, caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func revokePermission(args : T.RevokePermissionArguments) : async () {
    switch (EncryptedStorage.revokePermission(storage, caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared query ({ caller }) func getChunk(args : T.GetChunkArguments) : async T.ChunkContent {
    switch (EncryptedStorage.getChunk(storage, caller, args)) {
      case (#ok chunk) chunk;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared func getVetkeyVerificationKey() : async T.VetKeyVerificationKey {
    await EncryptedStorage.getVetkeyVerificationKey(storage);
  };

  public shared ({ caller }) func getEncryptedVetkey(keyId : T.KeyId, transportKey : T.TransportKey) : async T.VetKey {
    let result = await EncryptedStorage.getEncryptedVetkey(storage, caller, keyId, transportKey);
    switch (result) {
      case (#ok vetKey) vetKey;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func showTree(entry : ?T.Entry) : async Text {
    switch (EncryptedStorage.showTree(storage, caller, entry)) {
      case (#ok chunk) chunk;
      case (#err message) throw Error.reject(message);
    };
  };

  public query ({ caller }) func fsTree() : async [T.TreeNode] {
    switch (EncryptedStorage.fsTree(storage, caller)) {
      case (#ok tree) tree;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func setThumbnail(args : T.SetThumbnailArguments) : async T.NodeDetails {
    switch (EncryptedStorage.setThumbnail(storage, caller, args)) {
      case (#ok node) node;
      case (#err message) throw Error.reject(message);
    };
  };
};
