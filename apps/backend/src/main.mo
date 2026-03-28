import Error "mo:core/Error";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Timer "mo:core/Timer";

import Liminal "mo:liminal";
import ZenDB "mo:zendb";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";

import StorageDeployerOrchestrator "StorageDeployer";

import AdminMixin "AdminManager/mixin";
import KnownWasmHashesMixin "KnownWasmHashes/mixin";
import UsersMixin "Users/mixin";
import ProfilesMixin "Profiles/mixin";
import NotificationsMixin "Notifications/mixin";
import SubscriptionsMixin "Subscriptions/mixin";

import Types "Types";

shared ({ caller = installer }) persistent actor class Rabbithole(initArgs : Types.InitArgs) = self {
  let canisterId = Principal.fromActor(self);

  // --- Assets & HTTP ---

  var assetStableData = HttpAssets.init_stable_store(canisterId, installer);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  transient var assetStore = HttpAssets.Assets(assetStableData, null);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // --- Database ---

  let zendb = ZenDB.newStableStore(null);
  transient let db = ZenDB.launchDefaultDB(zendb);

  // --- Storage Deployer ---

  let defaultGithub : Types.GithubOptions = {
    apiUrl = "https://api.github.com";
    owner = "rabbithole-app";
    repo = "v2";
    token = null;
  };

  let storageOrchestrator = StorageDeployerOrchestrator.new({
    github = Option.get(initArgs.github, defaultGithub);
    assets = [(#LatestDraft, [#StorageWASM("encrypted-storage.wasm.gz"), #StorageFrontend("storage-frontend.tar")])];
  });
  storageOrchestrator.canisterId := ?canisterId;

  // --- Mixins (order matters: dependencies first) ---

  include AdminMixin(installer);
  include KnownWasmHashesMixin();
  include ProfilesMixin(
    db,
    installer,
    func(key : Text) { if (assetStore.exists(key)) assetCanister.delete_asset(canisterId, { key }) },
    func(caller : Principal, args : HttpAssets.StoreArgs) { assetCanister.store(caller, args) },
  );
  include UsersMixin(db, resolveReferralCode);
  include NotificationsMixin();
  include SubscriptionsMixin(
    db,
    func(cId : Principal) : ?Principal = StorageDeployerOrchestrator.findOwnerByCanister(storageOrchestrator, cId),
    isKnownWasm,
    assertAdmin,
  );

  // --- Storage Deployer Helpers ---

  func handleAssetDownloaded(details : StorageDeployerOrchestrator.DownloadDetails) {
    if (Text.contains(details.name, #text ".wasm")) {
      registerWasmHash(details.sha256, details.key);
    };
  };

  transient let startCallbacks : StorageDeployerOrchestrator.StartCallbacks = {
    onAssetDownloaded = ?handleAssetDownloaded;
  };

  func syncLatestWasmHash() {
    switch (StorageDeployerOrchestrator.getLatestWasmHash(storageOrchestrator)) {
      case (?(hash, tag)) registerWasmHash(hash, tag);
      case null {};
    };
  };

  // --- System lifecycle ---

  system func preupgrade() {
    StorageDeployerOrchestrator.stop<system>(storageOrchestrator);
  };

  ignore Timer.setTimer<system>(
    #seconds 0,
    func() : async () {
      await StorageDeployerOrchestrator.start<system>(storageOrchestrator, startCallbacks);
      syncLatestWasmHash();
    },
  );

  ignore Timer.recurringTimer<system>(#seconds(86400), func() : async () {
    let expiredUsers = expireOverdueSubscriptions();
    for (userId in expiredUsers.vals()) {
      notifyUser(userId, #subscriptionExpired);
    };
    syncLatestWasmHash();
  });

  // --- Storage Deployer API ---

  public shared ({ caller }) func createStorage(
    options : StorageDeployerOrchestrator.CreateStorageOptions,
  ) : async Result.Result<(), StorageDeployerOrchestrator.CreateStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.createStorage<system>(storageOrchestrator, caller, options);
  };

  public query ({ caller }) func listStorages() : async [StorageDeployerOrchestrator.StorageInfo] {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.listStorages(storageOrchestrator, caller);
  };

  public shared ({ caller }) func addStorage(
    canisterId : Principal,
    initArg : Blob,
  ) : async Result.Result<Nat, StorageDeployerOrchestrator.AddStorageError> {
    assert not Principal.isAnonymous(caller);
    await StorageDeployerOrchestrator.addStorage(storageOrchestrator, caller, canisterId, initArg, isKnownWasm);
  };

  public shared ({ caller }) func deleteStorage(storageId : Nat) : async Result.Result<(), StorageDeployerOrchestrator.DeleteStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.deleteStorage(storageOrchestrator, caller, storageId);
  };

  public shared ({ caller }) func upgradeStorage(
    canisterId : Principal,
  ) : async Result.Result<(), StorageDeployerOrchestrator.UpgradeStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.upgradeStorage<system>(storageOrchestrator, caller, canisterId);
  };

  public query func checkStorageUpdate(canisterId : Principal) : async ?StorageDeployerOrchestrator.UpdateInfo {
    StorageDeployerOrchestrator.checkStorageUpdate(storageOrchestrator, canisterId);
  };

  public shared ({ caller }) func startStorageDeployer() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.start<system>(storageOrchestrator, startCallbacks);
  };

  public shared ({ caller }) func stopStorageDeployer() : async () {
    assertAdmin(caller);
    StorageDeployerOrchestrator.stop<system>(storageOrchestrator);
  };

  public query func isStorageDeployerRunning() : async Bool {
    StorageDeployerOrchestrator.isRunning(storageOrchestrator);
  };

  /// Register the latest downloaded WASM hash as known.
  /// Called after release download completes to make hash available for addStorage verification.
  public shared ({ caller }) func registerLatestWasmHash() : async () {
    assertAdmin(caller);
    syncLatestWasmHash();
  };

  // --- Storage Canister Callbacks ---

  /// Called by storage canister when cycle balance is low.
  /// Caller must be the storage canister itself (canisterId == caller).
  public shared ({ caller }) func onStorageLowCycles(
    balance : Nat,
    daysLeft : Nat,
    severity : { #warning; #critical },
  ) : async () {
    let ?storageOwner = StorageDeployerOrchestrator.findOwnerByCanister(storageOrchestrator, caller) else return;
    notifyUser(storageOwner, #lowCycles({ canisterId = caller; remaining = balance; estimatedDaysLeft = daysLeft; severity }));
  };

  public query func getReleasesFullStatus() : async StorageDeployerOrchestrator.ReleasesFullStatus {
    StorageDeployerOrchestrator.getReleasesFullStatus(storageOrchestrator);
  };

  public shared ({ caller }) func refreshReleases() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.refreshReleases<system>(storageOrchestrator);
  };

  // --- HTTP interface ---

  transient let app = Liminal.App({
    middleware = [
      CORSMiddleware.default(),
      AssetsMiddleware.new({ store = assetStore }),
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

  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public query func http_request_streaming_callback(token : HttpAssets.StreamingToken) : async HttpAssets.StreamingCallbackResponse {
    switch (assetStore.http_request_streaming_callback(token)) {
      case (#err(e)) throw Error.reject(e);
      case (#ok(response)) response;
    };
  };

  assetStore.set_streaming_callback(http_request_streaming_callback);
};
