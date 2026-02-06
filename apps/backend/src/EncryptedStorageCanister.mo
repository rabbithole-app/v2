import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Result "mo:core/Result";
import Timer "mo:core/Timer";

import MemoryRegion "mo:memory-region/MemoryRegion";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Liminal "mo:liminal";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";
import Sha256 "mo:sha2/Sha256";
import Json "mo:json";

import EncryptedStorage "mo:encrypted-storage";
import EncryptedStorageMiddleware "mo:encrypted-storage/Middleware";
import T "mo:encrypted-storage/Types";
import Types "Types";

shared ({ caller = installer }) persistent actor class EncryptedStorageCanister(initArgs : Types.EncryptedStorageInitArgs) = this {
  let owner = initArgs.owner;

  let keyId : ManagementCanister.VetKdKeyid = {
    curve = #bls12_381_g2;
    name = initArgs.vetKeyName;
  };
  let canisterId = Principal.fromActor(this);

  // Initialize HttpAssets first to use its certificate store
  var assetStableData = HttpAssets.init_stable_store(canisterId, owner);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  // Extract certificate store from HttpAssets for shared use
  // Use from_version to get the current state
  let httpAssetsState = HttpAssets.from_version(assetStableData);

  // Use shared certificate store from HttpAssets for EncryptedStorage
  var versionedStorage = EncryptedStorage.initStableStore({
    canisterId;
    vetKdKeyId = keyId;
    domainSeparator = "file_storage_dapp";
    region = MemoryRegion.new();
    rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
    certs = ?httpAssetsState.fs.certs;
  });
  versionedStorage := EncryptedStorage.upgradeStableStore(versionedStorage);
  transient let storage = EncryptedStorage.fromVersion(versionedStorage);

  transient var assetStore = HttpAssets.Assets(assetStableData, null);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // Initialize info.json asset with canister ID
  func initInfoJson() : () {
    let infoJson = Json.obj([
      ("id", Json.str(Principal.toText(canisterId))),
    ]);
    let jsonText = Json.stringify(infoJson, null);
    let jsonBlob = Text.encodeUtf8(jsonText);
    let storeArgs : HttpAssets.StoreArgs = {
      key = "/info.json";
      content = jsonBlob;
      sha256 = ?Sha256.fromBlob(#sha256, jsonBlob);
      content_type = "application/json";
      content_encoding = "identity";
      is_aliased = null;
    };
    assetCanister.store(owner, storeArgs);
  };

  initInfoJson();

  // Grant installer Commit permission on assets (if installer != owner)
  // This allows the deployer to upload frontend assets
  func grantInstallerCommitPermission() : async () {
    await* assetCanister.grant_permission(owner, {
      to_principal = installer;
      permission = #Commit;
    });
  };

  if (installer != owner) {
    ignore Timer.setTimer<system>(#seconds 0, grantInstallerCommitPermission);
  };

  // Create the HTTP App with middleware
  transient let app = Liminal.App({
    middleware = [
      // Order matters
      // First middleware will be called FIRST with the HTTP request
      // and LAST with handling the HTTP response
      CORSMiddleware.default(),
      // RouterMiddleware.new(routerConfig),
      AssetsMiddleware.new({
        store = assetStore;
      }),
      EncryptedStorageMiddleware.new({
        store = storage;
      }),
    ];
    errorSerializer = Liminal.defaultJsonErrorSerializer;
    candidRepresentationNegotiator = Liminal.defaultCandidRepresentationNegotiator;
    logger = Liminal.buildDebugLogger(#info);
    urlNormalization = {
      pathIsCaseSensitive = false;
      preserveTrailingSlash = false;
      queryKeysAreCaseSensitive = false;
      removeEmptyPathSegments = true;
      resolvePathDotSegments = true;
      usernameIsCaseSensitive = false;
    };
  });

  // Expose standard HTTP interface
  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public query func http_request_streaming_callback(token : T.StreamingToken) : async T.StreamingCallbackResponse {
    switch (assetStore.http_request_streaming_callback(token)) {
      case (#err _) switch (EncryptedStorage.httpRequestStreamingCallback(storage, token)) {
        case (#ok(response)) response;
        case (#err message) throw Error.reject(message);
      };
      case (#ok(response)) response;
    };
  };

  EncryptedStorage.setStreamingCallback(storage, http_request_streaming_callback);

  public query ({ caller }) func listStorage(entry : ?T.Entry) : async [T.NodeDetails] {
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

  // public shared ({ caller }) func store(args : T.StoreArguments) : async () {
  //   switch (EncryptedStorage.store(storage, caller, args)) {
  //     case (#ok value) value;
  //     case (#err(message)) throw Error.reject(message);
  //   };
  // };

  public shared ({ caller }) func create(args : T.CreateArguments) : async T.NodeDetails {
    switch (EncryptedStorage.create(storage, caller, args)) {
      case (#ok value) value;
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

  public shared ({ caller }) func createStorageBatch(args : T.CreateBatchArguments) : async T.CreateBatchResponse {
    switch (EncryptedStorage.createBatch(storage, caller, args)) {
      case (#ok batch) batch;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared func createStorageChunk(args : T.CreateChunkArguments) : async T.CreateChunkResponse {
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

  public shared ({ caller }) func clearStorage() : async () {
    switch (EncryptedStorage.clear(storage, caller)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func hasStoragePermission(args : T.HasPermissionArguments) : async Bool {
    EncryptedStorage.hasPermission(storage, caller, args);
  };

  public shared ({ caller }) func grantStoragePermission(args : T.GrantPermissionArguments) : async () {
    switch (EncryptedStorage.grantPermission(storage, caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func revokeStoragePermission(args : T.RevokePermissionArguments) : async () {
    switch (EncryptedStorage.revokePermission(storage, caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared query ({ caller }) func getStorageChunk(args : T.GetChunkArguments) : async T.ChunkContent {
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

  /* -------------------------------------------------------------------------- */
  /*                           Asset canister methods                           */
  /* -------------------------------------------------------------------------- */

  assetStore.set_streaming_callback(http_request_streaming_callback);

  public shared query func api_version() : async Nat16 {
    assetCanister.api_version();
  };

  public shared query func get(args : HttpAssets.GetArgs) : async HttpAssets.EncodedAsset {
    assetCanister.get(args);
  };

  public shared query func get_chunk(args : HttpAssets.GetChunkArgs) : async (HttpAssets.ChunkContent) {
    assetCanister.get_chunk(args);
  };

  public shared ({ caller }) func grant_permission(args : HttpAssets.GrantPermission) : async () {
    await* assetCanister.grant_permission(caller, args);
  };

  public shared ({ caller }) func revoke_permission(args : HttpAssets.RevokePermission) : async () {
    await* assetCanister.revoke_permission(caller, args);
  };

  public shared query func list(args : {}) : async [HttpAssets.AssetDetails] {
    assetCanister.list(args);
  };

  public shared ({ caller }) func store(args : HttpAssets.StoreArgs) : async () {
    assetCanister.store(caller, args);
  };

  public shared ({ caller }) func create_asset(args : HttpAssets.CreateAssetArguments) : async () {
    assetCanister.create_asset(caller, args);
  };

  public shared ({ caller }) func set_asset_content(args : HttpAssets.SetAssetContentArguments) : async () {
    await* assetCanister.set_asset_content(caller, args);
  };

  public shared ({ caller }) func unset_asset_content(args : HttpAssets.UnsetAssetContentArguments) : async () {
    assetCanister.unset_asset_content(caller, args);
  };

  public shared ({ caller }) func delete_asset(args : HttpAssets.DeleteAssetArguments) : async () {
    assetCanister.delete_asset(caller, args);
  };

  public shared ({ caller }) func set_asset_properties(args : HttpAssets.SetAssetPropertiesArguments) : async () {
    assetCanister.set_asset_properties(caller, args);
  };

  public shared ({ caller }) func clear(args : HttpAssets.ClearArguments) : async () {
    assetCanister.clear(caller, args);
  };

  public shared ({ caller }) func create_batch(args : {}) : async (HttpAssets.CreateBatchResponse) {
    assetCanister.create_batch(caller, args);
  };

  public shared ({ caller }) func create_chunk(args : HttpAssets.CreateChunkArguments) : async (HttpAssets.CreateChunkResponse) {
    assetCanister.create_chunk(caller, args);
  };

  public shared ({ caller }) func create_chunks(args : HttpAssets.CreateChunksArguments) : async HttpAssets.CreateChunksResponse {
    await* assetCanister.create_chunks(caller, args);
  };

  public shared ({ caller }) func commit_batch(args : HttpAssets.CommitBatchArguments) : async () {
    await* assetCanister.commit_batch(caller, args);
  };

  public shared ({ caller }) func propose_commit_batch(args : HttpAssets.CommitBatchArguments) : async () {
    assetCanister.propose_commit_batch(caller, args);
  };

  public shared ({ caller }) func commit_proposed_batch(args : HttpAssets.CommitProposedBatchArguments) : async () {
    await* assetCanister.commit_proposed_batch(caller, args);
  };

  public shared ({ caller }) func compute_evidence(args : HttpAssets.ComputeEvidenceArguments) : async (?Blob) {
    await* assetCanister.compute_evidence(caller, args);
  };

  public shared ({ caller }) func delete_batch(args : HttpAssets.DeleteBatchArguments) : async () {
    assetCanister.delete_batch(caller, args);
  };

  public shared func list_permitted(args : HttpAssets.ListPermitted) : async ([Principal]) {
    assetCanister.list_permitted(args);
  };

  public shared ({ caller }) func take_ownership() : async () {
    await* assetCanister.take_ownership(caller);
  };

  public shared ({ caller }) func get_configuration() : async (HttpAssets.ConfigurationResponse) {
    assetCanister.get_configuration(caller);
  };

  public shared ({ caller }) func configure(args : HttpAssets.ConfigureArguments) : async () {
    assetCanister.configure(caller, args);
  };

  public shared func certified_tree(args : {}) : async (HttpAssets.CertifiedTree) {
    assetCanister.certified_tree(args);
  };

  public shared func validate_grant_permission(args : HttpAssets.GrantPermission) : async (Result.Result<Text, Text>) {
    assetCanister.validate_grant_permission(args);
  };

  public shared func validate_revoke_permission(args : HttpAssets.RevokePermission) : async (Result.Result<Text, Text>) {
    assetCanister.validate_revoke_permission(args);
  };

  public shared func validate_take_ownership() : async (Result.Result<Text, Text>) {
    assetCanister.validate_take_ownership();
  };

  public shared func validate_commit_proposed_batch(args : HttpAssets.CommitProposedBatchArguments) : async (Result.Result<Text, Text>) {
    assetCanister.validate_commit_proposed_batch(args);
  };

  public shared func validate_configure(args : HttpAssets.ConfigureArguments) : async (Result.Result<Text, Text>) {
    assetCanister.validate_configure(args);
  };

  /* -------------------------------------------------------------------------- */
  /*                             Thumbnails methods                             */
  /* -------------------------------------------------------------------------- */

  public shared ({ caller }) func saveThumbnail(args : Types.SaveThumbnailArguments) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (EncryptedStorage.get(storage, caller, { entry = args.entry })) {
      case (#ok node) {
        let (#File(_)) = node.metadata else throw Error.reject("Directory does not support thumbnails");
        let filename = switch (Text.decodeUtf8(node.keyId.1)) {
          case (?key) key;
          case null node.name;
        };
        let storeArgs : HttpAssets.StoreArgs = {
          key = "/" # Text.join(Iter.fromArray(["static", "thumbnails", Principal.toText(node.keyId.0), filename]), "/");
          content = args.thumbnail.content;
          sha256 = ?Sha256.fromBlob(#sha256, args.thumbnail.content);
          content_type = args.thumbnail.contentType;
          content_encoding = "identity";
          is_aliased = null;
        };
        assetCanister.store(owner, storeArgs);
        let setThumbnailArgs : T.SetThumbnailArguments = {
          entry = args.entry;
          thumbnailKey = ?storeArgs.key;
        };
        switch (EncryptedStorage.setThumbnail(storage, caller, setThumbnailArgs)) {
          case (#ok node) node;
          case (#err message) throw Error.reject(message);
        };
      };
      case (#err message) throw Error.reject(message);
    };
  };
};
