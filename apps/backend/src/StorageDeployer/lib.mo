import Array "mo:core/Array";
import Order "mo:core/Order";
import Set "mo:core/Set";
import Blob "mo:core/Blob";
import Queue "mo:core/Queue";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Timer "mo:core/Timer";
import Time "mo:core/Time";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import { ic } "mo:ic";
import IC "mo:ic/Types";

// ZenDB is used transitively through the `Creations` / `Licenses` class handles.
import Creations "Creations";
import GitHubReleases "GitHubReleases";
import HttpDownloader "HttpDownloader";
import Licenses "Licenses";
import StorageDeployer "StorageDeployer";
import StorageEnvironment "../StorageEnvironment";
import StorageCanisterOps "StorageCanisterOps";
import StorageReleaseConfig "StorageReleaseConfig";
import StorageReleasePlanner "StorageReleasePlanner";
import StorageReleaseRuntime "StorageReleaseRuntime";
import WasmInstaller "WasmInstaller";
import FrontendInstaller "FrontendInstaller";
import Types "Types";
import LedgerTypes "../Types/LedgerTypes";
import CMCTypes "../Types/CMCTypes";
import Utils "../Utils/lib";
import HttpAssetsTypes "mo:http-assets/BaseAssets/Types";

module StorageDeployerOrchestrator {
  // -- Re-exported Types --

  public type SizedPointer = Types.SizedPointer;
  public type Progress = Types.Progress;
  public type File = Types.File;
  public type FileMetadata = Types.FileMetadata;
  public type ReleaseSelector = Types.ReleaseSelector;
  public type GithubAsset = GitHubReleases.GithubAsset;
  public type TargetCanister = Types.TargetCanister;
  public type CreateStorageOptions = Types.CreateStorageOptions;
  public type CreateStorageError = Types.CreateStorageError;
  public type CreationStatus = Types.CreationStatus;
  public type StorageCreationRecord = Types.StorageCreationRecord;
  public type OrchestratorTask = Types.OrchestratorTask;
  public type TaskType = Types.TaskType;
  public type GeneratedTask = Types.GeneratedTask;
  public type UnifiedTask = Types.UnifiedTask;
  public type UnifiedTaskType = Types.UnifiedTaskType;
  public type StorageInfo = Types.StorageInfo;
  public type DeleteStorageError = Types.DeleteStorageError;
  public type AddStorageError = Types.AddStorageError;
  public type DownloadDetails = HttpDownloader.DownloadDetails;
  public type ReleaseListTransformArg = StorageReleaseRuntime.ReleaseListTransformArg;
  public type ReleaseListTransform = StorageReleaseRuntime.ReleaseListTransform;

