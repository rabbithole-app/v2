import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Cycles "mo:core/Cycles";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
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
import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import EncryptedStorage "mo:encrypted-storage";
import EncryptedStorageClass "mo:encrypted-storage/Class";
import EncryptedStorageMiddleware "mo:encrypted-storage/Middleware";
import T "mo:encrypted-storage/Types";
import SubscriptionGate "SubscriptionGate";
import HttpAssetsMixin "HttpAssetsMixin";
import IdentityVerification "IdentityVerification/lib";
import IdentityVerificationMixin "IdentityVerification/mixin";
import StorageIdentityHandler "IdentityVerification/StorageHandler";
import StorageAccessClient "StorageAccessBridge/StorageClient";
import Utils "Utils/lib";

shared ({ caller = installer }) persistent actor class EncryptedStorageCanister(initArgs : {
    owner : Principal;
    storageBackendType : ?T.StorageBackend;
  }) = this {
  let owner = initArgs.owner;

  // Dynamic storage deployments receive these through canister settings
  // environment_variables, not through the install arg.
  transient let vetKeyName = Utils.envText<system>("VETKEY_NAME", "key_1");
  transient let backendId : ?Principal = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-backend")) {
    case (?id) ?Principal.fromText(id);
    case null null;
  };

  transient let keyId : ManagementCanister.VetKdKeyid = {
    curve = #bls12_381_g2;
    name = vetKeyName;
  };
  let canisterId = Principal.fromActor(this);

  var pendingStorageAccessEnvelopes : [StorageAccessClient.Envelope] = [];

  // Initialize HttpAssets first to use its certificate store
  var assetStableData = HttpAssets.init_stable_store(canisterId, owner);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  // Extract certificate store from HttpAssets for shared use
  let httpAssetsState = HttpAssets.from_version(assetStableData);

  // Use shared certificate store from HttpAssets for EncryptedStorage
  var versionedStorage = EncryptedStorage.initStableStore({
    accountOwner = owner;
    canisterId;
    vetKdKeyId = keyId;
    domainSeparator = "file_storage_dapp";
    region = MemoryRegion.new();
    rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
    certs = ?httpAssetsState.fs.certs;
    backendId;
    storageBackendType = switch (initArgs.storageBackendType) {
      case (?t) t;
      case null #BlobStorage;
    };
  });
  versionedStorage := EncryptedStorage.upgradeStableStore(versionedStorage, {
    accountOwner = owner;
    backendId;
  });
  transient let storage = EncryptedStorage.fromVersion(versionedStorage);

  func enqueueStorageAccessChanged(event : T.StoredStorageEvent) : () {
    pendingStorageAccessEnvelopes := StorageAccessClient.append(
      pendingStorageAccessEnvelopes,
      StorageAccessClient.toEnvelope(owner, canisterId, event),
    );
  };

  func drainStorageAccessChangedQueue() : async () {
    if (pendingStorageAccessEnvelopes.size() == 0) return;
    let batch = pendingStorageAccessEnvelopes;
    pendingStorageAccessEnvelopes := [];
    let failed = await StorageAccessClient.dispatch(storage.backendId, batch);
    if (failed.size() > 0) {
      pendingStorageAccessEnvelopes := StorageAccessClient.prependAll(failed, pendingStorageAccessEnvelopes);
    };
  };

  // Create class wrapper with subscription gates
  transient let es = EncryptedStorageClass.Storage(storage, ?{
    canUploadEncrypted = func(bytes : Nat) : Result.Result<(), Text> = SubscriptionGate.canUploadEncrypted(storage, bytes);
    canUseEncryption = func() : Result.Result<(), Text> = SubscriptionGate.canUseEncryption(storage);
    refreshSubscription = func() : async* Result.Result<T.SubscriptionStatus, Text> {
      await* SubscriptionGate.ensureSubscription(storage, true);
    };
    onAccessChanged = ?enqueueStorageAccessChanged;
  });

  func classifyStorageError(message : Text) : T.StorageErrorCode {
    if (Text.startsWith(message, #text "permission denied:")) return #PermissionDenied;
    if (Text.startsWith(message, #text "Insufficient storage canister cycles:")) return #InsufficientCycles;
    if (Text.contains(message, #text "not found")) return #NotFound;
    if (Text.contains(message, #text "already exists")) return #Conflict;
    if (Text.contains(message, #text "Maximum number")) return #QuotaExceeded;
    if (
      Text.contains(message, #text "Invalid") or
      Text.contains(message, #text "Expected") or
      Text.contains(message, #text "out of bounds")
    ) return #Validation;
    #Internal;
  };

  func storageError(message : Text) : T.StorageError {
    {
      code = classifyStorageError(message);
      message;
    };
  };

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

  func isCurrentController(principal : Principal) : async Bool {
    let status = await IC.ic.canister_status({ canister_id = canisterId });
    Array.any(status.settings.controllers, func(controller : Principal) : Bool = Principal.equal(controller, principal));
  };


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

  func ensureOnChainUploadCycles<system>(totalSize : Nat) : async* Result.Result<(), Text> {
    switch (es.getStorageBackendType()) {
      case (#BlobStorage) return #ok;
      case (#OnChain) {};
    };

    let ?bid = storage.backendId else {
      return #err("Insufficient storage canister cycles: backendId not set");
    };

    let backend : actor {
      ensureStorageCyclesForUpload : (Nat, Nat) -> async Result.Result<{ cyclesAdded : ?Nat; requiredBalance : Nat }, Text>;
    } = actor (Principal.toText(bid));

    try {
      switch (await backend.ensureStorageCyclesForUpload(Cycles.balance(), totalSize)) {
        case (#ok _) #ok;
        case (#err(message)) #err("Insufficient storage canister cycles: " # message);
      };
    } catch (e) {
      #err("Insufficient storage canister cycles: auto top-up failed: " # Error.message(e));
    };
  };

  func resolveExpectedStorageIdentityOrigin<system>() : Text {
    switch (Runtime.envVar<system>("PUBLIC_AUTH_EXPECTED_ORIGIN")) {
      case (?origin) return origin;
      case null {};
    };
    "https://" # Principal.toText(canisterId) # ".icp0.io";
  };

  func resolveTrustedIdentitySigner<system>() : Principal {
    Principal.fromText(Utils.envText<system>("PUBLIC_CANISTER_ID:internet_identity_backend", "rdmx6-jaaaa-aaaaa-aaadq-cai"));
  };

  include IdentityVerificationMixin({
    onVerifiedAttributes = func(caller : Principal, attrs : IdentityVerification.VerifiedIdentityAttributes) : async Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
      let result = await StorageIdentityHandler.onVerifiedAttributes(
        {
          emailCommitment = func(email : Text) : Blob = EncryptedStorage.emailCommitment(storage, email);
          claimByEmailCommitments = func(principal : Principal, commitments : [Blob]) : Result.Result<[T.PrincipalAccessGrant], Text> {
            es.claimPendingAccessByVerifiedAttributes(principal, { emailCommitments = commitments });
          };
          afterClaim = drainStorageAccessChangedQueue;
        },
        caller,
        attrs,
      );
      switch (result) {
        case (#ok) {
          ignore es.recordOwnerActivity(caller, { origin = #storage });
          await drainStorageAccessChangedQueue();
          #ok;
        };
        case (#err(error)) #err(error);
      };
    };
    resolveTrustedIdentitySigner;
    resolveExpectedIdentityOrigin = resolveExpectedStorageIdentityOrigin;
  });

  transient let installerAssetPermissions : ?HttpAssets.SetPermissions =
    if (installer == owner) {
      null;
    } else {
      ?{
        prepare = [];
        commit = [installer];
        manage_permissions = [];
      };
    };
  transient var assetStore = HttpAssets.Assets(assetStableData, installerAssetPermissions);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // Initialize info.json asset with canister ID
  func initInfoJson<system>() : () {
    let storageBackendType = switch (es.getStorageBackendType()) {
      case (#BlobStorage) "BlobStorage";
      case (#OnChain) "OnChain";
    };
    let rabbitholeBackendCanisterId = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-backend")) {
      case (?value) Json.str(value);
      case null Json.nullable();
    };
    let rabbitholeFrontendCanisterId = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-frontend")) {
      case (?value) Json.str(value);
      case null Json.nullable();
    };
    let internetIdentityFrontendCanisterId = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:internet_identity_frontend")) {
      case (?value) Json.str(value);
      case null Json.nullable();
    };
    let infoJson = Json.obj([
      ("canisterId", Json.str(Principal.toText(canisterId))),
      ("rabbitholeBackendCanisterId", rabbitholeBackendCanisterId),
      ("rabbitholeFrontendCanisterId", rabbitholeFrontendCanisterId),
      ("internetIdentityFrontendCanisterId", internetIdentityFrontendCanisterId),
      ("storageBackendType", Json.str(storageBackendType)),
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

  initInfoJson<system>();

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

  public shared ({ caller }) func create(args : T.CreateArguments) : async T.StorageResult<T.NodeDetails> {
    switch (es.create(caller, args)) {
      case (#ok value) { reportLowCyclesIfNeeded<system>(); #ok value };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func update(args : T.UpdateArguments) : async T.StorageResult<()> {
    switch (await* es.update(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>(); #ok };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func updateDirectoryPolicy(args : T.UpdateDirectoryPolicyArguments) : async T.StorageResult<T.NodeDetails> {
    switch (es.updateDirectoryPolicy(caller, args)) {
      case (#ok value) { reportLowCyclesIfNeeded<system>(); #ok value };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func delete(args : T.DeleteArguments) : async () {
    switch (es.delete(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createStorageBatch(args : T.CreateBatchArguments) : async T.StorageResult<T.CreateBatchResponse> {
    switch (await* es.createBatch(caller, args)) {
      case (#err message) #err(storageError(message));
      case (#ok response) {
        switch (await* ensureOnChainUploadCycles<system>(args.totalSize)) {
          case (#err message) {
            ignore es.rollbackBatch(caller, response.batchId);
            #err(storageError(message));
          };
          case (#ok) #ok response;
        };
      };
    };
  };

  public shared ({ caller }) func createStorageChunk(args : T.CreateChunkArguments) : async T.StorageResult<T.CreateChunkResponse> {
    switch (es.createChunk(caller, args)) {
      case (#ok response) {
        reportLowCyclesIfNeeded<system>();
        #ok response;
      };
      case (#err message) #err(storageError(message));
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

  public query ({ caller }) func listOwnerEquivalentPrincipals() : async [T.OwnerEquivalentPrincipal] {
    switch (es.listOwnerEquivalentPrincipals(caller)) {
      case (#ok(items)) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getRecoveryStatus() : async T.RecoveryStatus {
    switch (es.getRecoveryStatus(caller)) {
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
    switch (es.registerRecoveryController(caller, principal)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clearRecoveryController() : async Principal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.clearRecoveryController(caller)) {
      case (#ok(principal)) {
        await drainStorageAccessChangedQueue();
        principal;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func addRecoveryOwner(principal : Principal, options : T.AddRecoveryOwnerOptions) : async T.OwnerEquivalentPrincipal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.addRecoveryOwner(caller, principal, options)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
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
    switch (es.takeRecoveryOwnership(caller)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
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
    switch (es.activateRecoveryOwnership(caller, principal)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
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
    switch (es.removeRecoveryOwner(caller, principal)) {
      case (#ok) { await drainStorageAccessChangedQueue() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createPendingAccessGrant(args : T.CreatePendingAccessGrantArguments) : async T.PendingAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createPendingAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createAccessBatch(args : T.CreateAccessBatchArguments) : async T.CreateAccessBatchResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createAccessBatch(caller, args)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func revokeAccessBatch(args : T.RevokeAccessBatchArguments) : async T.RevokeAccessBatchResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.revokeAccessBatch(caller, args)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func claimPendingAccessGrant(args : T.ClaimPendingAccessGrantArguments) : async T.PrincipalAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.claimPendingAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func claimPendingAccessByBackendAttestation(args : T.ClaimPendingAccessByBackendAttestationArguments) : async [T.PrincipalAccessGrant] {
    switch (es.claimPendingAccessByBackendAttestation(caller, args)) {
      case (#ok(grants)) {
        await drainStorageAccessChangedQueue();
        grants;
      };
      case (#err(message)) {
        throw Error.reject(message);
      };
    };
  };

  public shared ({ caller }) func cancelPendingAccessGrant(args : T.CancelPendingAccessGrantArguments) : async T.PendingAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.cancelPendingAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listPendingAccessGrants() : async [T.PendingAccessGrant] {
    switch (es.listPendingAccessGrants(caller)) {
      case (#ok(items)) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listAccessGrants(args : T.ListAccessGrantsArguments) : async T.AccessGrantList {
    switch (es.listAccessGrants(caller, args)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createDurableAccessGrant(args : T.CreateDurableAccessGrantArguments) : async T.PrincipalAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createDurableAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func recordOwnerActivity(args : T.RecordOwnerActivityArguments) : async T.OwnerActivityRecord {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.recordOwnerActivity(caller, args)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getOwnerActivityState() : async T.OwnerActivityState {
    switch (es.getOwnerActivityState(caller)) {
      case (#ok(state)) state;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createDurableAccessPolicy(args : T.CreateDurableAccessPolicyArguments) : async T.DurableAccessPolicy {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createDurableAccessPolicy(caller, args)) {
      case (#ok(policy)) {
        await drainStorageAccessChangedQueue();
        policy;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func processDurableAccessPolicies() : async [T.DurablePolicyProcessResult] {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.processDurableAccessPolicies(caller)) {
      case (#ok(results)) {
        await drainStorageAccessChangedQueue();
        results;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func releaseDurableAccessPolicy(args : T.ReleaseDurableAccessPolicyArguments) : async T.DurablePolicyProcessResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.releaseDurableAccessPolicy(caller, args)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func cancelDurableAccessPolicy(args : T.CancelDurableAccessPolicyArguments) : async T.DurableAccessPolicy {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.cancelDurableAccessPolicy(caller, args)) {
      case (#ok(policy)) {
        await drainStorageAccessChangedQueue();
        policy;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listDurableAccessPolicies() : async [T.DurableAccessPolicy] {
    switch (es.listDurableAccessPolicies(caller)) {
      case (#ok(policies)) policies;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func requestAccess(args : T.CreateAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createAccessRequest(caller, args)) {
      case (#ok(request)) {
        await drainStorageAccessChangedQueue();
        request;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func cancelAccessRequest(args : T.CancelAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.cancelAccessRequest(caller, args)) {
      case (#ok(request)) {
        await drainStorageAccessChangedQueue();
        request;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getMyAccessRequest() : async ?T.AccessRequest {
    switch (es.getMyAccessRequest(caller)) {
      case (#ok(request)) request;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func resolveAccessRequest(args : T.ResolveAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (args.decision) {
      case (#approved(_)) {
        switch (await* SubscriptionGate.ensureSubscription(storage, false)) {
          case (#ok(_)) {};
          case (#err(message)) throw Error.reject(message);
        };
      };
      case (#rejected) {};
    };
    switch (es.resolveAccessRequest(caller, args)) {
      case (#ok(request)) {
        await drainStorageAccessChangedQueue();
        request;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listAccessRequests() : async [T.AccessRequest] {
    switch (es.listAccessRequests(caller)) {
      case (#ok(requests)) requests;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listStorageEvents(afterId : ?Nat, limit : Nat) : async [T.StoredStorageEvent] {
    switch (es.listStorageEvents(caller, afterId, limit)) {
      case (#ok(events)) events;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listLatestStorageEvents(limit : Nat) : async [T.StoredStorageEvent] {
    switch (es.listLatestStorageEvents(caller, limit)) {
      case (#ok(events)) events;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getStorageEventsUnreadCount() : async Nat {
    switch (es.getStorageEventsUnreadCount(caller)) {
      case (#ok(count)) count;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func markStorageEventsRead(upToEventId : Nat) : async () {
    switch (es.markStorageEventsRead(caller, upToEventId)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func markAllVisibleStorageEventsRead() : async () {
    switch (es.markAllVisibleStorageEventsRead(caller)) {
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
    switch (await* SubscriptionGate.ensureSubscription(storage, false)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok _) {};
    };
    switch (SubscriptionGate.canDecrypt(storage, caller, owner, keyId)) {
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
  /*                      Caffeine Blob Storage Protocol                        */
  /* -------------------------------------------------------------------------- */

  // Mixin provides: _immutableObjectStorageCreateCertificate,
  // _immutableObjectStorageBlobsAreLive, _immutableObjectStorageBlobsToDelete,
  // _immutableObjectStorageConfirmBlobDeletion, _immutableObjectStorageUpdateGatewayPrincipals,
  // _immutableObjectStorageRefillCashier
  include MixinObjectStorage();

  public shared ({ caller }) func commitCaffeineUpload(args : T.CommitCaffeineUploadArgs) : async T.StorageResult<()> {
    switch (await* es.commitCaffeineUpload(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>(); #ok };
      case (#err message) #err(storageError(message));
    };
  };

  public query func getStorageBackendType() : async T.StorageBackend {
    es.getStorageBackendType();
  };

  /* -------------------------------------------------------------------------- */
  /*                           Asset canister methods                           */
  /* -------------------------------------------------------------------------- */

  assetStore.set_streaming_callback(http_request_streaming_callback);

  include HttpAssetsMixin(assetCanister);

  /* -------------------------------------------------------------------------- */
  /*                             Thumbnails methods                             */
  /* -------------------------------------------------------------------------- */

  public shared ({ caller }) func prepareThumbnailUpload(args : T.PrepareThumbnailUploadArguments) : async T.PrepareThumbnailUploadResult {
    assert not Principal.isAnonymous(caller);
    switch (es.prepareThumbnailUpload(caller, args)) {
      case (#ok result) result;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func commitThumbnailUpload(args : T.CommitThumbnailUploadArguments) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.commitThumbnailUpload(caller, args)) {
      case (#ok node) node;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func rewrapThumbnail(args : { entry : T.Entry; thumbnailRef : T.ThumbnailRef }) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.setThumbnail(caller, {
      entry = args.entry;
      thumbnailRef = ?args.thumbnailRef;
    })) {
      case (#ok node) node;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func saveThumbnail(args : { entry : T.Entry; thumbnail : { content : Blob; contentType : Text; encryption : T.ThumbnailEncryptionRef } }) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.prepareThumbnailUpload(caller, {
      entry = args.entry;
      contentType = args.thumbnail.contentType;
      size = args.thumbnail.content.size();
    })) {
      case (#ok prepared) switch (prepared.storageBackend) {
        case (#OnChain) {};
        case (#BlobStorage) throw Error.reject("Use Blob Storage thumbnail upload for this entry");
      };
      case (#err message) throw Error.reject(message);
    };
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
          thumbnailRef = ?#OnChain({
            key = storeArgs.key;
            sha256 = storeArgs.sha256;
            contentType = storeArgs.content_type;
            size = args.thumbnail.content.size();
            encryption = args.thumbnail.encryption;
          });
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
    switch (await* SubscriptionGate.ensureSubscription(storage, true)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok _) {};
    };
  };

  public shared ({ caller }) func invalidateSubscriptionCache() : async () {
    let ?backendId = storage.backendId else throw Error.reject("backendId not set");
    if (not Principal.equal(caller, backendId)) {
      throw Error.reject("backend caller required");
    };
    storage.subscriptionCache := null;
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
