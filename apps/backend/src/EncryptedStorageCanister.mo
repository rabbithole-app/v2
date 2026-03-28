import Cycles "mo:core/Cycles";
import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Result "mo:core/Result";
import Timer "mo:core/Timer";

import IC "mo:ic";
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
import EncryptedStorageClass "mo:encrypted-storage/Class";
import EncryptedStorageMiddleware "mo:encrypted-storage/Middleware";
import T "mo:encrypted-storage/Types";
import SubscriptionGate "SubscriptionGate";
import HttpAssetsMixin "HttpAssetsMixin";

shared ({ caller = installer }) persistent actor class EncryptedStorageCanister(initArgs : {
    owner : Principal;
    vetKeyName : Text;
    backendId : Principal;
  }) = this {
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
  let httpAssetsState = HttpAssets.from_version(assetStableData);

  // Use shared certificate store from HttpAssets for EncryptedStorage
  var versionedStorage = EncryptedStorage.initStableStore({
    canisterId;
    vetKdKeyId = keyId;
    domainSeparator = "file_storage_dapp";
    region = MemoryRegion.new();
    rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
    certs = ?httpAssetsState.fs.certs;
    backendId = ?initArgs.backendId;
  });
  versionedStorage := EncryptedStorage.upgradeStableStore(versionedStorage, {
    backendId = ?initArgs.backendId;
  });
  transient let storage = EncryptedStorage.fromVersion(versionedStorage);

  // Create class wrapper with subscription gates
  transient let es = EncryptedStorageClass.Storage(storage, ?{
    canUploadEncrypted = func(bytes : Nat) : Result.Result<(), Text> = SubscriptionGate.canUploadEncrypted(storage, bytes);
    canUseEncryption = func() : Result.Result<(), Text> = SubscriptionGate.canUseEncryption(storage);
  });

  // Reset cached module hash on upgrade (body re-executes for persistent actor class)
  storage.cachedModuleHash := null;

  // Populate cachedIdleBurnPerDay at startup so cycle monitoring works immediately
  ignore Timer.setTimer<system>(
    #seconds 0,
    func() : async () {
      let status = await IC.ic.canister_status({ canister_id = canisterId });
      storage.cachedIdleBurnPerDay := ?status.idle_cycles_burned_per_day;
    },
  );


  // Fire-and-forget low-cycles notification to backend
  func reportLowCyclesIfNeeded<system>() : () {
    switch (SubscriptionGate.checkCyclesOnUpdate(storage)) {
      case (?alert) {
        let ?bid = storage.backendId else return;
        let backend : actor {
          onStorageLowCycles : (Nat, Nat, { #warning; #critical }) -> async ();
        } = actor (Principal.toText(bid));
        ignore Timer.setTimer<system>(
          #seconds 0,
          func() : async () {
            try {
              await backend.onStorageLowCycles(alert.balance, alert.daysLeft, alert.severity);
            } catch _ {};
          },
        );
      };
      case null {};
    };
  };

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
      CORSMiddleware.default(),
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
      case (#err _) switch (es.httpRequestStreamingCallback(token)) {
        case (#ok(response)) response;
        case (#err message) throw Error.reject(message);
      };
      case (#ok(response)) response;
    };
  };

  es.setStreamingCallback(http_request_streaming_callback);

  public query ({ caller }) func listStorage(entry : ?T.Entry) : async T.ListResponse {
    switch (es.list(caller, entry)) {
      case (#ok response) response;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func listPermitted(entry : ?T.Entry) : async [(Principal, T.PermissionExt)] {
    switch (await* es.listPermitted(caller, entry)) {
      case (#ok items) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func create(args : T.CreateArguments) : async T.NodeDetails {
    switch (es.create(caller, args)) {
      case (#ok value) { reportLowCyclesIfNeeded<system>(); value };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func update(args : T.UpdateArguments) : async () {
    switch (await* es.update(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func delete(args : T.DeleteArguments) : async () {
    switch (es.delete(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createStorageBatch(args : T.CreateBatchArguments) : async T.CreateBatchResponse {
    switch (es.createBatch(caller, args)) {
      case (#ok batch) batch;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createStorageChunk(args : T.CreateChunkArguments) : async T.CreateChunkResponse {
    switch (es.createChunk(caller, args)) {
      case (#ok chunk) chunk;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func move(args : T.MoveArguments) : async () {
    switch (es.move(caller, args)) {
      case (#ok) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func rename(args : T.RenameArguments) : async () {
    switch (es.rename(caller, args)) {
      case (#ok) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clearStorage() : async () {
    switch (es.clear(caller)) {
      case (#ok) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func hasStoragePermission(args : T.HasPermissionArguments) : async Bool {
    es.hasPermission(caller, args);
  };

  public shared ({ caller }) func grantStoragePermission(args : T.GrantPermissionArguments) : async () {
    switch (es.grantPermission(caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func revokeStoragePermission(args : T.RevokePermissionArguments) : async () {
    switch (es.revokePermission(caller, args)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared query ({ caller }) func getStorageChunk(args : T.GetChunkArguments) : async T.ChunkContent {
    switch (es.getChunk(caller, args)) {
      case (#ok chunk) chunk;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared func getVetkeyVerificationKey() : async T.VetKeyVerificationKey {
    // Inlined: avoid module-level async self-call
    await ManagementCanister.vetKdPublicKey(?storage.canisterId, storage.domainSeparatorBytes, storage.vetKdKeyId);
  };

  public shared ({ caller }) func getEncryptedVetkey(keyId : T.KeyId, transportKey : T.TransportKey) : async T.VetKey {
    // Subscription gate: refresh cache if stale, then check decrypt permission
    switch (await* SubscriptionGate.ensureSubscription(storage)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok _) {};
    };
    switch (SubscriptionGate.canDecrypt(storage, caller, owner)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok) {};
    };

    // Inlined: avoid module-level async self-call from EncryptedStorage.getEncryptedVetkey
    switch (es.validateVetkeyAccess(caller, keyId)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok(input)) {
        await ManagementCanister.vetKdDeriveKey(input, storage.domainSeparatorBytes, storage.vetKdKeyId, transportKey);
      };
    };
  };

  public query ({ caller }) func showTree(entry : ?T.Entry) : async Text {
    switch (es.showTree(caller, entry)) {
      case (#ok chunk) chunk;
      case (#err message) throw Error.reject(message);
    };
  };

  public query ({ caller }) func fsTree() : async [T.TreeNode] {
    switch (es.fsTree(caller)) {
      case (#ok tree) tree;
      case (#err message) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listStorageVersions(args : T.ListVersionsArguments) : async [T.FileVersionDetails] {
    switch (es.listVersions(caller, args)) {
      case (#ok items) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func restoreStorageVersion(args : T.RestoreVersionArguments) : async () {
    switch (es.restoreVersion(caller, args)) {
      case (#ok _) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  /* -------------------------------------------------------------------------- */
  /*                           Asset canister methods                           */
  /* -------------------------------------------------------------------------- */

  assetStore.set_streaming_callback(http_request_streaming_callback);

  include HttpAssetsMixin(assetCanister);

  /* -------------------------------------------------------------------------- */
  /*                             Thumbnails methods                             */
  /* -------------------------------------------------------------------------- */

  public shared ({ caller }) func saveThumbnail(args : { entry : T.Entry; thumbnail : { content : Blob; contentType : Text } }) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.get(caller, { entry = args.entry })) {
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
        switch (es.setThumbnail(caller, setThumbnailArgs)) {
          case (#ok node) node;
          case (#err message) throw Error.reject(message);
        };
      };
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func refreshSubscription() : async () {
    assert Principal.equal(caller, owner) or Principal.equal(caller, canisterId) or Principal.isController(caller);
    switch (await* SubscriptionGate.ensureSubscription(storage)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok _) {};
    };
  };

  public query func getCycleBalance() : async Nat {
    Cycles.balance();
  };

  public query func getStatus() : async T.StorageStatus {
    es.getStatus(Cycles.balance());
  };

  /// Get canister module_hash via canister_status.
  /// Only accessible by canister controllers.
  public shared func getModuleHash() : async ?Blob {
    let status = await IC.ic.canister_status({ canister_id = canisterId });
    status.module_hash;
  };
};
