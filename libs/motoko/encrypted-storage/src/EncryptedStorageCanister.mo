import Array "mo:core/Array";
import Error "mo:core/Error";
import Principal "mo:core/Principal";

import IC "mo:ic";
import MemoryRegion "mo:memory-region/MemoryRegion";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";

import EncryptedStorage "";
import EncryptedStorageClass "Class";
import T "Types";

shared ({ caller = owner }) persistent actor class EncryptedStorageCanister() = this {
  transient let keyId : ManagementCanister.VetKdKeyid = {
    curve = #bls12_381_g2;
    name = "dfx_test_key";
  };
  transient let canisterId = Principal.fromActor(this);

  var versionedStore = EncryptedStorage.initStableStore({
    accountOwner = owner;
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
    backendId = null; // standalone mode — no backend
    storageBackendType = #OnChain;
  });
  versionedStore := EncryptedStorage.upgradeStableStore(versionedStore, { accountOwner = owner; backendId = null });
  transient let storage = EncryptedStorage.fromVersion(versionedStore);
  transient let storageApi = EncryptedStorageClass.Storage(storage, null);

  func isCurrentController(principal : Principal) : async Bool {
    let status = await IC.ic.canister_status({ canister_id = canisterId });
    Array.any(status.settings.controllers, func(controller : Principal) : Bool = Principal.equal(controller, principal));
  };

  public query ({ caller }) func list(entry : ?T.Entry) : async T.ListResponse {
    switch (EncryptedStorage.list(storage, caller, entry)) {
      case (#ok response) response;
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
    switch (await* EncryptedStorage.update(storage, caller, args, null)) {
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
    switch (EncryptedStorage.createBatch(storage, caller, { entry = args.entry; totalSize = 0 }, null)) {
      case (#ok batch) batch;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createChunk(args : T.CreateChunkArguments) : async T.CreateChunkResponse {
    switch (EncryptedStorage.createChunk(storage, caller, args, null)) {
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

  public shared ({ caller }) func rename(args : T.RenameArguments) : async () {
    switch (EncryptedStorage.rename(storage, caller, args)) {
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

  public query ({ caller }) func listOwnerEquivalentPrincipals() : async [T.OwnerEquivalentPrincipal] {
    switch (storageApi.listOwnerEquivalentPrincipals(caller)) {
      case (#ok(items)) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getRecoveryStatus() : async T.RecoveryStatus {
    switch (storageApi.getRecoveryStatus(caller)) {
      case (#ok(status)) status;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func registerRecoveryController(principal : Principal) : async T.RegisterRecoveryControllerResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (Principal.isAnonymous(principal)) {
      throw Error.reject("anonymous principal not allowed");
    };
    if (not (await isCurrentController(principal))) {
      throw Error.reject("principal is not a controller");
    };
    switch (storageApi.registerRecoveryController(caller, principal)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clearRecoveryController() : async Principal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (storageApi.clearRecoveryController(caller)) {
      case (#ok(principal)) principal;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func addRecoveryOwner(principal : Principal, options : T.AddRecoveryOwnerOptions) : async T.OwnerEquivalentPrincipal {
    switch (storageApi.addRecoveryOwner(caller, principal, options)) {
      case (#ok(record)) record;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func takeRecoveryOwnership() : async T.OwnerEquivalentPrincipal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (not (await isCurrentController(caller))) {
      throw Error.reject("caller is not a controller");
    };
    switch (storageApi.takeRecoveryOwnership(caller)) {
      case (#ok(record)) record;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func activateRecoveryOwnership(principal : Principal) : async T.OwnerEquivalentPrincipal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (Principal.isAnonymous(principal)) {
      throw Error.reject("anonymous principal not allowed");
    };
    if (not (await isCurrentController(principal))) {
      throw Error.reject("principal is not a controller");
    };
    switch (storageApi.activateRecoveryOwnership(caller, principal)) {
      case (#ok(record)) record;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func removeRecoveryOwner(principal : Principal) : async () {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (await isCurrentController(principal)) {
      throw Error.reject("principal is still a controller; remove controller first");
    };
    switch (storageApi.removeRecoveryOwner(caller, principal)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createPendingAccessGrant(args : T.CreatePendingAccessGrantArguments) : async T.PendingAccessGrant {
    switch (storageApi.createPendingAccessGrant(caller, args)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createAccessBatch(args : T.CreateAccessBatchArguments) : async T.CreateAccessBatchResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (storageApi.createAccessBatch(caller, args)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func revokeAccessBatch(args : T.RevokeAccessBatchArguments) : async T.RevokeAccessBatchResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (storageApi.revokeAccessBatch(caller, args)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func claimPendingAccessGrant(args : T.ClaimPendingAccessGrantArguments) : async T.PrincipalAccessGrant {
    switch (storageApi.claimPendingAccessGrant(caller, args)) {
      case (#ok(grant)) grant;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func claimPendingAccessByBackendAttestation(args : T.ClaimPendingAccessByBackendAttestationArguments) : async [T.PrincipalAccessGrant] {
    switch (storageApi.claimPendingAccessByBackendAttestation(caller, args)) {
      case (#ok(grants)) grants;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func cancelPendingAccessGrant(args : T.CancelPendingAccessGrantArguments) : async T.PendingAccessGrant {
    switch (storageApi.cancelPendingAccessGrant(caller, args)) {
      case (#ok(grant)) grant;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listPendingAccessGrants() : async [T.PendingAccessGrant] {
    switch (storageApi.listPendingAccessGrants(caller)) {
      case (#ok(items)) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listAccessGrants(args : T.ListAccessGrantsArguments) : async T.AccessGrantList {
    switch (storageApi.listAccessGrants(caller, args)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listStorageEvents(afterId : ?Nat, limit : Nat) : async [T.StoredStorageEvent] {
    switch (storageApi.listStorageEvents(caller, afterId, limit)) {
      case (#ok(events)) events;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listLatestStorageEvents(limit : Nat) : async [T.StoredStorageEvent] {
    switch (storageApi.listLatestStorageEvents(caller, limit)) {
      case (#ok(events)) events;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getStorageEventsUnreadCount() : async Nat {
    switch (storageApi.getStorageEventsUnreadCount(caller)) {
      case (#ok(count)) count;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func markStorageEventsRead(upToEventId : Nat) : async () {
    switch (storageApi.markStorageEventsRead(caller, upToEventId)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func markAllVisibleStorageEventsRead() : async () {
    switch (storageApi.markAllVisibleStorageEventsRead(caller)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createDurableAccessGrant(args : T.CreateDurableAccessGrantArguments) : async T.PrincipalAccessGrant {
    switch (storageApi.createDurableAccessGrant(caller, args)) {
      case (#ok(grant)) grant;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func requestAccess(args : T.CreateAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (storageApi.createAccessRequest(caller, args)) {
      case (#ok(request)) request;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func cancelAccessRequest(args : T.CancelAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (storageApi.cancelAccessRequest(caller, args)) {
      case (#ok(request)) request;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getMyAccessRequest() : async ?T.AccessRequest {
    switch (storageApi.getMyAccessRequest(caller)) {
      case (#ok(request)) request;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func resolveAccessRequest(args : T.ResolveAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (storageApi.resolveAccessRequest(caller, args)) {
      case (#ok(request)) request;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listAccessRequests() : async [T.AccessRequest] {
    switch (storageApi.listAccessRequests(caller)) {
      case (#ok(requests)) requests;
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

  public query ({ caller }) func listVersions(args : T.ListVersionsArguments) : async [T.FileVersionDetails] {
    switch (EncryptedStorage.listVersions(storage, caller, args)) {
      case (#ok items) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func restoreVersion(args : T.RestoreVersionArguments) : async () {
    switch (EncryptedStorage.restoreVersion(storage, caller, args)) {
      case (#ok _) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  /// Get canister module_hash via canister_status.
  /// Only accessible by canister controllers.
  public shared func getModuleHash() : async ?Blob {
    let status = await IC.ic.canister_status({ canister_id = canisterId });
    status.module_hash;
  };
};