  public type StartCallbacks = {
    releaseListTransform : ReleaseListTransform;
    onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ());
    /// Callbacks attached to orchestrator async work (task queue).
    /// `bindLicense` fires when a canister is minted and a license is
    /// already attached, giving the actor a chance to bind the license
    /// receipt to the new canister id.
    orchestrator : OrchestratorCallbacks;
  };
  public type UpdateInfo = Types.UpdateInfo;
  public type StorageReleaseOption = Types.StorageReleaseOption;
  public type StorageReleaseOptionsResult = Types.StorageReleaseOptionsResult;
  public type UpgradeStorageError = Types.UpgradeStorageError;
  public type PaymentReceipt = Types.PaymentReceipt;
  public type PaymentStatus = Types.PaymentStatus;
  public type License = Types.License;
  public type StatusEvent = Types.StatusEvent;
  public type AmbassadorPayoutStatus = Types.AmbassadorPayoutStatus;
  public type ListLicensesOptions = Types.ListLicensesOptions;
  public type GetLicensesResponse = Types.GetLicensesResponse;
  public type ListCreationsOptions = Types.ListCreationsOptions;
  public type GetCreationsResponse = Types.GetCreationsResponse;
  public type CreationListItem = Types.CreationListItem;

  public let DEFAULT_LIST_LICENSES_OPTIONS = Types.DEFAULT_LIST_LICENSES_OPTIONS;
  public let DEFAULT_LIST_CREATIONS_OPTIONS = Types.DEFAULT_LIST_CREATIONS_OPTIONS;

  /// Delay between unified queue operations (ms)
  let UNIFIED_QUEUE_DELAY_MS : Nat = 100;

  // -- Store --

  /// Orchestrator store. Creation records live in the transient
  /// `Creations` class (ZenDB-backed, passed per-call) — Store only
  /// holds queues, timers, and the counters that feed those creations.
  public type Store = {
    var canisterId : ?Principal;
    region : MemoryRegion.MemoryRegion;

    // Environment variables for storage canisters
    var vetKeyName : ?Text;
    var cashierCanisterId : ?Principal;

    // Subsystems
    githubReleases : GitHubReleases.Store;
    wasmInstaller : WasmInstaller.Store;
    frontendInstaller : FrontendInstaller.Store;

    // Unified task queue (replaces separate queues)
    unifiedQueue : Queue.Queue<UnifiedTask>;

    // Centralized timers
    var githubTimerId : ?Timer.TimerId;
    var downloaderTimerId : ?Timer.TimerId;
    var unifiedTimerId : ?Timer.TimerId;
    var retryTimerId : ?Timer.TimerId;
    var running : Bool;

    // GitHub fetch status tracking
    var lastFetchError : ?Text;
    var lastFetchTime : ?Time.Time;
    var fetchRetryCount : Nat;

    // Task ID counter
    var nextTaskId : Nat;

    // Creation ID counter
    var nextCreationId : Nat;
  };

  public type Self = Store;

  public type StorageReleaseState = StorageReleasePlanner.StorageReleaseState;

  /// Callback invoked by the orchestrator when a fresh canister is created
  /// and a license is already attached to the record. The actor-level code
  /// wires this to `Licenses.bind(...)` — we use a callback instead of
  /// storing a `Licenses` reference on the Store because class handles are
  /// not stable-serializable.
  public type BindLicense = (owner : Principal, paymentId : Text, canisterId : Principal) -> ();

  /// Fired the moment `canisterId` is assigned to a creation — this is
  /// the refund point of no return (see `recoverFailedStorage(#refund)`,
  /// which rejects once `record.canisterId != null`). The actor wires
  /// this to `treasury.distributeAmbassadorShare`, closing out the
  /// two-phase payment. `async*` so the orchestrator can await, but
  /// payout failure is captured by the callback in the record's
  /// `ambassadorPayoutStatus` — the creation task itself MUST succeed
  /// regardless (canister is already live, license already committed).
  /// `creationId` is passed so the callback can mutate the record status.
  public type PayAmbassadorShare = (creationId : Nat, owner : Principal, paymentId : Text) -> async* ();

  /// Fired when `notify_create_canister` returns an error. Callback owns
  /// all CMC-recovery side effects (refund / enqueue pending op / admin
  /// notify). Orchestrator awaits inline then decides on `#Failed` event
  /// based on whether the creation record still exists (callback may have
  /// removed it on terminal refund).
  public type OnCmcNotifyFailed = (creationId : Nat, blockIndex : Nat, err : CMCTypes.NotifyError) -> async* ();
  public type OnCreationChanged = (StorageCreationRecord) -> ();

  /// Bundle of callbacks threaded through the orchestrator's async task
  /// machinery. Using a record (rather than separate params) keeps the
  /// signature stable as more hooks are added.
  public type OrchestratorCallbacks = {
    runtime : RuntimeState;
    bindLicense : ?BindLicense;
    payAmbassadorShare : ?PayAmbassadorShare;
    onCmcNotifyFailed : ?OnCmcNotifyFailed;
    onCreationChanged : ?OnCreationChanged;
    onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ());
  };

  public type RuntimeState = {
    var unifiedQueueProcessing : Bool;
  };

  func appendCreationEvent(
    creations : Creations.Creations,
    creationId : Nat,
    status : CreationStatus,
    onCreationChanged : ?OnCreationChanged,
  ) {
    switch (creations.appendEvent(creationId, status)) {
      case (?record) {
        switch (onCreationChanged) {
          case (?callback) callback(record);
          case null {};
        };
      };
      case null {};
    };
  };

  public func newRuntimeState() : RuntimeState {
    { var unifiedQueueProcessing = false };
  };

  // -- Initialization --

  /// Create a new storage deployer orchestrator
  ///
  /// Example:
  /// ```motoko
  /// let orchestrator = StorageDeployerOrchestrator.new({
  ///   owner = "my-org";
  ///   repo = "my-repo";
  ///   githubToken = ?"ghp_xxx";
  ///   assets = [(#Latest, [#StorageWASM("app.wasm")])];
  /// });
  /// ```
  public func new<system>(
    config : {
      github : GitHubReleases.GithubOptions;
      assets : [(GitHubReleases.ReleaseSelector, [GitHubReleases.GithubAsset])];
    }
  ) : Store {
    let region = MemoryRegion.new();
    {
      var canisterId = null;
      region;
      var vetKeyName : ?Text = ?Utils.envText<system>("THRESHOLD_KEY_NAME", "key_1");
      var cashierCanisterId : ?Principal = ?Principal.fromText(Utils.envText<system>(StorageEnvironment.CASHIER_PRINCIPAL, "xc7sj-uyaaa-aaaaf-qbrja-cai"));
      githubReleases = GitHubReleases.new({
        github = config.github;
        assets = config.assets;
        region = ?region;
      });
      wasmInstaller = WasmInstaller.new();
      frontendInstaller = FrontendInstaller.new(region);
      unifiedQueue = Queue.empty();
      var githubTimerId = null;
      var downloaderTimerId = null;
      var unifiedTimerId = null;
      var retryTimerId = null;
      var running = false;
      var lastFetchError = null;
      var lastFetchTime = null;
      var fetchRetryCount = 0;
      var nextTaskId = 0;
      var nextCreationId = 0;
    };
  };

  // -- Timer Management --

  func cancelTimer(timerId : ?Timer.TimerId) {
    switch (timerId) {
      case (?id) Timer.cancelTimer(id);
      case null {};
    };
  };

  func compareEnvPairByName(a : Types.EnvPair, b : Types.EnvPair) : Order.Order {
    Text.compare(a.name, b.name);
  };

  func envPairValue(pairsOpt : ?[Types.EnvPair], name : Text) : ?Text {
    let ?pairs = pairsOpt else return null;
    for (pair in pairs.vals()) {
      if (Text.equal(pair.name, name)) return ?pair.value;
    };
    null;
  };

  func appendOrigin(origins : Text, origin : Text) : Text {
    if (Text.equal(origins, "")) origin else origins # "," # origin;
  };

  /// Child storage canisters validate II attributes through their own
  /// `frontend_origins`. `STORAGE_FRONTEND_ORIGINS` is a backend-only
  /// extra list for standalone storage frontends such as local :4201.
  func buildStorageFrontendOrigins<system>(storageCanisterId : ?Principal) : ?Text {
    var origins = "";

    switch (Runtime.envVar<system>(StorageEnvironment.STORAGE_FRONTEND_ORIGINS)) {
      case (?value) origins := appendOrigin(origins, value);
      case null {};
    };
    switch (storageCanisterId) {
      case (?value) {
        let canisterId = Principal.toText(value);
        origins := appendOrigin(origins, "https://" # canisterId # ".icp.net");
        origins := appendOrigin(origins, "https://" # canisterId # ".icp0.io");
      };
      case null {};
    };

    if (Text.equal(origins, "")) null else ?origins;
  };

  func refreshRuntimeConfig<system>(store : Store) {
    let releaseConfig = StorageReleaseConfig.fromEnv<system>();
    GitHubReleases.configure(store.githubReleases, {
      github = releaseConfig.github;
      assets = releaseConfig.assets;
    });
    store.vetKeyName := ?Utils.envText<system>("THRESHOLD_KEY_NAME", "key_1");
    store.cashierCanisterId := ?Principal.fromText(Utils.envText<system>(StorageEnvironment.CASHIER_PRINCIPAL, "xc7sj-uyaaa-aaaaf-qbrja-cai"));
  };

  /// Merge storage env vars derived from backend runtime config with caller-supplied custom pairs.
  /// Public so CmcRecovery can rebuild the exact same `environment_variables`
  /// when retrying `notify_create_canister` on ambiguous failure — otherwise
  /// CMC might process a not-yet-resolved block with different env vars.
  public func buildEnvironmentVariables<system>(self : Store, custom : ?[Types.EnvPair], storageCanisterId : ?Principal) : ?[Types.EnvPair] {
    let ?backendId = self.canisterId else return null;
    let ?defaultVetKey = self.vetKeyName else return null;
    let ?cashier = self.cashierCanisterId else return null;
    let vetKey = switch (envPairValue(custom, StorageEnvironment.VETKEY_NAME)) {
      case (?value) value;
      case null defaultVetKey;
    };

    let set = Set.fromArray<Types.EnvPair>(
      [
        {
          name = StorageEnvironment.RABBITHOLE_BACKEND_CANISTER_ID;
          value = Principal.toText(backendId);
        },
        { name = StorageEnvironment.VETKEY_NAME; value = vetKey },
        {
          name = StorageEnvironment.CASHIER_PRINCIPAL;
          value = Principal.toText(cashier);
        },
      ],
      compareEnvPairByName,
    );

    switch (Runtime.envVar<system>(StorageEnvironment.RABBITHOLE_FRONTEND_CANISTER_ID)) {
      case (?value) Set.add(set, compareEnvPairByName, { name = StorageEnvironment.RABBITHOLE_FRONTEND_CANISTER_ID; value });
      case null {};
    };
    switch (Runtime.envVar<system>(StorageEnvironment.INTERNET_IDENTITY_FRONTEND_CANISTER_ID)) {
      case (?value) Set.add(set, compareEnvPairByName, { name = StorageEnvironment.INTERNET_IDENTITY_FRONTEND_CANISTER_ID; value });
      case null {};
    };
    let trustedAttributeSigners = switch (Runtime.envVar<system>(StorageEnvironment.TRUSTED_ATTRIBUTE_SIGNERS)) {
      case (?value) value;
      case null switch (Runtime.envVar<system>(StorageEnvironment.INTERNET_IDENTITY_BACKEND_CANISTER_ID)) {
        case (?value) value;
        case null Runtime.trap("Missing required environment variable: " # StorageEnvironment.TRUSTED_ATTRIBUTE_SIGNERS);
      };
    };
    Set.add(set, compareEnvPairByName, { name = StorageEnvironment.TRUSTED_ATTRIBUTE_SIGNERS; value = trustedAttributeSigners });

    switch (buildStorageFrontendOrigins<system>(storageCanisterId)) {
      case (?value) Set.add(set, compareEnvPairByName, { name = StorageEnvironment.FRONTEND_ORIGINS; value });
      case null {};
    };

    switch (custom) {
      case (?pairs) Set.addAll(set, compareEnvPairByName, pairs.vals());
      case null {};
    };

    ?Set.toArray(set);
  };

  /// Reset transient state that should not survive canister upgrades.
  /// Called at the beginning of start() to ensure clean state.
  func resetTransientState(store : Store, creations : Creations.Creations) {
    // Reset timer IDs (old timer IDs are invalid after upgrade)
    store.githubTimerId := null;
    store.downloaderTimerId := null;
    store.unifiedTimerId := null;
    store.retryTimerId := null;

    // Reset transient tracking
    store.lastFetchError := null;
    store.lastFetchTime := null;
    store.fetchRetryCount := 0;
    store.nextTaskId := 0;

    // Clear task queue (stale tasks from before upgrade)
    Queue.clear(store.unifiedQueue);

    // Reset subsystem transient state
    WasmInstaller.resetTransient(store.wasmInstaller);
    FrontendInstaller.resetTransient(store.frontendInstaller);
    HttpDownloader.resetTransient(store.githubReleases.downloaderStore);

    // Mark interrupted creations as failed (or revert upgrades to Completed).
    // `creations.all()` is a ZenDB query — safe to iterate and re-enter via
    // `creations.mutate` because the class method does a fresh fetch per call.
    for (record in creations.all().vals()) {
      switch (record.status) {
        case (#Completed _ or #Failed _) {};
        case (#ProcessingPayment _) {
          // Payment may or may not have completed before upgrade
          switch (record.licensePaymentId) {
            case (?_) ignore creations.appendEvent(record.id, #Failed("Interrupted by upgrade after payment. License preserved for recovery."));
            case null ignore creations.appendEvent(record.id, #Failed("Interrupted by upgrade during payment processing"));
          };
        };
        case _ {
          let errorMsg = "Interrupted by canister upgrade";
          if (record.isUpgrade) {
            switch (record.canisterId) {
              case (?canisterId) {
                ignore creations.appendEvent(record.id, #Completed({ canisterId }));
                ignore creations.mutate(record.id, func(r) = { r with lastUpgradeError = ?errorMsg; isUpgrade = false; upgradeIncludesFrontend = false });
              };
              case null {
                ignore creations.appendEvent(record.id, #Failed(errorMsg));
                ignore creations.mutate(record.id, func(r) = { r with isUpgrade = false; upgradeIncludesFrontend = false });
              };
            };
          } else {
            ignore creations.appendEvent(record.id, #Failed(errorMsg));
            ignore creations.mutate(record.id, func(r) = { r with isUpgrade = false; upgradeIncludesFrontend = false });
          };
        };
      };
    };
  };

  /// Start the orchestrator and all subsystems
  ///
  /// This starts GitHub release checking, download processing,
  /// and task queue processing
  public func start<system>(self : Store, creations : Creations.Creations, callbacks : StartCallbacks) : async () {
    if (self.running) return;

    // Reset transient state (meaningless after canister upgrade)
    resetTransientState(self, creations);

    // Env-derived values are stable fields in Store; refresh them after
    // transient reset so downloader headers are rebuilt from current env.
    refreshRuntimeConfig<system>(self);

    self.running := true;

    // 1. Start release check
    await StorageReleaseRuntime.checkAndDownloadReleases<system>(self, callbacks.releaseListTransform, callbacks.onAssetDownloaded);
    self.githubTimerId := ?Timer.recurringTimer<system>(
      #days 1,
      func() : async () {
        // Reset retry count for daily check to allow fresh retry attempts
        self.fetchRetryCount := 0;
        refreshRuntimeConfig<system>(self);
        await StorageReleaseRuntime.checkAndDownloadReleases<system>(self, callbacks.releaseListTransform, callbacks.onAssetDownloaded);
      },
    );

    // 2. Downloader timer (activates when queue has items)
    StorageReleaseRuntime.ensureDownloaderTimer<system>(self, callbacks.onAssetDownloaded);

    // 3. Unified timer (activates when queue has items)
    ensureUnifiedTimer<system>(self, creations, callbacks.orchestrator);
  };

  /// Stop all orchestrator timers and subsystems
  public func stop(self : Store) : () {
    self.running := false;

    // Cancel ALL timers centrally
    cancelTimer(self.githubTimerId);
    self.githubTimerId := null;

    cancelTimer(self.downloaderTimerId);
    self.downloaderTimerId := null;

    cancelTimer(self.unifiedTimerId);
    self.unifiedTimerId := null;

    cancelTimer(self.retryTimerId);
    self.retryTimerId := null;

    // Reset retry state
    self.fetchRetryCount := 0;
  };

  /// Check if the orchestrator is currently running
  public func isRunning(self : Store) : Bool {
    self.running;
  };

  /// Queue downloads for a concrete release tag already present in `store.releases`.
  public func prepareStorageRelease<system>(self : Store, releaseTag : Text, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : Result.Result<(), Text> {
    refreshRuntimeConfig<system>(self);
    StorageReleaseRuntime.prepareStorageRelease<system>(self, releaseTag, onAssetDownloaded);
  };

  // Ensure unified timer is running if there are pending tasks.
  // `callbacks` is captured by the timer closure and forwarded through to
  // the per-task handler (processOrchestratorTask).
  func ensureUnifiedTimer<system>(store : Store, creations : Creations.Creations, callbacks : OrchestratorCallbacks) {
    if (not store.running) return;
    if (Queue.isEmpty(store.unifiedQueue)) {
      if (not callbacks.runtime.unifiedQueueProcessing) {
        cancelTimer(store.unifiedTimerId);
        store.unifiedTimerId := null;
      };
    } else if (not callbacks.runtime.unifiedQueueProcessing) {
      // The local replica can leave a stale timer id around after interruption
      // or sleep. A non-empty queue with no active processor must always have
      // a fresh timer, but we must not start a second processor while one is
      // suspended on an await.
      cancelTimer(store.unifiedTimerId);
      store.unifiedTimerId := ?Timer.setTimer<system>(
        #milliseconds 0,
        func() : async () {
          await processUnifiedQueue<system>(store, creations, callbacks);
        },
      );
    };
  };

  func purgeQueuedTasksForCreation(store : Store, creationId : Nat) {
    let retained = Queue.filter<UnifiedTask>(
      store.unifiedQueue,
      func(task : UnifiedTask) : Bool = task.creationId != creationId,
    );
    Queue.clear(store.unifiedQueue);
    for (task in Queue.values(retained)) {
      Queue.pushBack(store.unifiedQueue, task);
    };
  };

  // -- Storage Creation --

  /// Build an immutable record with default fields and the given overrides.
  /// Used by the three creation entry points (createStorage, createStorageRecord,
  /// addStorage) so we don't repeat the default layout.
  ///
  /// `ambassadorPayoutStatus` defaults to `#skipped` — most call sites don't
  /// have a license yet; the license-bearing path (`createStorageRecord`)
  /// overrides to `#pending` via the returned record.
  func newRecord(
    creationId : Nat,
    owner : Principal,
    releaseTag : Text,
    initArg : Blob,
    envPairs : ?[Types.EnvPair],
    canisterId : ?Principal,
    wasmHash : ?Blob,
    status : CreationStatus,
    completedAt : ?Time.Time,
    events : [Types.StatusEvent],
    ambassadorPayoutStatus : Types.AmbassadorPayoutStatus,
  ) : StorageCreationRecord {
    {
      id = creationId;
      owner;
      releaseTag;
      initArg;
      envPairs;
      createdAt = Time.now();
      canisterId;
      wasmHash;
      frontendHash = null;
      installedReleaseTag = null;
      status;
      statusTag = Types.tagOfCreationStatus(status);
      completedAt;
      licensePaymentId = null;
      isUpgrade = false;
      upgradeIncludesFrontend = false;
      lastUpgradeError = null;
      frontendInstallDiagnostics = null;
      events;
      ambassadorPayoutStatus;
      ambassadorPayoutStatusTag = Types.tagOfAmbassadorPayoutStatus(ambassadorPayoutStatus);
      subnetId = null;
    };
  };

  /// Start creating a new storage canister for the caller
  public func createStorage<system>(
    self : Store,
    creations : Creations.Creations,
    caller : Principal,
    options : CreateStorageOptions,
    callbacks : OrchestratorCallbacks,
  ) : Result.Result<(), CreateStorageError> {
    // 1. Check that release is downloaded
    let releaseTag = switch (findReleaseTag(self, options.releaseSelector)) {
      case (?tag) tag;
      case null return #err(#ReleaseNotFound);
    };
    switch (StorageReleaseRuntime.ensureDeploymentReady(self, releaseTag)) {
      case (#ok) {};
      case (#err(_)) return #err(#ReleaseNotFound);
    };

    // 2. Check for active creation
    switch (creations.findActiveByOwner(caller)) {
      case (?_) return #err(#AlreadyInProgress);
      case null {};
    };

    // 3. Check if canister ID is already used (for Existing target)
    switch (options.target) {
      case (#Existing(canisterId)) {
        if (creations.isCanisterUsed(canisterId)) {
          return #err(#CanisterAlreadyUsed({ canisterId }));
        };
      };
      case (#Create(_)) {};
    };

    // 4. Create history record
    let creationId = self.nextCreationId;
    self.nextCreationId += 1;

    let existingCanisterId = switch (options.target) {
      case (#Existing(id)) ?id;
      case (#Create(_)) null;
    };

    creations.add(
      // createStorage (direct, no payment flow) → no license, no payout expected.
      newRecord(creationId, caller, releaseTag, options.initArg, options.envPairs, existingCanisterId, null, #Pending, null, [], #skipped),
    );
    switch (callbacks.onCreationChanged, creations.get(creationId)) {
      case (?callback, ?record) callback(record);
      case _ {};
    };

    // 5. Add initial orchestrator task
    let taskType : TaskType = switch (options.target) {
      case (#Existing(existingId)) #LinkCanister({ canisterId = existingId });
      case (#Create(_)) #CreateCanister({ options });
    };

    let task : UnifiedTask = {
      id = self.nextTaskId;
      creationId;
      owner = caller;
      taskType = #Orchestrator({ owner = caller; taskType });
      var attempts = 0;
    };
    self.nextTaskId += 1;
    Queue.pushBack(self.unifiedQueue, task);

    // 6. Start queue processing
    ensureUnifiedTimer<system>(self, creations, callbacks);

    #ok;
  };

  /// Create a storage record with #ProcessingPayment status (no tasks queued).
  /// Used by purchaseLicenseAndCreateStorage: record is visible in listStorages immediately.
  public func createStorageRecord(
    self : Store,
    creations : Creations.Creations,
    caller : Principal,
    options : CreateStorageOptions,
  ) : Result.Result<Nat, CreateStorageError> {
    let releaseTag = switch (findReleaseTag(self, options.releaseSelector)) {
      case (?tag) tag;
      case null return #err(#ReleaseNotFound);
    };
    switch (StorageReleaseRuntime.ensureDeploymentReady(self, releaseTag)) {
      case (#ok) {};
      case (#err(_)) return #err(#ReleaseNotFound);
    };

    switch (creations.findActiveByOwner(caller)) {
      case (?_) return #err(#AlreadyInProgress);
      case null {};
    };

    let creationId = self.nextCreationId;
    self.nextCreationId += 1;

    let initialStatus : CreationStatus = #ProcessingPayment(#Starting);
    // Seed the timeline with the initial `Starting` event — subsequent
    // appendEvent calls extend the history from here.
    let seedEvent : Types.StatusEvent = {
      status = initialStatus;
      timestamp = Time.now();
    };

    creations.add(
      // createStorageRecord is the entry point for purchaseLicenseAndCreateStorage —
      // a license charge is always attached. Ambassador payout is pending until
      // the refund window closes at #CanisterCreated.
      newRecord(creationId, caller, releaseTag, options.initArg, options.envPairs, null, null, initialStatus, null, [seedEvent], #pending),
    );

    #ok(creationId);
  };

  /// Link a creation record to a license via paymentId.
  public func setLicensePaymentId(creations : Creations.Creations, creationId : Nat, paymentId : Text) {
    ignore creations.mutate(creationId, func(r) = { r with licensePaymentId = ?paymentId });
  };

  /// Mark a creation record as failed.
  public func failCreation(creations : Creations.Creations, creationId : Nat, reason : Text) {
    ignore creations.appendEvent(creationId, #Failed(reason));
  };

  /// Start creation tasks for a record (transition from #ProcessingPayment → #Pending).
  public func startStorageCreation<system>(
    self : Store,
    creations : Creations.Creations,
    creationId : Nat,
    options : CreateStorageOptions,
    callbacks : OrchestratorCallbacks,
  ) : Result.Result<(), Text> {
    let ?record = creations.get(creationId) else return #err("Creation record not found");
    switch (StorageReleaseRuntime.ensureDeploymentReady(self, record.releaseTag)) {
      case (#ok) {};
      case (#err(message)) return #err(message);
    };

    switch (record.status) {
      case (#ProcessingPayment _ or #Pending) {};
      case (#Failed _) {
        // Allow retry of failed records (admin recovery)
        switch (record.licensePaymentId) {
          case (?_) {}; // Has license link — retry allowed
          case null return #err("Cannot retry failed creation without license");
        };
      };
      case (status) return #err("Cannot start creation from status " # debug_show status);
    };

    purgeQueuedTasksForCreation(self, creationId);
    switch (record.canisterId) {
      case (?canisterId) {
        FrontendInstaller.resetCanisterState(self.frontendInstaller, canisterId);
        WasmInstaller.resetCanisterState(self.wasmInstaller, canisterId);
      };
      case null {};
    };

    appendCreationEvent(creations, creationId, #Pending, callbacks.onCreationChanged);

    // Persist subnetId so CmcRecovery retry can reconstruct the exact
    // original `subnet_selection` for `notify_create_canister`. Only the
    // `#Create` target carries a subnet — `#Existing` inherits the
    // subnet from the existing canister.
    switch (options.target) {
      case (#Create({ subnetId })) {
        ignore creations.mutate(creationId, func(r) = { r with subnetId });
      };
      case (#Existing(_)) {};
    };

    let taskType : TaskType = switch (options.target) {
      case (#Existing(existingId)) #LinkCanister({ canisterId = existingId });
      case (#Create(_)) #CreateCanister({ options });
    };

    let task : UnifiedTask = {
      id = self.nextTaskId;
      creationId;
      owner = record.owner;
      taskType = #Orchestrator({ owner = record.owner; taskType });
      var attempts = 0;
    };
    self.nextTaskId += 1;
    Queue.pushBack(self.unifiedQueue, task);

    ensureUnifiedTimer<system>(self, creations, callbacks);

    #ok;
  };

  /// Register an externally deployed storage canister.
  /// Verifies WASM hash via canister_info against known hashes.
  /// Creates a record so findOwnerByCanister resolves this canister to the caller.
  public func addStorage(
    self : Store,
    creations : Creations.Creations,
    caller : Principal,
    canisterId : Principal,
    initArg : Blob,
    isKnownWasm : (Blob) -> Bool,
  ) : async Result.Result<Nat, Types.AddStorageError> {
    if (creations.isCanisterUsed(canisterId)) {
      return #err(#CanisterAlreadyUsed({ canisterId }));
    };

    // Verify WASM hash via canister_info
    let info = await ic.canister_info({
      canister_id = canisterId;
      num_requested_changes = ?0;
    });
    let wasmHash = switch (info.module_hash) {
      case (?hash) hash;
      case null return #err(#InvalidWasm("No WASM installed on canister"));
    };
    if (not isKnownWasm(wasmHash)) {
      return #err(#InvalidWasm("WASM hash does not match any known release"));
    };

    // Verify caller controls the canister
    let isController = Array.find(info.controllers, func(c : Principal) : Bool { c == caller }) |> Option.isSome(_);
    if (not isController) {
      return #err(#NotController);
    };

    let creationId = self.nextCreationId;
    self.nextCreationId += 1;

    creations.add(
      newRecord(
        creationId,
        caller,
        "external",
        initArg,
        null,
        ?canisterId,
        ?wasmHash,
        #Completed({ canisterId }),
        ?Time.now(),
        [],
        // addStorage: user registers a pre-existing canister, no license, no payout.
        #skipped,
      )
    );

    #ok(creationId);
  };

  func findReleaseTag(store : Store, selector : ReleaseSelector) : ?Text {
    GitHubReleases.getReleaseTagName(store.githubReleases, selector);
  };

  func canisterHasExpectedWasm(store : Store, canisterId : Principal, releaseTag : Text) : async Bool {
    let expectedHash = switch (StorageReleaseRuntime.getWasmHash(store, releaseTag)) {
      case (#ok(hash)) hash;
      case (#err(_)) return false;
    };

    await StorageCanisterOps.hasInstalledWasmHash(canisterId, expectedHash);
  };

  // ═══════════════════════════════════════════════════════════════
  // UNIFIED QUEUE PROCESSOR
  // ═══════════════════════════════════════════════════════════════

  /// Process the unified queue - single timer, sequential execution
  func processUnifiedQueue<system>(store : Store, creations : Creations.Creations, callbacks : OrchestratorCallbacks) : async () {
    store.unifiedTimerId := null;
    if (callbacks.runtime.unifiedQueueProcessing) {
      ensureUnifiedTimer<system>(store, creations, callbacks);
      return;
    };

    callbacks.runtime.unifiedQueueProcessing := true;

    switch (Queue.popFront(store.unifiedQueue)) {
      case (?task) {
        try {
          switch (task.taskType) {
            case (#Orchestrator(orchTask)) {
              await processOrchestratorTask<system>(store, creations, task.creationId, orchTask, callbacks);
            };
            case (#WasmUploadChunk(args)) {
              switch (await WasmInstaller.executeUploadChunk(store.wasmInstaller, args)) {
                case (#ok(_)) {
                  syncWasmProgressStatus(store, creations, task.creationId, args.canisterId, callbacks.onCreationChanged);
                };
                case (#err(e)) {
                  await handleTaskFailure(store, creations, task.creationId, "WASM chunk upload failed: " # e, callbacks.onCreationChanged);
                };
              };
            };
            case (#WasmInstallCode(args)) {
              switch (await WasmInstaller.executeInstallCode(store.wasmInstaller, args)) {
                case (#ok) {
                  queuePostWasmTasks<system>(store, creations, task.creationId, args.canisterId, callbacks.onCreationChanged);
                };
                case (#err(e)) {
                  await handleTaskFailure(store, creations, task.creationId, "WASM install failed: " # e, callbacks.onCreationChanged);
                };
              };
            };
            case (#WasmInstallChunked(args)) {
              switch (await WasmInstaller.executeInstallChunked(store.wasmInstaller, args)) {
                case (#ok) {
                  queuePostWasmTasks<system>(store, creations, task.creationId, args.canisterId, callbacks.onCreationChanged);
                };
                case (#err(e)) {
                  await handleTaskFailure(store, creations, task.creationId, "WASM chunked install failed: " # e, callbacks.onCreationChanged);
                };
              };
            };
            case (#FrontendCreateBatch(args)) {
              switch (await FrontendInstaller.executeCreateBatch(store.frontendInstaller, args.canisterId)) {
                case (#ok(_)) {
                  syncFrontendInstallDiagnostics(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  syncFrontendInstallDiagnostics(store, creations, task.creationId, args.canisterId);
                  await handleTaskFailure(store, creations, task.creationId, "Frontend create batch failed: " # e, callbacks.onCreationChanged);
                };
              };
            };
            case (#FrontendUploadChunks(args)) {
              switch (await FrontendInstaller.executeUploadChunks(store.frontendInstaller, args.canisterId, args.files)) {
                case (#ok) {
                  syncFrontendProgressStatus(store, creations, task.creationId, args.canisterId, callbacks.onCreationChanged);
                  syncFrontendInstallDiagnostics(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  syncFrontendInstallDiagnostics(store, creations, task.creationId, args.canisterId);
                  await handleTaskFailure(store, creations, task.creationId, "Frontend upload chunks failed: " # e, callbacks.onCreationChanged);
                };
              };
            };
            case (#FrontendCommitBatch(args)) {
              switch (await FrontendInstaller.executeCommitBatch(store.frontendInstaller, args.canisterId)) {
                case (#ok) {
                  syncFrontendInstallDiagnostics(store, creations, task.creationId, args.canisterId);
                  // Frontend complete - revoke installer permission, then update controllers
                  queueRevokeInstallerPermission(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  syncFrontendInstallDiagnostics(store, creations, task.creationId, args.canisterId);
                  await handleTaskFailure(store, creations, task.creationId, "Frontend commit failed: " # e, callbacks.onCreationChanged);
                };
              };
            };
            case (#RevokeInstallerPermission(args)) {
              switch (store.canisterId) {
                case null {
                  await handleTaskFailure(store, creations, task.creationId, "Deployer canister ID not set", callbacks.onCreationChanged);
                };
                case (?deployerCanisterId) {
                  appendCreationEvent(creations, task.creationId, #RevokingInstallerPermission({ canisterId = args.canisterId }), callbacks.onCreationChanged);

                  // Use http-assets interface to revoke permission
                  let assetsCanister = actor (Principal.toText(args.canisterId)) : HttpAssetsTypes.AssetsInterface;

                  try {
                    await assetsCanister.revoke_permission({
                      of_principal = deployerCanisterId;
                      permission = #Commit;
                    });
                  } catch (_) {
                    // Log but don't fail - permission might already be revoked
                    // Or installer might not have had permission (owner == installer case)
                  };

                  // After revoke - queue controller update
                  queueUpdateControllers(store, creations, task.creationId, args.canisterId);
                };
              };
            };
          };
        } catch (error) {
          let errMsg = Error.message(error);
          if (task.attempts < 3) {
            task.attempts += 1;
            Queue.pushBack(store.unifiedQueue, task);
          } else {
            await handleTaskFailure(store, creations, task.creationId, "Task failed after 3 attempts: " # errMsg, callbacks.onCreationChanged);
          };
        };

        callbacks.runtime.unifiedQueueProcessing := false;

        if (Queue.isEmpty(store.unifiedQueue)) {
          cancelTimer(store.unifiedTimerId);
          store.unifiedTimerId := null;
        } else {
          store.unifiedTimerId := ?Timer.setTimer<system>(
            #milliseconds UNIFIED_QUEUE_DELAY_MS,
            func() : async () {
              await processUnifiedQueue<system>(store, creations, callbacks);
            },
          );
        };
      };
      case null {
        // Queue is empty - cancel timer
        cancelTimer(store.unifiedTimerId);
        store.unifiedTimerId := null;
        callbacks.runtime.unifiedQueueProcessing := false;
      };
    };
  };

  func remoteCallFailureMessage(
    details : {
      stage : StorageDeployer.RemoteCallStage;
      message : Text;
      blockIndex : ?Nat;
    }
  ) : Text {
    let blockSuffix = switch (details.blockIndex) {
      case (?blockIndex) " (CMC block " # Nat.toText(blockIndex) # ")";
      case null "";
    };

    "Canister creation failed at " #
    remoteCallStageLabel(details.stage) #
    blockSuffix #
    ": " #
    details.message;
  };

  func remoteCallStageLabel(stage : StorageDeployer.RemoteCallStage) : Text {
    switch (stage) {
      case (#FetchIcpXdrRate) "CMC exchange-rate lookup";
      case (#ReadUserIcpBalance) "ICP ledger user-subaccount balance";
      case (#ReadTreasuryIcpBalance) "ICP ledger treasury-subaccount balance";
      case (#ReadDefaultIcpBalance) "ICP ledger default-account balance";
      case (#TransferIcpToCmc) "ICP ledger transfer to CMC";
      case (#NotifyCmcCreateCanister) "CMC notify_create_canister";
    };
  };

  func syncWasmProgressStatus(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal, onCreationChanged : ?OnCreationChanged) {
    let ?record = creations.get(creationId) else return;

    let syncVariant = func(progress : Types.Progress) : Types.CreationStatus {
      switch (record.status) {
        case (#ReinstallingWasm _) #ReinstallingWasm({ canisterId; progress });
        case _ {
          if (record.isUpgrade) {
            #UpgradingWasm({ canisterId; progress });
          } else {
            #InstallingWasm({ canisterId; progress });
          };
        };
      };
    };

    switch (WasmInstaller.getStatus(store.wasmInstaller, canisterId)) {
      case (?#UploadingChunks(progress)) {
        appendCreationEvent(creations, creationId, syncVariant({ processed = progress.uploaded; total = progress.total }), onCreationChanged);
      };
      case (?#Pending) {
        appendCreationEvent(creations, creationId, syncVariant({ processed = 0; total = 0 }), onCreationChanged);
      };
      case (?#Installing) {
        appendCreationEvent(creations, creationId, syncVariant({ processed = 0; total = 0 }), onCreationChanged);
      };
      case _ {};
    };
  };

  func syncFrontendProgressStatus(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal, onCreationChanged : ?OnCreationChanged) {
    let ?record = creations.get(creationId) else return;

    switch (FrontendInstaller.getInstallationStatus(store.frontendInstaller, canisterId)) {
      case (?#Uploading(progress)) {
        let progressInfo = {
          processed = progress.processed;
          total = progress.total;
        };
        let newStatus = if (record.isUpgrade) {
          #UpgradingFrontend({ canisterId; progress = progressInfo });
        } else {
          #UploadingFrontend({ canisterId; progress = progressInfo });
        };
        appendCreationEvent(creations, creationId, newStatus, onCreationChanged);
      };
      case _ {};
    };
  };

  func syncFrontendInstallDiagnostics(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let diagnostics = FrontendInstaller.getDiagnostics(store.frontendInstaller, canisterId);
    ignore creations.mutate(creationId, func(r) = { r with frontendInstallDiagnostics = diagnostics });
  };

  /// Shared tail for both creation branches (`#CreateCanister` minted a new
  /// canister; `#LinkCanister` re-attached to an existing one on resume).
  /// Bind canisterId onto the record, fire the `#CanisterCreated` event,
  /// then invoke the two side-effect callbacks (license binding + deferred
  /// ambassador payout) in a consistent order. Callers are responsible
  /// for queueing WASM tasks afterwards.
  func onCanisterAssigned(
    creations : Creations.Creations,
    creationId : Nat,
    owner : Principal,
    canisterId : Principal,
    licensePaymentId : ?Text,
    bindLicense : ?BindLicense,
    payAmbassadorShare : ?PayAmbassadorShare,
    onCreationChanged : ?OnCreationChanged,
  ) : async* () {
    ignore creations.mutate(creationId, func(r) = { r with canisterId = ?canisterId });
    appendCreationEvent(creations, creationId, #CanisterCreated({ canisterId }), onCreationChanged);

    // Bind license to canister via callback (if configured). The callback
    // closes over the Licenses class in main.mo.
    switch (licensePaymentId, bindLicense) {
      case (?paymentId, ?cb) cb(owner, paymentId, canisterId);
      case _ {};
    };

    // Deferred ambassador payout fires here — same trigger point as the
    // refund block, so the amount the user can no longer reclaim is the
    // amount the ambassador can now collect.
    switch (licensePaymentId, payAmbassadorShare) {
      case (?paymentId, ?cb) await* cb(creationId, owner, paymentId);
      case _ {};
    };
  };

  /// Process high-level orchestrator tasks
  func processOrchestratorTask<system>(
    store : Store,
    creations : Creations.Creations,
    creationId : Nat,
    task : OrchestratorTask,
    callbacks : OrchestratorCallbacks,
  ) : async () {
    let ?record = creations.get(creationId) else return;
    let bindLicense = callbacks.bindLicense;
    let payAmbassadorShare = callbacks.payAmbassadorShare;
    let onCmcNotifyFailed = callbacks.onCmcNotifyFailed;
    let onCreationChanged = callbacks.onCreationChanged;

    switch (task.taskType) {
      case (#CreateCanister({ options })) {
        let ?deployerCanisterId = store.canisterId else {
          appendCreationEvent(creations, creationId, #Failed("Deployer canister ID not set"), onCreationChanged);
          return;
        };

        appendCreationEvent(creations, creationId, #CheckingBalance, onCreationChanged);

        let { initialCycles; subnetId } = switch (options.target) {
          case (#Create(params)) params;
          case (#Existing(_)) {
            appendCreationEvent(creations, creationId, #Failed("CreateCanister task received Existing target"), onCreationChanged);
            return;
          };
        };

        let envVars = buildEnvironmentVariables(store, record.envPairs, null);
        switch (await StorageDeployer.transferAndCreateCanister(deployerCanisterId, task.owner, initialCycles, subnetId, envVars)) {
          case (#ok(canisterId)) {
            await* onCanisterAssigned(creations, creationId, task.owner, canisterId, record.licensePaymentId, bindLicense, payAmbassadorShare, onCreationChanged);
            queueWasmTasks(store, creations, { creationId; canisterId; releaseTag = record.releaseTag; initArg = record.initArg; mode = #install }, onCreationChanged);
          };
          case (#err(e)) {
            switch (e) {
              case (#NotifyFailed({ err; blockIndex })) {
                // Callback owns recovery side effects (refund / enqueue pending
                // op / admin notify). Orchestrator then decides on #Failed
                // event ONLY if creation still exists (terminal refund path
                // may have deleted it).
                switch (onCmcNotifyFailed) {
                  case (?cb) await* cb(creationId, blockIndex, err);
                  case null {};
                };
                if (Option.isSome(creations.get(creationId))) {
                  appendCreationEvent(creations, creationId, #Failed("Canister creation failed: CMC notification failed"), onCreationChanged);
                };
              };
              case (#InsufficientBalance(_)) {
                appendCreationEvent(creations, creationId, #Failed("Canister creation failed: Insufficient balance"), onCreationChanged);
              };
              case (#TransferFailed(_)) {
                appendCreationEvent(creations, creationId, #Failed("Canister creation failed: Transfer failed"), onCreationChanged);
              };
              case (#RemoteCallFailed(details)) {
                appendCreationEvent(creations, creationId, #Failed(remoteCallFailureMessage(details)), onCreationChanged);
              };
            };
          };
        };
      };

      case (#LinkCanister({ canisterId })) {
        // Link path (resume of a failed creation whose canister was already
        // minted) — same side effects as CreateCanister. Ambassador payout
        // dedup protects against double-pay if the original CreateCanister
        // already fired it.
        await* onCanisterAssigned(creations, creationId, task.owner, canisterId, record.licensePaymentId, bindLicense, payAmbassadorShare, onCreationChanged);
        if (await canisterHasExpectedWasm(store, canisterId, record.releaseTag)) {
          queuePostWasmTasks<system>(store, creations, creationId, canisterId, onCreationChanged);
        } else {
          queueWasmTasks(store, creations, { creationId; canisterId; releaseTag = record.releaseTag; initArg = record.initArg; mode = #install }, onCreationChanged);
        };
      };

      case (#InstallWasm({ canisterId; releaseTag; initArg; mode })) {
        switch (mode) {
          case (#reinstall) {
            queueWasmTasks(store, creations, { creationId; canisterId; releaseTag; initArg; mode }, onCreationChanged);
          };
          case _ {
            if (await canisterHasExpectedWasm(store, canisterId, releaseTag)) {
              queuePostWasmTasks<system>(store, creations, creationId, canisterId, onCreationChanged);
            } else {
              queueWasmTasks(store, creations, { creationId; canisterId; releaseTag; initArg; mode }, onCreationChanged);
            };
          };
        };
      };

      case (#InstallFrontend({ canisterId; releaseTag = _ })) {
        queueFrontendTasks<system>(store, creations, creationId, canisterId, onCreationChanged);
      };

      case (#UpdateControllers({ canisterId })) {
        appendCreationEvent(creations, creationId, #UpdatingControllers({ canisterId }), onCreationChanged);

        switch (store.canisterId) {
          case null {
            await finalizeCompletion(store, creations, creationId, canisterId, onCreationChanged);
            ignore creations.mutate(
              creationId,
              func(r) = {
                r with lastUpgradeError = ?("Controller cleanup failed: Deployer canister ID not set")
              },
            );
          };
          case (?deployerCanisterId) {
            // Re-apply backend-derived env vars on every install/upgrade so
            // older storage canisters pick up newly required runtime config.
            let envVars = buildEnvironmentVariables(store, record.envPairs, ?canisterId);

            // Preserve every existing controller except the temporary deployer/backend canister.
            switch (await StorageCanisterOps.updateSettings(canisterId, deployerCanisterId, envVars)) {
              case (#ok) {
                await finalizeCompletion(store, creations, creationId, canisterId, onCreationChanged);
              };
              case (#err(e)) {
                // At this point WASM/frontend installation has already completed.
                // Controller handoff is a cleanup step; failing it must not leave
                // the storage in a failed upgrade state or keep stale release hashes.
                await finalizeCompletion(store, creations, creationId, canisterId, onCreationChanged);
                ignore creations.mutate(
                  creationId,
                  func(r) = {
                    r with lastUpgradeError = ?("Controller cleanup failed: " # e)
                  },
                );
              };
            };
          };
        };
      };

      case (#Complete({ canisterId })) {
        await finalizeCompletion(store, creations, creationId, canisterId, onCreationChanged);
      };
    };
  };

  /// Queue WASM installation tasks
  func requeueWasmTasks(
    store : Store,
    creations : Creations.Creations,
    args : {
      creationId : Nat;
      canisterId : Principal;
      releaseTag : Text;
      initArg : Blob;
      mode : IC.CanisterInstallMode;
    },
  ) {
    let ?record = creations.get(args.creationId) else return;
    let task : UnifiedTask = {
      id = store.nextTaskId;
      creationId = args.creationId;
      owner = record.owner;
      taskType = #Orchestrator({
        owner = record.owner;
        taskType = #InstallWasm({
          canisterId = args.canisterId;
          releaseTag = args.releaseTag;
          initArg = args.initArg;
          mode = args.mode;
        });
      });
      var attempts = 0;
    };
    store.nextTaskId += 1;
    Queue.pushBack(store.unifiedQueue, task);
  };

  func isPendingDownloadError(message : Text) : Bool {
    Text.contains(message, #text "is not completed") or Text.contains(message, #text "not found");
  };

  func queueWasmTasks(
    store : Store,
    creations : Creations.Creations,
    args : {
      creationId : Nat;
      canisterId : Principal;
      releaseTag : Text;
      initArg : Blob;
      mode : IC.CanisterInstallMode;
    },
    onCreationChanged : ?OnCreationChanged,
  ) {
    let { creationId; canisterId; releaseTag; initArg; mode } = args;
    let ?record = creations.get(creationId) else return;

    let statusVariant = switch (mode) {
      case (#install) #InstallingWasm({
        canisterId;
        progress = { processed = 0; total = 0 };
      });
      case (#reinstall) #ReinstallingWasm({
        canisterId;
        progress = { processed = 0; total = 0 };
      });
      case (#upgrade(_)) #UpgradingWasm({
        canisterId;
        progress = { processed = 0; total = 0 };
      });
    };
    appendCreationEvent(creations, creationId, statusVariant, onCreationChanged);

    switch (StorageReleaseRuntime.getWasmBlob(store, releaseTag)) {
      case (#ok(wasmBlob)) {
        let wasmHash = Sha256.fromBlob(#sha256, wasmBlob);

        // Generate tasks from WasmInstaller
        let wasmTasks = WasmInstaller.generateTasks(
          store.wasmInstaller,
          {
            targetCanister = canisterId;
            wasmModule = wasmBlob;
            wasmHash;
            mode;
            initArg;
          },
          record.owner,
          store.nextTaskId,
        );

        // Add to unified queue with creationId
        for (t in wasmTasks.vals()) {
          let taskWithCreationId : UnifiedTask = {
            id = t.id;
            creationId;
            owner = t.owner;
            taskType = t.taskType;
            var attempts = t.attempts;
          };
          Queue.pushBack(store.unifiedQueue, taskWithCreationId);
          store.nextTaskId += 1;
        };

        syncWasmProgressStatus(store, creations, creationId, canisterId, onCreationChanged);
      };
      case (#err(e)) {
        if (isPendingDownloadError(e)) {
          requeueWasmTasks(store, creations, args);
        } else {
          appendCreationEvent(creations, creationId, #Failed("Failed to get WASM: " # e), onCreationChanged);
        };
      };
    };
  };

  /// Decide what to do after WASM install — frontend or finalize directly
  func queuePostWasmTasks<system>(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal, onCreationChanged : ?OnCreationChanged) {
    let ?record = creations.get(creationId) else return;

    if (record.isUpgrade and not record.upgradeIncludesFrontend) {
      // WASM-only upgrade — skip frontend, proceed to revoke + controllers
      queueRevokeInstallerPermission(store, creations, creationId, canisterId);
    } else {
      // Full installation or upgrade with frontend — queue frontend
      queueFrontendTasks<system>(store, creations, creationId, canisterId, onCreationChanged);
    };
  };

  /// Queue frontend installation tasks
  func queueFrontendTasks<system>(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal, onCreationChanged : ?OnCreationChanged) {
    let ?record = creations.get(creationId) else return;

    FrontendInstaller.resetCanisterState(store.frontendInstaller, canisterId);

    let value = { canisterId; progress = { processed = 0; total = 0 } };
    let newStatus = if (record.isUpgrade) #UpgradingFrontend(value) else #UploadingFrontend(value);
    appendCreationEvent(creations, creationId, newStatus, onCreationChanged);

    let versionKey = switch (StorageReleaseRuntime.getFrontendVersionKey(store, record.releaseTag)) {
      case (#ok(key)) key;
      case (#err(e)) {
        appendCreationEvent(creations, creationId, #Failed("Failed to get frontend: " # e), onCreationChanged);
        return;
      };
    };

    switch (FrontendInstaller.generateTasks(store.frontendInstaller, versionKey, canisterId, record.owner, store.nextTaskId, record.isUpgrade)) {
      case (#ok(frontendTasks)) {
        syncFrontendInstallDiagnostics(store, creations, creationId, canisterId);

        // Add to unified queue with creationId
        for (t in frontendTasks.vals()) {
          let taskWithCreationId : UnifiedTask = {
            id = t.id;
            creationId;
            owner = t.owner;
            taskType = t.taskType;
            var attempts = t.attempts;
          };
          Queue.pushBack(store.unifiedQueue, taskWithCreationId);
          store.nextTaskId += 1;
        };

        syncFrontendProgressStatus(store, creations, creationId, canisterId, onCreationChanged);
      };
      case (#err(e)) {
        appendCreationEvent(creations, creationId, #Failed("Failed to generate frontend tasks: " # e), onCreationChanged);
      };
    };
  };

  /// Queue controller update task
  func queueUpdateControllers(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let ?record = creations.get(creationId) else return;

    let task : UnifiedTask = {
      id = store.nextTaskId;
      creationId;
      owner = record.owner;
      taskType = #Orchestrator({
        owner = record.owner;
        taskType = #UpdateControllers({ canisterId });
      });
      var attempts = 0;
    };
    store.nextTaskId += 1;
    Queue.pushBack(store.unifiedQueue, task);
  };

  /// Queue task to revoke installer's Commit permission
  func queueRevokeInstallerPermission(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let ?record = creations.get(creationId) else return;

    let task : UnifiedTask = {
      id = store.nextTaskId;
      creationId;
      owner = record.owner;
      taskType = #RevokeInstallerPermission({ canisterId });
      var attempts = 0;
    };
    store.nextTaskId += 1;
    Queue.pushBack(store.unifiedQueue, task);
  };

  /// Handle task failure
  /// For upgrades: revert to Completed (canister is still alive and functional)
  /// For initial creation: mark as Failed
  func handleTaskFailure(store : Store, creations : Creations.Creations, creationId : Nat, errorMsg : Text, onCreationChanged : ?OnCreationChanged) : async () {
    let ?record = creations.get(creationId) else return;

    purgeQueuedTasksForCreation(store, creationId);
    switch (record.canisterId) {
      case (?canisterId) {
        FrontendInstaller.resetCanisterState(store.frontendInstaller, canisterId);
        WasmInstaller.resetCanisterState(store.wasmInstaller, canisterId);
        ignore await WasmInstaller.clearRemoteChunkStore(canisterId);
      };
      case null {};
    };

    if (record.isUpgrade) {
      // Upgrade failed — canister still exists and works, revert to Completed.
      // Clear upgrade flags + stash the error BEFORE firing the event so the
      // #Completed snapshot persists the explanation.
      let ?canisterId = record.canisterId else {
        appendCreationEvent(creations, creationId, #Failed(errorMsg), onCreationChanged);
        return;
      };
      ignore creations.mutate(
        creationId,
        func(r) = {
          r with isUpgrade = false;
          upgradeIncludesFrontend = false;
          lastUpgradeError = ?errorMsg;
        },
      );
      appendCreationEvent(creations, creationId, #Completed({ canisterId }), onCreationChanged);
    } else {
      appendCreationEvent(creations, creationId, #Failed(errorMsg), onCreationChanged);
    };
  };

  /// Admin recovery for records stuck in a non-terminal state.
  /// Upgrades are reverted to Completed because the canister remains usable;
  /// initial creations are marked Failed so the owner/admin can resume/refund.
  public func recoverStuckCreation(self : Store, creations : Creations.Creations, creationId : Nat, reason : Text) : async Result.Result<(), Text> {
    let ?record = creations.get(creationId) else return #err("creation not found");

    switch (record.status) {
      case (#Completed _) return #err("creation is already completed");
      case (#Failed _) return #err("creation is already failed");
      case _ {};
    };

    purgeQueuedTasksForCreation(self, creationId);
    switch (record.canisterId) {
      case (?canisterId) {
        FrontendInstaller.resetCanisterState(self.frontendInstaller, canisterId);
        WasmInstaller.resetCanisterState(self.wasmInstaller, canisterId);
        ignore await WasmInstaller.clearRemoteChunkStore(canisterId);
      };
      case null {};
    };

    if (record.isUpgrade) {
      let ?canisterId = record.canisterId else {
        ignore creations.mutate(
          creationId,
          func(r) = {
            r with isUpgrade = false;
            upgradeIncludesFrontend = false;
            lastUpgradeError = ?reason;
          },
        );
        ignore creations.appendEvent(creationId, #Failed(reason));
        return #ok;
      };

      ignore creations.mutate(
        creationId,
        func(r) = {
          r with isUpgrade = false;
          upgradeIncludesFrontend = false;
          lastUpgradeError = ?reason;
        },
      );
      ignore creations.appendEvent(creationId, #Completed({ canisterId }));
    } else {
      ignore creations.mutate(
        creationId,
        func(r) = { r with isUpgrade = false; upgradeIncludesFrontend = false },
      );
      ignore creations.appendEvent(creationId, #Failed(reason));
    };

    #ok;
  };

  /// Reinstall WASM for a failed initial creation whose canister already
  /// exists but never reached Completed. This is intentionally narrower than
  /// the regular resume path because `#reinstall` wipes canister state.
  public func reinstallFailedCreationWasm<system>(
    self : Store,
    creations : Creations.Creations,
    creationId : Nat,
    callbacks : OrchestratorCallbacks,
  ) : async Result.Result<(), Text> {
    let ?record = creations.get(creationId) else return #err("creation not found");

    switch (record.status) {
      case (#Failed _) {};
      case _ return #err("creation is not in failed state");
    };

    if (record.isUpgrade) {
      return #err("cannot reinstall WASM for a failed upgrade");
    };
    switch (record.completedAt, record.installedReleaseTag) {
      case (?_, _) return #err("cannot reinstall WASM for a completed creation");
      case (_, ?_) return #err("cannot reinstall WASM for a completed creation");
      case (null, null) {};
    };

    let ?canisterId = record.canisterId else {
      return #err("creation has no canister to reinstall");
    };
    let latestReleaseTag = switch (findReleaseTag(self, #Latest)) {
      case (?tag) tag;
      case null return #err("latest release not found");
    };
    switch (StorageReleaseRuntime.ensureDeploymentReady(self, latestReleaseTag)) {
      case (#ok) {};
      case (#err(message)) return #err(message);
    };

    purgeQueuedTasksForCreation(self, creationId);
    FrontendInstaller.resetCanisterState(self.frontendInstaller, canisterId);
    WasmInstaller.resetCanisterState(self.wasmInstaller, canisterId);
    ignore await WasmInstaller.clearRemoteChunkStore(canisterId);

    ignore creations.mutate(
      creationId,
      func(r) = {
        r with
        releaseTag = latestReleaseTag;
        wasmHash = null;
        frontendHash = null;
        installedReleaseTag = null;
        completedAt = null;
        isUpgrade = false;
        upgradeIncludesFrontend = false;
        lastUpgradeError = null;
        frontendInstallDiagnostics = null;
      },
    );

    queueWasmTasks(
      self,
      creations,
      {
        creationId;
        canisterId;
        releaseTag = latestReleaseTag;
        initArg = record.initArg;
        mode = #reinstall;
      },
      callbacks.onCreationChanged,
    );
    ensureUnifiedTimer<system>(self, creations, callbacks);
    #ok;
  };

  // ═══════════════════════════════════════════════════════════════
  // COMPLETION & UPDATE LOGIC
  // ═══════════════════════════════════════════════════════════════

  /// Finalize creation/upgrade process — update hashes and status.
  /// Ambassador payout is NOT fired here: it already happened at
  /// #CanisterCreated (the refund point of no return).
  func finalizeCompletion(
    store : Store,
    creations : Creations.Creations,
    creationId : Nat,
    canisterId : Principal,
    onCreationChanged : ?OnCreationChanged,
  ) : async () {
    let ?record = creations.get(creationId) else return;
    let releaseTag = record.releaseTag;
    let stateInput = switch (StorageReleasePlanner.buildStateInput(store.githubReleases, releaseTag)) {
      case (#ok(value)) value;
      case (#err(message)) {
        appendCreationEvent(creations, creationId, #Failed("Storage release state sync failed: " # message), onCreationChanged);
        return;
      };
    };

    switch (await StorageCanisterOps.setStorageReleaseState(canisterId, stateInput)) {
      case (#ok) {};
      case (#err(message)) {
        appendCreationEvent(creations, creationId, #Failed("Storage release state sync failed: " # message), onCreationChanged);
        return;
      };
    };

    let nextWasmHash = switch (StorageReleasePlanner.releaseWasmHash(store.githubReleases, releaseTag)) {
      case (#ok(hash)) ?hash;
      case (#err(_)) null;
    };
    let nextFrontendHash = switch (StorageReleasePlanner.releaseFrontendHash(store.githubReleases, releaseTag)) {
      case (#ok(hash)) ?hash;
      case (#err(_)) null;
    };

    // One atomic mutate for hashes + upgrade flags + completedAt, preserving
    // the existing value if GitHub state isn't available yet.
    // `frontendHash` is skipped on WASM-only upgrades (keep the old hash).
    ignore creations.mutate(
      creationId,
      func(r) {
        let wasmHash = switch (nextWasmHash) {
          case (?h) ?h;
          case null r.wasmHash;
        };
        let skipFrontend = r.isUpgrade and not r.upgradeIncludesFrontend;
        let frontendHash = if (skipFrontend) r.frontendHash else switch (nextFrontendHash) {
          case (?h) ?h;
          case null r.frontendHash;
        };
        {
          r with
          wasmHash;
          frontendHash;
          installedReleaseTag = ?releaseTag;
          isUpgrade = false;
          upgradeIncludesFrontend = false;
          lastUpgradeError = null;
          completedAt = ?Time.now();
        };
      },
    );
    appendCreationEvent(creations, creationId, #Completed({ canisterId }), onCreationChanged);
  };

  /// Internal cached badge helper used by listStorages().
  public func checkStorageUpdate(self : Store, creations : Creations.Creations, canisterId : Principal) : ?UpdateInfo {
    let status = getStorageReleaseAdminStatus(self);
    switch (creations.findByCanister(canisterId)) {
      case (?record) StorageReleasePlanner.getUpdateInfo(self.githubReleases, status.releases, record);
      case null null;
    };
  };

  public func validateStorageReleaseOptionsTarget(
    creations : Creations.Creations,
    canisterId : Principal,
  ) : Result.Result<(), UpgradeStorageError> {
    let ?record = creations.findByCanister(canisterId) else {
      return #err(#NotFound);
    };

    switch (record.status) {
      case (#Completed(_)) #ok;
      case (#UpgradingWasm(_) or #UpgradingFrontend(_)) #err(#AlreadyUpgrading);
      case _ #err(#NotCompleted);
    };
  };

  public func getStorageUpgradePlan(
    self : Store,
    creations : Creations.Creations,
    canisterId : Principal,
    remoteState : StorageReleaseState,
  ) : Result.Result<StorageReleaseOptionsResult, UpgradeStorageError> {
    let ?record = creations.findByCanister(canisterId) else {
      return #err(#NotFound);
    };

    switch (record.status) {
      case (#Completed(_)) {};
      case (#UpgradingWasm(_) or #UpgradingFrontend(_)) return #err(#AlreadyUpgrading);
      case _ return #err(#NotCompleted);
    };

    let liveRecord = StorageReleasePlanner.recordWithReleaseState(record, remoteState);

    #ok({
      options = StorageReleasePlanner.getReleaseOptionsForRecord(self.githubReleases, getStorageReleaseAdminStatus(self).releases, liveRecord);
      stateInSync = StorageReleasePlanner.recordMatchesReleaseState(record, remoteState);
    });
  };

  func releaseMatchesWasm(store : Store, releaseTag : Text, wasmHash : Blob) : Bool {
    switch (StorageReleasePlanner.releaseWasmHash(store.githubReleases, releaseTag)) {
      case (#ok(expectedHash)) Blob.equal(expectedHash, wasmHash);
      case (#err(_)) false;
    };
  };

  func syncStorageRecordWithObservedState(
    self : Store,
    creations : Creations.Creations,
    creationId : Nat,
    record : StorageCreationRecord,
    canisterId : Principal,
    observedState : StorageReleaseState,
  ) : async Result.Result<StorageCreationRecord, UpgradeStorageError> {
    let installedWasmHash = switch (await StorageCanisterOps.getInstalledWasmHash(canisterId)) {
      case (#ok(?hash)) hash;
      case (#ok(null)) return #err(#StorageStateDrift("Storage canister has no installed WASM module"));
      case (#err(message)) return #err(#StorageStateDrift(message));
    };

    let knownObservedReleaseTag = switch (observedState.releaseTag) {
      case (?tag) {
        if (releaseMatchesWasm(self, tag, installedWasmHash)) ?tag else null;
      };
      case null null;
    };

    let recordedWasmMatches = switch (record.wasmHash) {
      case (?hash) Blob.equal(hash, installedWasmHash);
      case null false;
    };
    let observedWasmMatches = switch (observedState.wasmHash) {
      case (?hash) Blob.equal(hash, installedWasmHash);
      case null false;
    };

    if (not recordedWasmMatches and not observedWasmMatches and Option.isNull(knownObservedReleaseTag)) {
      return #err(#StorageStateDrift("Installed WASM does not match backend record, observed storage state, or any known storage release"));
    };

    let syncedReleaseTag = switch (knownObservedReleaseTag) {
      case (?tag) tag;
      case null record.releaseTag;
    };
    let syncedInstalledReleaseTag = switch (knownObservedReleaseTag) {
      case (?tag) ?tag;
      case null record.installedReleaseTag;
    };
    let syncedFrontendHash = switch (observedState.frontendAssetTreeHash) {
      case (?hash) ?hash;
      case null record.frontendHash;
    };

    ignore creations.mutate(
      creationId,
      func(r) = {
        r with
        releaseTag = syncedReleaseTag;
        installedReleaseTag = syncedInstalledReleaseTag;
        wasmHash = ?installedWasmHash;
        frontendHash = syncedFrontendHash;
      },
    );

    switch (creations.get(creationId)) {
      case (?syncedRecord) #ok(syncedRecord);
      case null #err(#NotFound);
    };
  };

  func startStorageUpgradeTo<system>(
    self : Store,
    creations : Creations.Creations,
    caller : Principal,
    canisterId : Principal,
    targetReleaseTag : Text,
    observedState : StorageReleaseState,
    callbacks : OrchestratorCallbacks,
  ) : async Result.Result<(), UpgradeStorageError> {
    // 1. Find record
    let ?record = creations.findByCanisterAndOwner(canisterId, caller) else {
      return #err(#NotFound);
    };
    let creationId = record.id;

    // 2. Check status — only completed storages can be upgraded
    switch (record.status) {
      case (#Completed(_)) {};
      case (#UpgradingWasm(_) or #UpgradingFrontend(_)) return #err(#AlreadyUpgrading);
      case _ return #err(#NotCompleted);
    };

    let syncResult = await syncStorageRecordWithObservedState(self, creations, creationId, record, canisterId, observedState);
    let syncedRecord = switch (syncResult) {
      case (#ok(value)) value;
      case (#err(error)) return #err(error);
    };

    // 3. Check for available updates against the selected release
    let updateInfo = switch (StorageReleasePlanner.getUpdateInfoForTag(self.githubReleases, syncedRecord, targetReleaseTag)) {
      case (#ok(?info)) info;
      case (#ok(null)) return #err(#NoUpdateAvailable);
      case (#err(error)) return #err(error);
    };

    // 4. Set upgrade flags
    let needsWasm = updateInfo.wasmUpdateAvailable;
    let needsFrontend = updateInfo.frontendUpdateAvailable;

    switch (StorageReleaseRuntime.ensureDeploymentReady(self, targetReleaseTag)) {
      case (#ok) {};
      case (#err(_)) {
        ignore StorageReleaseRuntime.prepareReleaseDownloads<system>(self, targetReleaseTag, callbacks.onAssetDownloaded);
        return #err(#ReleaseNotReady);
      };
    };

    ignore creations.mutate(
      creationId,
      func(r) = {
        r with releaseTag = targetReleaseTag;
        isUpgrade = true;
        upgradeIncludesFrontend = needsFrontend;
        lastUpgradeError = null;
      },
    );

    // 5. Queue tasks
    if (needsWasm) {
      // WASM upgrade — mode = #upgrade, use original initArg (required for post_upgrade)
      queueWasmTasks(self, creations, { creationId; canisterId; releaseTag = targetReleaseTag; initArg = syncedRecord.initArg; mode = #upgrade(?{ wasm_memory_persistence = ?#keep; skip_pre_upgrade = ?false }) }, callbacks.onCreationChanged);
      // If frontend also needed, it will be queued after WASM completes
      // (queuePostWasmTasks handles this after #WasmInstallCode/#WasmInstallChunked)
    } else if (needsFrontend) {
      // Frontend only
      queueFrontendTasks<system>(self, creations, creationId, canisterId, callbacks.onCreationChanged);
    };

    // Start queue processing
    ensureUnifiedTimer<system>(self, creations, callbacks);

    #ok;
  };

  public func startStorageUpgrade<system>(
    self : Store,
    creations : Creations.Creations,
    caller : Principal,
    canisterId : Principal,
    releaseTag : Text,
    observedState : StorageReleaseState,
    callbacks : OrchestratorCallbacks,
  ) : async Result.Result<(), UpgradeStorageError> {
    refreshRuntimeConfig<system>(self);
    await startStorageUpgradeTo<system>(self, creations, caller, canisterId, releaseTag, observedState, callbacks);
  };

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  func mapToStorageInfo(store : Store, record : StorageCreationRecord) : StorageInfo {
    {
      id = record.id;
      canisterId = record.canisterId;
      status = record.status;
      releaseTag = record.releaseTag;
      createdAt = record.createdAt;
      completedAt = record.completedAt;
      updateAvailable = StorageReleasePlanner.getUpdateInfo(store.githubReleases, getStorageReleaseAdminStatus(store).releases, record);
      lastUpgradeError = record.lastUpgradeError;
      frontendInstallDiagnostics = record.frontendInstallDiagnostics;
    };
  };

  /// List all storages for a user with their current status
  public func listStorages(self : Store, creations : Creations.Creations, caller : Principal) : [StorageInfo] {
    Array.map<StorageCreationRecord, StorageInfo>(
      creations.listByOwner(caller),
      func(r) = mapToStorageInfo(self, r),
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // LICENSE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /// Add a license for a user. Rejects duplicates by paymentId.
  // --- License operations (delegated to ZenDB collection) ---
  //
  // `licenses` is a transient class handle owned by the actor (main.mo). We
  // pass it as an argument rather than storing it on `Store` because class
  // closures aren't stable-serializable — holding it on Store would force
  // the whole orchestrator to be transient and lose creation-record
  // persistence across upgrades.

  public func addLicense(
    licenses : Licenses.Licenses,
    owner : Principal,
    receipt : Types.PaymentReceipt,
    storageEntitlement : Types.StorageLicenseEntitlement,
  ) : Result.Result<(), { #DuplicatePayment }> {
    switch (licenses.add(owner, receipt, storageEntitlement)) {
      case (#ok) #ok;
      case (#err e) #err(e);
    };
  };

  public func findLicenseByPaymentId(licenses : Licenses.Licenses, owner : Principal, paymentId : Text) : ?Types.License {
    licenses.findByPaymentId(owner, paymentId);
  };

  public func findLicenseByCanister(licenses : Licenses.Licenses, canisterId : Principal) : ?Types.License {
    licenses.findByCanister(canisterId);
  };

  public func markLicenseRefunded(
    licenses : Licenses.Licenses,
    owner : Principal,
    paymentId : Text,
    blockIndex : ?Nat,
    reason : Text,
  ) : Bool {
    licenses.markRefunded(owner, paymentId, blockIndex, reason);
  };

  public func findUnboundLicense(licenses : Licenses.Licenses, owner : Principal) : ?Types.License {
    licenses.findUnbound(owner);
  };

  public func listLicenses(licenses : Licenses.Licenses, owner : Principal) : [Types.License] {
    licenses.listByOwner(owner);
  };

  /// Flexible license query with pagination + filters. Enforces auth at the
  /// API layer (main.mo) by pinning `filter.owner = [caller]` for non-admins.
  public func listLicensesWithOptions(licenses : Licenses.Licenses, options : Types.ListLicensesOptions) : Types.GetLicensesResponse {
    licenses.list(options);
  };

  /// Delete a storage record.
  /// Allowed when:
  ///   - status is #Failed, OR
  ///   - status is #ProcessingPayment/#Pending AND no licensePaymentId
  ///     (payment did not complete, so no receipt would be orphaned)
  public func deleteStorage(creations : Creations.Creations, caller : Principal, storageId : Nat) : Result.Result<(), DeleteStorageError> {
    // 1. Find the record
    let ?record = creations.get(storageId) else {
      return #err(#NotFound);
    };

    // 2. Check ownership
    if (not Principal.equal(record.owner, caller)) {
      return #err(#NotOwner);
    };

    // 3. Check status eligibility
    switch (record.status, record.licensePaymentId) {
      case (#Failed(_), _) {};
      case (#ProcessingPayment _, null) {};
      case (#Pending, null) {};
      case _ return #err(#NotFailed);
    };

    creations.remove(storageId);
    #ok;
  };

  /// Advance record status with tag-based dedup. Every call persists to
  /// ZenDB (no-op if the id is gone). This is a thin wrapper so callers
  /// outside this module don't have to reach into `creations` directly.
  public func appendEvent(
    creations : Creations.Creations,
    creationId : Nat,
    status : CreationStatus,
  ) {
    ignore creations.appendEvent(creationId, status);
  };

  /// Update the deferred ambassador payout status on a creation record.
  /// Called from the actor's `payAmbassadorShareForPayment` after the
  /// treasury transfer lands. Keeps the ZenDB-filterable `tag` shadow
  /// field in sync. No-op if the creation id is gone.
  public func setAmbassadorPayoutStatus(
    creations : Creations.Creations,
    creationId : Nat,
    status : Types.AmbassadorPayoutStatus,
  ) {
    ignore creations.mutate(
      creationId,
      func(r) = {
        r with
        ambassadorPayoutStatus = status;
        ambassadorPayoutStatusTag = Types.tagOfAmbassadorPayoutStatus(status);
      },
    );
  };

  /// Lookup the owner of a creation record. Callers use this to decide
  /// whether the requester is allowed to read/modify it.
  public func getCreationOwner(creations : Creations.Creations, creationId : Nat) : ?Principal {
    switch (creations.get(creationId)) {
      case (?record) ?record.owner;
      case null null;
    };
  };

  /// Remove a refunded creation record. Unlike `deleteStorage`, this bypasses
  /// status checks — caller is responsible for validating that the refund has
  /// already happened (license receipt is `#refunded`).
  public func removeRefundedCreation(creations : Creations.Creations, creationId : Nat) : Bool {
    switch (creations.get(creationId)) {
      case null false;
      case (?_) {
        creations.remove(creationId);
        true;
      };
    };
  };

  /// Read-only view of a creation record. Returns null if not found.
  public func getCreationRecordById(creations : Creations.Creations, creationId : Nat) : ?StorageCreationRecord {
    creations.get(creationId);
  };

  /// Get current active creation status for a user (in-progress creation)
  public func getCreationStatus(creations : Creations.Creations, caller : Principal) : ?CreationStatus {
    switch (creations.findActiveByOwner(caller)) {
      case (?record) ?record.status;
      case null null;
    };
  };

  /// Get creation status by ID
  public func getCreationStatusById(creations : Creations.Creations, creationId : Nat) : ?CreationStatus {
    switch (creations.get(creationId)) {
      case (?record) ?record.status;
      case null null;
    };
  };

  // -- Extraction Status --

  public type ExtractionStatus = StorageReleaseRuntime.ExtractionStatus;
  public type ReleasesFullStatus = StorageReleaseRuntime.ReleasesFullStatus;

  /// Get extraction status for a specific version key
  public func getExtractionStatus(self : Store, versionKey : Text) : ExtractionStatus {
    StorageReleaseRuntime.getExtractionStatus(self, versionKey);
  };

  /// Check if frontend extraction is complete for the default version
  public func isFrontendExtractionComplete(self : Store) : Bool {
    StorageReleaseRuntime.isFrontendExtractionComplete(self);
  };

  /// Create an extraction info provider for status queries
  public func createExtractionInfoProvider(self : Store) : GitHubReleases.ExtractionInfoProvider {
    StorageReleaseRuntime.createExtractionInfoProvider(self);
  };

  /// Get comprehensive status of all releases including extraction progress
  public func getStorageReleaseAdminStatus(self : Store) : GitHubReleases.ReleasesFullStatus {
    StorageReleaseRuntime.getStorageReleaseAdminStatus(self);
  };

  /// Manually trigger a refresh of releases (for debugging/recovery)
  public func refreshStorageReleaseIndex<system>(self : Store, transform : ReleaseListTransform, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : async () {
    refreshRuntimeConfig<system>(self);
    await StorageReleaseRuntime.refreshStorageReleaseIndex<system>(self, transform, onAssetDownloaded);
  };

  /// Get hashes of all downloaded storage WASM releases.
  public func getDownloadedWasmHashes(self : Store) : [(Blob, Text)] {
    StorageReleaseRuntime.getDownloadedWasmHashes(self);
  };

  /// Find the owner of a canister by its ID (reverse lookup via creation records)
  public func findOwnerByCanister(creations : Creations.Creations, canisterId : Principal) : ?Principal {
    creations.findOwnerByCanister(canisterId);
  };
};
