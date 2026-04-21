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
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import IC "mo:ic";

import ICManagement "../Types/ICManagement";
// ZenDB is used transitively through the `Creations` / `Licenses` class handles.
import Creations "Creations";
import GitHubReleases "GitHubReleases";
import HttpDownloader "HttpDownloader";
import Licenses "Licenses";
import StorageDeployer "StorageDeployer";
import WasmInstaller "WasmInstaller";
import FrontendInstaller "FrontendInstaller";
import Types "Types";
import LedgerTypes "../Types/LedgerTypes";
import CMCTypes "../Types/CMCTypes";
import HttpAssetsTypes "mo:http-assets/BaseAssets/Types";

module StorageDeployerOrchestrator {

  // -- Re-exported Types --

  public type SizedPointer = Types.SizedPointer;
  public type Progress = Types.Progress;
  public type File = Types.File;
  public type FileMetadata = Types.FileMetadata;
  public type ReleaseSelector = Types.ReleaseSelector;
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

  public type StartCallbacks = {
    onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ());
    /// Callbacks attached to orchestrator async work (task queue).
    /// `bindLicense` fires when a canister is minted and a license is
    /// already attached, giving the actor a chance to bind the license
    /// receipt to the new canister id.
    orchestrator : OrchestratorCallbacks;
  };
  public type UpdateInfo = Types.UpdateInfo;
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

  public let DEFAULT_LIST_LICENSES_OPTIONS = Types.DEFAULT_LIST_LICENSES_OPTIONS;
  public let DEFAULT_LIST_CREATIONS_OPTIONS = Types.DEFAULT_LIST_CREATIONS_OPTIONS;

  /// Delay between unified queue operations (ms)
  let UNIFIED_QUEUE_DELAY_MS : Nat = 100;

  /// Maximum retry attempts for GitHub API calls
  let MAX_GITHUB_RETRY_ATTEMPTS : Nat = 3;

  /// Initial delay for retry backoff (seconds)
  let INITIAL_RETRY_DELAY_SECONDS : Nat = 5;

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

  /// Bundle of callbacks threaded through the orchestrator's async task
  /// machinery. Using a record (rather than separate params) keeps the
  /// signature stable as more hooks are added.
  public type OrchestratorCallbacks = {
    bindLicense : ?BindLicense;
    payAmbassadorShare : ?PayAmbassadorShare;
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
  public func new(
    config : {
      github : GitHubReleases.GithubOptions;
      assets : [(GitHubReleases.ReleaseSelector, [GitHubReleases.GithubAsset])];
      vetKeyName : Text;
      cashierCanisterId : Principal;
    }
  ) : Store {
    let region = MemoryRegion.new();
    {
      var canisterId = null;
      region;
      var vetKeyName : ?Text = ?config.vetKeyName;
      var cashierCanisterId : ?Principal = ?config.cashierCanisterId;
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

  func buildEnvironmentVariables(store : Store, custom : ?[Types.EnvPair]) : ?[Types.EnvPair] {
    let ?backendId = store.canisterId else return null;
    let ?vetKey = store.vetKeyName else return null;
    let ?cashier = store.cashierCanisterId else return null;

    let set = Set.fromArray<Types.EnvPair>(
      [
        { name = "RABBITHOLE_BACKEND_ID"; value = Principal.toText(backendId) },
        { name = "VETKEY_NAME"; value = vetKey },
        {
          name = "CAFFFEINE_STORAGE_CASHIER_PRINCIPAL";
          value = Principal.toText(cashier);
        },
      ],
      compareEnvPairByName,
    );

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
  public func start<system>(store : Store, creations : Creations.Creations, callbacks : StartCallbacks) : async () {
    if (store.running) return;

    // Reset transient state (meaningless after canister upgrade)
    resetTransientState(store, creations);

    store.running := true;

    // 1. Start release check
    await checkAndDownloadReleases<system>(store, callbacks.onAssetDownloaded);
    store.githubTimerId := ?Timer.recurringTimer<system>(
      #days 1,
      func() : async () {
        // Reset retry count for daily check to allow fresh retry attempts
        store.fetchRetryCount := 0;
        await checkAndDownloadReleases<system>(store, callbacks.onAssetDownloaded);
      },
    );

    // 2. Downloader timer (activates when queue has items)
    ensureDownloaderTimer<system>(store, callbacks.onAssetDownloaded);

    // 3. Unified timer (activates when queue has items)
    ensureUnifiedTimer<system>(store, creations, callbacks.orchestrator);
  };

  /// Stop all orchestrator timers and subsystems
  public func stop<system>(store : Store) : () {
    store.running := false;

    // Cancel ALL timers centrally
    cancelTimer(store.githubTimerId);
    store.githubTimerId := null;

    cancelTimer(store.downloaderTimerId);
    store.downloaderTimerId := null;

    cancelTimer(store.unifiedTimerId);
    store.unifiedTimerId := null;

    cancelTimer(store.retryTimerId);
    store.retryTimerId := null;

    // Reset retry state
    store.fetchRetryCount := 0;
  };

  /// Check if the orchestrator is currently running
  public func isRunning(store : Store) : Bool {
    store.running;
  };

  // Ensure downloader timer is running if there are pending requests
  func ensureDownloaderTimer<system>(store : Store, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) {
    if (Queue.isEmpty(store.githubReleases.downloaderStore.requests)) {
      cancelTimer(store.downloaderTimerId);
      store.downloaderTimerId := null;

      // Downloads completed - trigger extraction if frontend is ready
      tryStartFrontendExtraction<system>(store);

      // CRITICAL: Recheck queue after extraction - new downloads might have been queued
      if (not Queue.isEmpty(store.githubReleases.downloaderStore.requests) and Option.isNull(store.downloaderTimerId)) {
        store.downloaderTimerId := ?Timer.recurringTimer<system>(
          #milliseconds 100,
          func() : async () {
            await HttpDownloader.runRequests(store.githubReleases.downloaderStore, onAssetDownloaded);
            ensureDownloaderTimer<system>(store, onAssetDownloaded);
          },
        );
      };
    } else if (Option.isNull(store.downloaderTimerId)) {
      store.downloaderTimerId := ?Timer.recurringTimer<system>(
        #milliseconds 100,
        func() : async () {
          await HttpDownloader.runRequests(store.githubReleases.downloaderStore, onAssetDownloaded);
          ensureDownloaderTimer<system>(store, onAssetDownloaded);
        },
      );
    };
  };

  // Try to start frontend extraction if assets are downloaded
  func tryStartFrontendExtraction<system>(store : Store) {
    switch (GitHubReleases.latestStorageFrontend(store.githubReleases)) {
      case (#ok(details)) {
        let versionKey = "storage-frontend@latest";
        switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, versionKey)) {
          case (#Idle) {
            FrontendInstaller.add<system>(
              store.frontendInstaller,
              {
                versionKey;
                hash = details.sha256;
                contentPointer = (MemoryRegion.addBlob(store.region, details.content), details.size);
                isGzipped = Text.endsWith(details.name, #text ".gz");
              },
            );
          };
          case _ {};
        };
      };
      case (#err(_)) {};
    };
  };

  // Ensure unified timer is running if there are pending tasks.
  // `callbacks` is captured by the timer closure and forwarded through to
  // the per-task handler (processOrchestratorTask).
  func ensureUnifiedTimer<system>(store : Store, creations : Creations.Creations, callbacks : OrchestratorCallbacks) {
    if (Queue.isEmpty(store.unifiedQueue)) {
      cancelTimer(store.unifiedTimerId);
      store.unifiedTimerId := null;
    } else if (Option.isNull(store.unifiedTimerId)) {
      store.unifiedTimerId := ?Timer.setTimer<system>(
        #milliseconds 0,
        func() : async () { await processUnifiedQueue<system>(store, creations, callbacks) },
      );
    };
  };

  // Check and download releases from GitHub with retry logic
  func checkAndDownloadReleases<system>(store : Store, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : async () {
    // Cancel any pending retry timer
    cancelTimer(store.retryTimerId);
    store.retryTimerId := null;

    switch (await GitHubReleases.listReleases(store.githubReleases)) {
      case (#ok({ releases = _; invalidated })) {
        // Success - reset retry state and record success
        store.fetchRetryCount := 0;
        store.lastFetchError := null;
        store.lastFetchTime := ?Time.now();

        // Handle invalidated assets - clear extracted data for frontend assets
        for ({ key = _; kind } in invalidated.vals()) {
          switch (kind) {
            case (#StorageFrontend) {
              // Invalidate extracted frontend files
              let versionKey = "storage-frontend@latest";
              FrontendInstaller.invalidateVersion<system>(store.frontendInstaller, versionKey);
            };
            case (#StorageWASM) {
              // WASM doesn't need additional cleanup - already removed from HttpDownloader
            };
          };
        };

        // Ensure downloader timer is running for any queued downloads
        ensureDownloaderTimer<system>(store, onAssetDownloaded);

        // Try to start frontend extraction if downloads are complete
        tryStartFrontendExtraction<system>(store);
      };
      case (#err(errorMsg)) {
        // Record error
        store.lastFetchError := ?errorMsg;
        store.lastFetchTime := ?Time.now();

        // Schedule retry with exponential backoff if within retry limits
        if (store.fetchRetryCount < MAX_GITHUB_RETRY_ATTEMPTS) {
          store.fetchRetryCount += 1;

          // Exponential backoff: 5s, 10s, 20s, 40s, 80s
          let delaySeconds = INITIAL_RETRY_DELAY_SECONDS * Nat.pow(2, store.fetchRetryCount - 1);

          store.retryTimerId := ?Timer.setTimer<system>(
            #seconds delaySeconds,
            func() : async () {
              if (store.running) {
                await checkAndDownloadReleases<system>(store, onAssetDownloaded);
              };
            },
          );
        };
        // After MAX_GITHUB_RETRY_ATTEMPTS, wait for daily timer
      };
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
      events;
      ambassadorPayoutStatus;
      ambassadorPayoutStatusTag = Types.tagOfAmbassadorPayoutStatus(ambassadorPayoutStatus);
    };
  };

  /// Start creating a new storage canister for the caller
  public func createStorage<system>(
    store : Store,
    creations : Creations.Creations,
    caller : Principal,
    options : CreateStorageOptions,
    callbacks : OrchestratorCallbacks,
  ) : Result.Result<(), CreateStorageError> {
    // 1. Check that release is downloaded
    let releaseTag = switch (findReleaseTag(store, options.releaseSelector)) {
      case (?tag) tag;
      case null return #err(#ReleaseNotFound);
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
    let creationId = store.nextCreationId;
    store.nextCreationId += 1;

    let existingCanisterId = switch (options.target) {
      case (#Existing(id)) ?id;
      case (#Create(_)) null;
    };

    creations.add(
      // createStorage (direct, no payment flow) → no license, no payout expected.
      newRecord(creationId, caller, releaseTag, options.initArg, options.envPairs, existingCanisterId, null, #Pending, null, [], #skipped),
    );

    // 5. Add initial orchestrator task
    let taskType : TaskType = switch (options.target) {
      case (#Existing(existingId)) #LinkCanister({ canisterId = existingId });
      case (#Create(_)) #CreateCanister({ options });
    };

    let task : UnifiedTask = {
      id = store.nextTaskId;
      creationId;
      owner = caller;
      taskType = #Orchestrator({ owner = caller; taskType });
      var attempts = 0;
    };
    store.nextTaskId += 1;
    Queue.pushBack(store.unifiedQueue, task);

    // 6. Start queue processing
    ensureUnifiedTimer<system>(store, creations, callbacks);

    #ok;
  };

  /// Create a storage record with #ProcessingPayment status (no tasks queued).
  /// Used by purchaseLicenseAndCreateStorage: record is visible in listStorages immediately.
  public func createStorageRecord<system>(
    store : Store,
    creations : Creations.Creations,
    caller : Principal,
    options : CreateStorageOptions,
  ) : Result.Result<Nat, CreateStorageError> {
    let releaseTag = switch (findReleaseTag(store, options.releaseSelector)) {
      case (?tag) tag;
      case null return #err(#ReleaseNotFound);
    };

    switch (creations.findActiveByOwner(caller)) {
      case (?_) return #err(#AlreadyInProgress);
      case null {};
    };

    let creationId = store.nextCreationId;
    store.nextCreationId += 1;

    let initialStatus : CreationStatus = #ProcessingPayment(#Starting);
    // Seed the timeline with the initial `Starting` event — subsequent
    // appendEvent calls extend the history from here.
    let seedEvent : Types.StatusEvent = { status = initialStatus; timestamp = Time.now() };

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
    store : Store,
    creations : Creations.Creations,
    creationId : Nat,
    options : CreateStorageOptions,
    callbacks : OrchestratorCallbacks,
  ) : Result.Result<(), Text> {
    let ?record = creations.get(creationId) else return #err("Creation record not found");

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

    ignore creations.appendEvent(creationId, #Pending);

    let taskType : TaskType = switch (options.target) {
      case (#Existing(existingId)) #LinkCanister({ canisterId = existingId });
      case (#Create(_)) #CreateCanister({ options });
    };

    let task : UnifiedTask = {
      id = store.nextTaskId;
      creationId;
      owner = record.owner;
      taskType = #Orchestrator({ owner = record.owner; taskType });
      var attempts = 0;
    };
    store.nextTaskId += 1;
    Queue.pushBack(store.unifiedQueue, task);

    ensureUnifiedTimer<system>(store, creations, callbacks);

    #ok;
  };

  /// Register an externally deployed storage canister.
  /// Verifies WASM hash via canister_info against known hashes.
  /// Creates a record so findOwnerByCanister resolves this canister to the caller.
  public func addStorage(
    store : Store,
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
    let info = await IC.ic.canister_info({
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

    let creationId = store.nextCreationId;
    store.nextCreationId += 1;

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
      ),
    );

    #ok(creationId);
  };

  func findReleaseTag(_store : Store, selector : ReleaseSelector) : ?Text {
    switch (selector) {
      case (#Latest or #LatestDraft or #LatestPrerelease) ?"latest";
      case (#Version(tag)) ?tag;
    };
  };

  func getWasmBlob(store : Store, _releaseTag : Text) : Result.Result<Blob, Text> {
    switch (GitHubReleases.latestStorageWasm(store.githubReleases)) {
      case (#ok(details)) #ok(details.content);
      case (#err(e)) #err(e);
    };
  };

  func updateCanisterSettings(
    storageCanisterId : Principal,
    userPrincipal : Principal,
    environmentVariables : ?[{ name : Text; value : Text }],
  ) : async Result.Result<(), Text> {
    let ic : ICManagement.Self = actor ("aaaaa-aa");
    try {
      await ic.update_settings({
        canister_id = storageCanisterId;
        sender_canister_version = null;
        settings = {
          controllers = ?[userPrincipal];
          freezing_threshold = null;
          wasm_memory_threshold = null;
          reserved_cycles_limit = null;
          log_visibility = null;
          snapshot_visibility = null;
          wasm_memory_limit = null;
          memory_allocation = null;
          compute_allocation = null;
          environment_variables = environmentVariables;
        };
      });
      #ok(());
    } catch (error) {
      #err("Failed to update settings: " # Error.message(error));
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // UNIFIED QUEUE PROCESSOR
  // ═══════════════════════════════════════════════════════════════

  /// Process the unified queue - single timer, sequential execution
  func processUnifiedQueue<system>(store : Store, creations : Creations.Creations, callbacks : OrchestratorCallbacks) : async () {
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
                  syncWasmProgressStatus(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, creations, task.creationId, "WASM chunk upload failed: " # e);
                };
              };
            };
            case (#WasmInstallCode(args)) {
              switch (await WasmInstaller.executeInstallCode(store.wasmInstaller, args)) {
                case (#ok) {
                  queuePostWasmTasks<system>(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, creations, task.creationId, "WASM install failed: " # e);
                };
              };
            };
            case (#WasmInstallChunked(args)) {
              switch (await WasmInstaller.executeInstallChunked(store.wasmInstaller, args)) {
                case (#ok) {
                  queuePostWasmTasks<system>(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, creations, task.creationId, "WASM chunked install failed: " # e);
                };
              };
            };
            case (#FrontendCreateBatch(args)) {
              switch (await FrontendInstaller.executeCreateBatch(store.frontendInstaller, args.canisterId)) {
                case (#ok(_)) {};
                case (#err(e)) {
                  handleTaskFailure(store, creations, task.creationId, "Frontend create batch failed: " # e);
                };
              };
            };
            case (#FrontendUploadChunks(args)) {
              switch (await FrontendInstaller.executeUploadChunks(store.frontendInstaller, args.canisterId, args.files)) {
                case (#ok) {
                  syncFrontendProgressStatus(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, creations, task.creationId, "Frontend upload chunks failed: " # e);
                };
              };
            };
            case (#FrontendCommitBatch(args)) {
              switch (await FrontendInstaller.executeCommitBatch(store.frontendInstaller, args.canisterId)) {
                case (#ok) {
                  // Frontend complete - revoke installer permission, then update controllers
                  queueRevokeInstallerPermission(store, creations, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, creations, task.creationId, "Frontend commit failed: " # e);
                };
              };
            };
            case (#RevokeInstallerPermission(args)) {
              let ?deployerCanisterId = store.canisterId else {
                handleTaskFailure(store, creations, task.creationId, "Deployer canister ID not set");
                return;
              };

              // Update status
              ignore creations.appendEvent(task.creationId, #RevokingInstallerPermission({ canisterId = args.canisterId }));

              // Use http-assets interface to revoke permission
              let assetsCanister = actor (Principal.toText(args.canisterId)) : HttpAssetsTypes.AssetsInterface;

              try {
                await assetsCanister.revoke_permission({
                  of_principal = deployerCanisterId;
                  permission = #Commit;
                });
              } catch (error) {
                // Log but don't fail - permission might already be revoked
                // Or installer might not have had permission (owner == installer case)
              };

              // After revoke - queue controller update
              queueUpdateControllers(store, creations, task.creationId, args.canisterId);
            };
          };
        } catch (error) {
          let errMsg = Error.message(error);
          if (task.attempts < 3) {
            task.attempts += 1;
            Queue.pushBack(store.unifiedQueue, task);
          } else {
            handleTaskFailure(store, creations, task.creationId, "Task failed after 3 attempts: " # errMsg);
          };
        };

        // Schedule next iteration with delay
        store.unifiedTimerId := ?Timer.setTimer<system>(
          #milliseconds UNIFIED_QUEUE_DELAY_MS,
          func() : async () { await processUnifiedQueue<system>(store, creations, callbacks) },
        );
      };
      case null {
        // Queue is empty - cancel timer
        cancelTimer(store.unifiedTimerId);
        store.unifiedTimerId := null;
      };
    };
  };

  func syncWasmProgressStatus(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let ?record = creations.get(creationId) else return;

    let syncVariant = func(progress : Types.Progress) : Types.CreationStatus {
      if (record.isUpgrade) {
        #UpgradingWasm({ canisterId; progress });
      } else {
        #InstallingWasm({ canisterId; progress });
      };
    };

    switch (WasmInstaller.getStatus(store.wasmInstaller, canisterId)) {
      case (?#UploadingChunks(progress)) {
        ignore creations.appendEvent(creationId, syncVariant({ processed = progress.uploaded; total = progress.total }));
      };
      case (?#Pending) {
        ignore creations.appendEvent(creationId, syncVariant({ processed = 0; total = 0 }));
      };
      case (?#Installing) {
        ignore creations.appendEvent(creationId, syncVariant({ processed = 0; total = 0 }));
      };
      case _ {};
    };
  };

  func syncFrontendProgressStatus(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let ?record = creations.get(creationId) else return;

    switch (FrontendInstaller.getInstallationStatus(store.frontendInstaller, canisterId)) {
      case (?#Uploading(progress)) {
        let progressInfo = { processed = progress.processed; total = progress.total };
        let newStatus = if (record.isUpgrade) {
          #UpgradingFrontend({ canisterId; progress = progressInfo });
        } else {
          #UploadingFrontend({ canisterId; progress = progressInfo });
        };
        ignore creations.appendEvent(creationId, newStatus);
      };
      case _ {};
    };
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
  ) : async* () {
    ignore creations.mutate(creationId, func(r) = { r with canisterId = ?canisterId });
    ignore creations.appendEvent(creationId, #CanisterCreated({ canisterId }));

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

    switch (task.taskType) {
      case (#CreateCanister({ options })) {
        let ?deployerCanisterId = store.canisterId else {
          ignore creations.appendEvent(creationId, #Failed("Deployer canister ID not set"));
          return;
        };

        ignore creations.appendEvent(creationId, #CheckingBalance);

        let { initialCycles; subnetId } = switch (options.target) {
          case (#Create(params)) params;
          case (#Existing(_)) {
            ignore creations.appendEvent(creationId, #Failed("CreateCanister task received Existing target"));
            return;
          };
        };

        let envVars = buildEnvironmentVariables(store, record.envPairs);
        switch (await StorageDeployer.transferAndCreateCanister(deployerCanisterId, task.owner, initialCycles, subnetId, envVars)) {
          case (#ok(canisterId)) {
            await* onCanisterAssigned(creations, creationId, task.owner, canisterId, record.licensePaymentId, bindLicense, payAmbassadorShare);
            queueWasmTasks(store, creations, { creationId; canisterId; releaseTag = record.releaseTag; initArg = record.initArg; mode = #install });
          };
          case (#err(e)) {
            let errorMsg = switch (e) {
              case (#InsufficientBalance(_)) "Insufficient balance";
              case (#TransferFailed(_)) "Transfer failed";
              case (#NotifyFailed(_)) "CMC notification failed";
            };
            ignore creations.appendEvent(creationId, #Failed("Canister creation failed: " # errorMsg));
          };
        };
      };

      case (#LinkCanister({ canisterId })) {
        // Link path (resume of a failed creation whose canister was already
        // minted) — same side effects as CreateCanister. Ambassador payout
        // dedup protects against double-pay if the original CreateCanister
        // already fired it.
        await* onCanisterAssigned(creations, creationId, task.owner, canisterId, record.licensePaymentId, bindLicense, payAmbassadorShare);
        queueWasmTasks(store, creations, { creationId; canisterId; releaseTag = record.releaseTag; initArg = record.initArg; mode = #install });
      };

      case (#InstallWasm({ canisterId; releaseTag; initArg })) {
        // This case handles legacy flow - shouldn't be reached in new architecture
        queueWasmTasks(store, creations, { creationId; canisterId; releaseTag; initArg; mode = #install });
      };

      case (#InstallFrontend({ canisterId; releaseTag = _ })) {
        // This case handles legacy flow - shouldn't be reached in new architecture
        queueFrontendTasks<system>(store, creations, creationId, canisterId);
      };

      case (#UpdateControllers({ canisterId })) {
        ignore creations.appendEvent(creationId, #UpdatingControllers({ canisterId }));

        // env vars already set at canister creation; null = don't overwrite
        switch (await updateCanisterSettings(canisterId, task.owner, null)) {
          case (#ok) {
            finalizeCompletion(store, creations, creationId, canisterId);
          };
          case (#err(e)) {
            ignore creations.appendEvent(creationId, #Failed("Controller update failed: " # e));
          };
        };
      };

      case (#Complete({ canisterId })) {
        finalizeCompletion(store, creations, creationId, canisterId);
      };
    };
  };

  /// Queue WASM installation tasks
  func queueWasmTasks(
    store : Store,
    creations : Creations.Creations,
    args : { creationId : Nat; canisterId : Principal; releaseTag : Text; initArg : Blob; mode : IC.CanisterInstallMode },
  ) {
    let { creationId; canisterId; releaseTag; initArg; mode } = args;
    let ?record = creations.get(creationId) else return;

    let statusVariant = switch (mode) {
      case (#install or #reinstall) #InstallingWasm({
        canisterId;
        progress = { processed = 0; total = 0 };
      });
      case (#upgrade(_)) #UpgradingWasm({
        canisterId;
        progress = { processed = 0; total = 0 };
      });
    };
    ignore creations.appendEvent(creationId, statusVariant);

    switch (getWasmBlob(store, releaseTag)) {
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

        syncWasmProgressStatus(store, creations, creationId, canisterId);
      };
      case (#err(e)) {
        ignore creations.appendEvent(creationId, #Failed("Failed to get WASM: " # e));
      };
    };
  };

  /// Decide what to do after WASM install — frontend or finalize directly
  func queuePostWasmTasks<system>(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let ?record = creations.get(creationId) else return;

    if (record.isUpgrade and not record.upgradeIncludesFrontend) {
      // WASM-only upgrade — skip frontend, proceed to revoke + controllers
      queueRevokeInstallerPermission(store, creations, creationId, canisterId);
    } else {
      // Full installation or upgrade with frontend — queue frontend
      queueFrontendTasks<system>(store, creations, creationId, canisterId);
    };
  };

  /// Queue frontend installation tasks
  func queueFrontendTasks<system>(store : Store, creations : Creations.Creations, creationId : Nat, canisterId : Principal) {
    let ?record = creations.get(creationId) else return;

    let value = { canisterId; progress = { processed = 0; total = 0 } };
    let newStatus = if (record.isUpgrade) #UpgradingFrontend(value) else #UploadingFrontend(value);
    ignore creations.appendEvent(creationId, newStatus);

    let versionKey = "storage-frontend@latest";

    switch (FrontendInstaller.generateTasks(store.frontendInstaller, versionKey, canisterId, record.owner, store.nextTaskId, record.isUpgrade)) {
      case (#ok(frontendTasks)) {
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

        syncFrontendProgressStatus(store, creations, creationId, canisterId);
      };
      case (#err(e)) {
        ignore creations.appendEvent(creationId, #Failed("Failed to generate frontend tasks: " # e));
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
  func handleTaskFailure(store : Store, creations : Creations.Creations, creationId : Nat, errorMsg : Text) {
    let ?record = creations.get(creationId) else return;
    if (record.isUpgrade) {
      // Upgrade failed — canister still exists and works, revert to Completed.
      // Clear upgrade flags + stash the error BEFORE firing the event so the
      // #Completed snapshot persists the explanation.
      let ?canisterId = record.canisterId else {
        ignore creations.appendEvent(creationId, #Failed(errorMsg));
        return;
      };
      ignore creations.mutate(
        creationId,
        func(r) = { r with isUpgrade = false; upgradeIncludesFrontend = false; lastUpgradeError = ?errorMsg },
      );
      ignore creations.appendEvent(creationId, #Completed({ canisterId }));
    } else {
      ignore creations.appendEvent(creationId, #Failed(errorMsg));
    };
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
  ) {
    let nextWasmHash = switch (GitHubReleases.latestStorageWasm(store.githubReleases)) {
      case (#ok(details)) ?details.sha256;
      case (#err(_)) null;
    };
    let nextFrontendHash = switch (GitHubReleases.latestStorageFrontend(store.githubReleases)) {
      case (#ok(details)) ?details.sha256;
      case (#err(_)) null;
    };
    let releaseTagName = GitHubReleases.getLatestReleaseTagName(store.githubReleases);

    // One atomic mutate for hashes + upgrade flags + completedAt, preserving
    // the existing value if GitHub state isn't available yet.
    // `frontendHash` is skipped on WASM-only upgrades (keep the old hash).
    ignore creations.mutate(
      creationId,
      func(r) {
        let wasmHash = switch (nextWasmHash) { case (?h) ?h; case null r.wasmHash };
        let skipFrontend = r.isUpgrade and not r.upgradeIncludesFrontend;
        let frontendHash = if (skipFrontend) r.frontendHash else switch (nextFrontendHash) { case (?h) ?h; case null r.frontendHash };
        let installedReleaseTag = switch (releaseTagName) { case (?t) ?t; case null r.installedReleaseTag };
        {
          r with
          wasmHash;
          frontendHash;
          installedReleaseTag;
          isUpgrade = false;
          upgradeIncludesFrontend = false;
          lastUpgradeError = null;
          completedAt = ?Time.now();
        };
      },
    );
    ignore creations.appendEvent(creationId, #Completed({ canisterId }));
  };

  /// Get update info for a storage record
  func getUpdateInfo(store : Store, record : StorageCreationRecord) : ?UpdateInfo {
    // Updates are only available for completed storages
    switch (record.status) {
      case (#Completed(_)) {};
      case _ return null;
    };

    let availableWasmHash = switch (GitHubReleases.latestStorageWasm(store.githubReleases)) {
      case (#ok(details)) ?details.sha256;
      case (#err(_)) return null;
    };

    let availableFrontendHash = switch (GitHubReleases.latestStorageFrontend(store.githubReleases)) {
      case (#ok(details)) ?details.sha256;
      case (#err(_)) return null;
    };

    let wasmUpdateAvailable = switch (record.wasmHash, availableWasmHash) {
      case (?current, ?available) not Blob.equal(current, available);
      case (null, ?_) true; // No hash — first install didn't record it
      case _ false;
    };

    let frontendUpdateAvailable = switch (record.frontendHash, availableFrontendHash) {
      case (?current, ?available) not Blob.equal(current, available);
      case (null, ?_) true;
      case _ false;
    };

    if (not wasmUpdateAvailable and not frontendUpdateAvailable) return null;

    let availableReleaseTag = GitHubReleases.getLatestReleaseTagName(store.githubReleases);

    ?{
      currentWasmHash = record.wasmHash;
      availableWasmHash;
      currentReleaseTag = record.installedReleaseTag;
      availableReleaseTag;
      wasmUpdateAvailable;
      frontendUpdateAvailable;
    };
  };

  /// Public query — check for available updates by canisterId.
  /// Accessible from any frontend without authorization.
  public func checkStorageUpdate(store : Store, creations : Creations.Creations, canisterId : Principal) : ?UpdateInfo {
    switch (creations.findByCanister(canisterId)) {
      case (?record) getUpdateInfo(store, record);
      case null null;
    };
  };

  /// Start storage upgrade. Backend determines scope automatically from available updates.
  public func upgradeStorage<system>(
    store : Store,
    creations : Creations.Creations,
    caller : Principal,
    canisterId : Principal,
    callbacks : OrchestratorCallbacks,
  ) : Result.Result<(), UpgradeStorageError> {
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

    // 3. Check for available updates
    let ?updateInfo = getUpdateInfo(store, record) else {
      return #err(#NoUpdateAvailable);
    };

    // 4. Set upgrade flags
    let needsWasm = updateInfo.wasmUpdateAvailable;
    let needsFrontend = updateInfo.frontendUpdateAvailable;

    ignore creations.mutate(
      creationId,
      func(r) = { r with isUpgrade = true; upgradeIncludesFrontend = needsFrontend },
    );

    // 5. Queue tasks
    if (needsWasm) {
      // WASM upgrade — mode = #upgrade, use original initArg (required for post_upgrade)
      queueWasmTasks(store, creations, { creationId; canisterId; releaseTag = record.releaseTag; initArg = record.initArg; mode = #upgrade(?{ wasm_memory_persistence = ?#keep; skip_pre_upgrade = ?false }) });
      // If frontend also needed, it will be queued after WASM completes
      // (queuePostWasmTasks handles this after #WasmInstallCode/#WasmInstallChunked)
    } else if (needsFrontend) {
      // Frontend only
      queueFrontendTasks<system>(store, creations, creationId, canisterId);
    };

    // Start queue processing
    ensureUnifiedTimer<system>(store, creations, callbacks);

    #ok;
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
      updateAvailable = getUpdateInfo(store, record);
      lastUpgradeError = record.lastUpgradeError;
    };
  };

  /// List all storages for a user with their current status
  public func listStorages(store : Store, creations : Creations.Creations, caller : Principal) : [StorageInfo] {
    Array.map<StorageCreationRecord, StorageInfo>(
      creations.listByOwner(caller),
      func(r) = mapToStorageInfo(store, r),
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

  public func addLicense(licenses : Licenses.Licenses, owner : Principal, receipt : Types.PaymentReceipt) : Result.Result<(), { #DuplicatePayment }> {
    switch (licenses.add(owner, receipt)) {
      case (#ok) #ok;
      case (#err e) #err(e);
    };
  };

  public func findLicenseByPaymentId(licenses : Licenses.Licenses, owner : Principal, paymentId : Text) : ?Types.License {
    licenses.findByPaymentId(owner, paymentId);
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

  public type ExtractionStatus = GitHubReleases.ExtractionStatus;
  public type ReleasesFullStatus = GitHubReleases.ReleasesFullStatus;

  /// Get extraction status for a specific version key
  public func getExtractionStatus(store : Store, versionKey : Text) : ExtractionStatus {
    switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, versionKey)) {
      case (#Idle) #Idle;
      case (#Decoding(progress)) #Decoding({
        processed = progress.processed;
        total = progress.total;
      });
      case (#Complete) {
        let files = FrontendInstaller.getFiles(store.frontendInstaller, versionKey);
        let metadata = Array.map<Types.File, GitHubReleases.FileMetadata>(
          files,
          func(f) = {
            key = f.key;
            contentType = f.contentType;
            size = f.size;
            sha256 = f.sha256;
          },
        );
        #Complete(metadata);
      };
    };
  };

  /// Check if frontend extraction is complete for the default version
  public func isFrontendExtractionComplete(store : Store) : Bool {
    let versionKey = "storage-frontend@latest";
    switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, versionKey)) {
      case (#Complete) true;
      case _ false;
    };
  };

  /// Get the default frontend version key
  public func getDefaultFrontendVersionKey() : Text {
    "storage-frontend@latest";
  };

  /// Create an extraction info provider for status queries
  public func createExtractionInfoProvider(store : Store) : GitHubReleases.ExtractionInfoProvider {
    {
      getExtractionStatus = func(versionKey : Text) : GitHubReleases.ExtractionStatus {
        switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, versionKey)) {
          case (#Idle) #Idle;
          case (#Decoding(progress)) #Decoding({
            processed = progress.processed;
            total = progress.total;
          });
          case (#Complete) {
            let files = FrontendInstaller.getFiles(store.frontendInstaller, versionKey);
            let metadata = Array.map<Types.File, GitHubReleases.FileMetadata>(
              files,
              func(f) = {
                key = f.key;
                contentType = f.contentType;
                size = f.size;
                sha256 = f.sha256;
              },
            );
            #Complete(metadata);
          };
        };
      };
      getDefaultVersionKey = func() : Text {
        getDefaultFrontendVersionKey();
      };
      getLatestReleaseTagName = func() : ?Text {
        GitHubReleases.getLatestReleaseTagName(store.githubReleases);
      };
    };
  };

  /// Get comprehensive status of all releases including extraction progress
  public func getReleasesFullStatus(store : Store) : GitHubReleases.ReleasesFullStatus {
    let extractionProvider = createExtractionInfoProvider(store);
    GitHubReleases.getFullStatus(store.githubReleases, extractionProvider);
  };

  /// Manually trigger a refresh of releases (for debugging/recovery)
  public func refreshReleases<system>(store : Store) : async () {
    if (not store.running) return;

    // Reset retry count to allow fresh retries
    store.fetchRetryCount := 0;
    store.lastFetchError := null;

    // Cancel any pending retry
    cancelTimer(store.retryTimerId);
    store.retryTimerId := null;

    // Trigger fetch (no download callback — admin can call registerLatestWasmHash manually)
    await checkAndDownloadReleases<system>(store, null);
  };

  /// Get the hash of the latest downloaded storage WASM (if available)
  public func getLatestWasmHash(store : Store) : ?(Blob, Text) {
    switch (GitHubReleases.latestStorageWasm(store.githubReleases)) {
      case (#ok(details)) ?(details.sha256, details.key);
      case (#err(_)) null;
    };
  };

  /// Find the owner of a canister by its ID (reverse lookup via creation records)
  public func findOwnerByCanister(creations : Creations.Creations, canisterId : Principal) : ?Principal {
    creations.findOwnerByCanister(canisterId);
  };
};
