import Array "mo:core/Array";
import Map "mo:core/Map";
import Queue "mo:core/Queue";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Timer "mo:core/Timer";
import Time "mo:core/Time";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";

import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import IC "mo:ic";
import Vector "mo:vector";

import GitHubReleases "../GitHubReleases";
import HttpDownloader "../HttpDownloader";
import StorageDeployer "StorageDeployer";
import WasmInstaller "WasmInstaller";
import FrontendInstaller "FrontendInstaller";
import Types "Types";
import LedgerTypes "LedgerTypes";
import CMCTypes "CMCTypes";

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

  /// Delay between unified queue operations (ms)
  let UNIFIED_QUEUE_DELAY_MS : Nat = 100;

  /// Maximum retry attempts for GitHub API calls
  let MAX_GITHUB_RETRY_ATTEMPTS : Nat = 3;

  /// Initial delay for retry backoff (seconds)
  let INITIAL_RETRY_DELAY_SECONDS : Nat = 5;

  // -- Internal Types --

  type StorageCreationRecordMutable = {
    /// Unique ID for this creation process
    id : Nat;
    owner : Principal;
    releaseTag : Text;
    initArg : Blob;
    createdAt : Time.Time;
    var canisterId : ?Principal;
    var wasmHash : ?Blob;
    var frontendHash : ?Blob;
    var status : CreationStatus;
    var completedAt : ?Time.Time;
  };

  // -- Store --

  /// Orchestrator store containing all subsystems and state
  public type Store = {
    var canisterId : ?Principal;
    region : MemoryRegion.MemoryRegion;

    // Subsystems
    githubReleases : GitHubReleases.Store;
    storageDeployer : StorageDeployer.Store;
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

    // Creation history: creationId → record
    creations : Map.Map<Nat, StorageCreationRecordMutable>;

    // Index: owner → list of creationIds
    creationsByOwner : Map.Map<Principal, Vector.Vector<Nat>>;
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
    }
  ) : Store {
    let region = MemoryRegion.new();
    {
      var canisterId = null;
      region;
      githubReleases = GitHubReleases.new({
        github = config.github;
        assets = config.assets;
        region = ?region;
      });
      storageDeployer = StorageDeployer.new(region);
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
      creations = Map.empty();
      creationsByOwner = Map.empty();
    };
  };

  // -- Timer Management --

  func cancelTimer(timerId : ?Timer.TimerId) {
    switch (timerId) {
      case (?id) Timer.cancelTimer(id);
      case null {};
    };
  };

  /// Start the orchestrator and all subsystems
  ///
  /// This starts GitHub release checking, download processing,
  /// and task queue processing
  public func start<system>(store : Store) : async () {
    if (store.running) return;
    store.running := true;

    // Set canister ID for subsystems
    store.storageDeployer.canisterId := store.canisterId;

    // 1. Start release check
    await checkAndDownloadReleases<system>(store);
    store.githubTimerId := ?Timer.recurringTimer<system>(
      #days 1,
      func() : async () {
        // Reset retry count for daily check to allow fresh retry attempts
        store.fetchRetryCount := 0;
        await checkAndDownloadReleases<system>(store);
      },
    );

    // 2. Downloader timer (activates when queue has items)
    ensureDownloaderTimer<system>(store);

    // 3. Unified timer (activates when queue has items)
    ensureUnifiedTimer<system>(store);
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
  func ensureDownloaderTimer<system>(store : Store) {
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
            await HttpDownloader.runRequests(store.githubReleases.downloaderStore);
            ensureDownloaderTimer<system>(store);
          },
        );
      };
    } else if (Option.isNull(store.downloaderTimerId)) {
      store.downloaderTimerId := ?Timer.recurringTimer<system>(
        #milliseconds 100,
        func() : async () {
          await HttpDownloader.runRequests(store.githubReleases.downloaderStore);
          ensureDownloaderTimer<system>(store);
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

  // Ensure unified timer is running if there are pending tasks
  func ensureUnifiedTimer<system>(store : Store) {
    if (Queue.isEmpty(store.unifiedQueue)) {
      cancelTimer(store.unifiedTimerId);
      store.unifiedTimerId := null;
    } else if (Option.isNull(store.unifiedTimerId)) {
      store.unifiedTimerId := ?Timer.setTimer<system>(
        #milliseconds 0,
        func() : async () { await processUnifiedQueue<system>(store) },
      );
    };
  };

  // Check and download releases from GitHub with retry logic
  func checkAndDownloadReleases<system>(store : Store) : async () {
    // Cancel any pending retry timer
    cancelTimer(store.retryTimerId);
    store.retryTimerId := null;

    switch (await GitHubReleases.listReleases(store.githubReleases)) {
      case (#ok(_releases)) {
        // Success - reset retry state and record success
        store.fetchRetryCount := 0;
        store.lastFetchError := null;
        store.lastFetchTime := ?Time.now();

        // Ensure downloader timer is running for any queued downloads
        ensureDownloaderTimer<system>(store);

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
                await checkAndDownloadReleases<system>(store);
              };
            },
          );
        };
        // After MAX_GITHUB_RETRY_ATTEMPTS, wait for daily timer
      };
    };
  };

  // -- Storage Creation --

  /// Find active creation for a user (status is not Completed or Failed)
  func findActiveCreation(store : Store, owner : Principal) : ?StorageCreationRecordMutable {
    switch (Map.get(store.creationsByOwner, Principal.compare, owner)) {
      case (?creationIds) {
        for (creationId in Vector.vals(creationIds)) {
          switch (Map.get(store.creations, Nat.compare, creationId)) {
            case (?record) {
              switch (record.status) {
                case (#Completed _) {};
                case (#Failed _) {};
                case _ return ?record;
              };
            };
            case null {};
          };
        };
        null;
      };
      case null null;
    };
  };

  /// Get creation record by ID
  func getCreationById(store : Store, creationId : Nat) : ?StorageCreationRecordMutable {
    Map.get(store.creations, Nat.compare, creationId);
  };

  /// Check if a canister ID is already used in any storage
  func isCanisterIdUsed(store : Store, canisterId : Principal) : Bool {
    for ((_, record) in Map.entries(store.creations)) {
      switch (record.canisterId) {
        case (?existingId) {
          if (Principal.equal(existingId, canisterId)) {
            return true;
          };
        };
        case null {};
      };
    };
    false;
  };

  /// Start creating a new storage canister for the caller
  public func createStorage<system>(
    store : Store,
    caller : Principal,
    options : CreateStorageOptions,
  ) : Result.Result<(), CreateStorageError> {
    // 1. Check that release is downloaded
    let releaseTag = switch (findReleaseTag(store, options.releaseSelector)) {
      case (?tag) tag;
      case null return #err(#ReleaseNotFound);
    };

    // 2. Check for active creation
    switch (findActiveCreation(store, caller)) {
      case (?_) return #err(#AlreadyInProgress);
      case null {};
    };

    // 3. Check if canister ID is already used (for Existing target)
    switch (options.target) {
      case (#Existing(canisterId)) {
        if (isCanisterIdUsed(store, canisterId)) {
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

    let record : StorageCreationRecordMutable = {
      id = creationId;
      owner = caller;
      var canisterId = existingCanisterId;
      releaseTag;
      initArg = options.initArg;
      var wasmHash = null;
      var frontendHash = null;
      var status = #Pending;
      createdAt = Time.now();
      var completedAt = null;
    };

    // Store record
    Map.add(store.creations, Nat.compare, creationId, record);

    // Add to owner index
    switch (Map.get(store.creationsByOwner, Principal.compare, caller)) {
      case (?ids) Vector.add(ids, creationId);
      case null {
        let ids = Vector.new<Nat>();
        Vector.add(ids, creationId);
        Map.add(store.creationsByOwner, Principal.compare, caller, ids);
      };
    };

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
    ensureUnifiedTimer<system>(store);

    #ok();
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

  func _getWasmHash(store : Store, _releaseTag : Text) : ?Blob {
    switch (GitHubReleases.latestStorageWasm(store.githubReleases)) {
      case (#ok(details)) ?details.sha256;
      case (#err(_)) null;
    };
  };

  func updateCanisterSettings(
    storageCanisterId : Principal,
    userPrincipal : Principal,
  ) : async Result.Result<(), Text> {
    try {
      await IC.ic.update_settings({
        canister_id = storageCanisterId;
        sender_canister_version = null;
        settings = {
          controllers = ?[userPrincipal];
          freezing_threshold = null;
          wasm_memory_threshold = null;
          reserved_cycles_limit = null;
          log_visibility = null;
          wasm_memory_limit = null;
          memory_allocation = null;
          compute_allocation = null;
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
  func processUnifiedQueue<system>(store : Store) : async () {
    switch (Queue.popFront(store.unifiedQueue)) {
      case (?task) {
        try {
          switch (task.taskType) {
            case (#Orchestrator(orchTask)) {
              await processOrchestratorTask<system>(store, task.creationId, orchTask);
            };
            case (#WasmUploadChunk(args)) {
              switch (await WasmInstaller.executeUploadChunk(store.wasmInstaller, args.canisterId, args.chunkIndex, args.chunk, args.totalChunks)) {
                case (#ok(_)) {};
                case (#err(e)) {
                  handleTaskFailure(store, task.creationId, "WASM chunk upload failed: " # e);
                };
              };
            };
            case (#WasmInstallCode(args)) {
              switch (await WasmInstaller.executeInstallCode(store.wasmInstaller, args.canisterId, args.wasmModule, args.initArg, args.mode)) {
                case (#ok()) {
                  // WASM installed - queue frontend tasks
                  queueFrontendTasks<system>(store, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, task.creationId, "WASM install failed: " # e);
                };
              };
            };
            case (#WasmInstallChunked(args)) {
              switch (await WasmInstaller.executeInstallChunked(store.wasmInstaller, args.canisterId, args.wasmHash, args.initArg)) {
                case (#ok()) {
                  // WASM installed - queue frontend tasks
                  queueFrontendTasks<system>(store, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, task.creationId, "WASM chunked install failed: " # e);
                };
              };
            };
            case (#FrontendCreateBatch(args)) {
              switch (await FrontendInstaller.executeCreateBatch(store.frontendInstaller, args.canisterId)) {
                case (#ok(_)) {};
                case (#err(e)) {
                  handleTaskFailure(store, task.creationId, "Frontend create batch failed: " # e);
                };
              };
            };
            case (#FrontendUploadChunks(args)) {
              switch (await FrontendInstaller.executeUploadChunks(store.frontendInstaller, args.canisterId, args.files)) {
                case (#ok()) {
                  // Update status
                  switch (getCreationById(store, task.creationId)) {
                    case (?record) {
                      switch (FrontendInstaller.getInstallationStatus(store.frontendInstaller, args.canisterId)) {
                        case (?#Uploading(progress)) {
                          record.status := #UploadingFrontend({
                            canisterId = args.canisterId;
                            progress = {
                              processed = progress.processed;
                              total = progress.total;
                            };
                          });
                        };
                        case _ {};
                      };
                    };
                    case null {};
                  };
                };
                case (#err(e)) {
                  handleTaskFailure(store, task.creationId, "Frontend upload chunks failed: " # e);
                };
              };
            };
            case (#FrontendCommitBatch(args)) {
              switch (await FrontendInstaller.executeCommitBatch(store.frontendInstaller, args.canisterId)) {
                case (#ok()) {
                  // Frontend complete - queue controller update
                  queueUpdateControllers(store, task.creationId, args.canisterId);
                };
                case (#err(e)) {
                  handleTaskFailure(store, task.creationId, "Frontend commit failed: " # e);
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
            handleTaskFailure(store, task.creationId, "Task failed after 3 attempts: " # errMsg);
          };
        };

        // Schedule next iteration with delay
        store.unifiedTimerId := ?Timer.setTimer<system>(
          #milliseconds UNIFIED_QUEUE_DELAY_MS,
          func() : async () { await processUnifiedQueue<system>(store) },
        );
      };
      case null {
        // Queue is empty - cancel timer
        cancelTimer(store.unifiedTimerId);
        store.unifiedTimerId := null;
      };
    };
  };

  /// Process high-level orchestrator tasks
  func processOrchestratorTask<system>(store : Store, creationId : Nat, task : OrchestratorTask) : async () {
    let ?record = getCreationById(store, creationId) else return;

    switch (task.taskType) {
      case (#CreateCanister({ options })) {
        record.status := #CheckingAllowance;

        switch (await StorageDeployer.createStorage(store.storageDeployer, task.owner, options)) {
          case (#ok(canisterId)) {
            record.canisterId := ?canisterId;
            record.status := #CanisterCreated({ canisterId });

            // Queue WASM installation tasks
            queueWasmTasks(store, creationId, canisterId, record.releaseTag, record.initArg);
          };
          case (#err(e)) {
            let errorMsg = switch (e) {
              case (#InsufficientAllowance(_)) "Insufficient allowance";
              case (#TransferFailed(_)) "Transfer failed";
              case (#NotifyFailed(_)) "CMC notification failed";
              case (#UpdateSettingsFailed(msg)) "Settings update failed: " # msg;
              case (#AlreadyInProgress) "Already in progress";
              case (#NotFound) "Not found";
            };
            record.status := #Failed("Canister creation failed: " # errorMsg);
          };
        };
      };

      case (#LinkCanister({ canisterId })) {
        record.canisterId := ?canisterId;
        record.status := #CanisterCreated({ canisterId });

        // Queue WASM installation tasks
        queueWasmTasks(store, creationId, canisterId, record.releaseTag, record.initArg);
      };

      case (#InstallWasm({ canisterId; releaseTag; initArg })) {
        // This case handles legacy flow - shouldn't be reached in new architecture
        queueWasmTasks(store, creationId, canisterId, releaseTag, initArg);
      };

      case (#InstallFrontend({ canisterId; releaseTag = _ })) {
        // This case handles legacy flow - shouldn't be reached in new architecture
        queueFrontendTasks<system>(store, creationId, canisterId);
      };

      case (#UpdateControllers({ canisterId })) {
        record.status := #UpdatingControllers({ canisterId });

        switch (await updateCanisterSettings(canisterId, task.owner)) {
          case (#ok()) {
            record.status := #Completed({ canisterId });
            record.completedAt := ?Time.now();
          };
          case (#err(e)) {
            record.status := #Failed("Controller update failed: " # e);
          };
        };
      };

      case (#Complete({ canisterId })) {
        record.status := #Completed({ canisterId });
        record.completedAt := ?Time.now();
      };
    };
  };

  /// Queue WASM installation tasks
  func queueWasmTasks(store : Store, creationId : Nat, canisterId : Principal, releaseTag : Text, initArg : Blob) {
    let ?record = getCreationById(store, creationId) else return;

    record.status := #InstallingWasm({
      canisterId;
      progress = { processed = 0; total = 100 };
    });

    switch (getWasmBlob(store, releaseTag)) {
      case (#ok(wasmBlob)) {
        let wasmHash = Sha256.fromBlob(#sha256, wasmBlob);
        record.wasmHash := ?wasmHash;

        // Generate tasks from WasmInstaller
        let wasmTasks = WasmInstaller.generateTasks(
          store.wasmInstaller,
          {
            targetCanister = canisterId;
            wasmModule = wasmBlob;
            wasmHash;
            mode = #install;
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
      };
      case (#err(e)) {
        record.status := #Failed("Failed to get WASM: " # e);
      };
    };
  };

  /// Queue frontend installation tasks
  func queueFrontendTasks<system>(store : Store, creationId : Nat, canisterId : Principal) {
    let ?record = getCreationById(store, creationId) else return;

    record.status := #UploadingFrontend({
      canisterId;
      progress = { processed = 0; total = 100 };
    });

    let versionKey = "storage-frontend@latest";

    switch (FrontendInstaller.generateTasks(store.frontendInstaller, versionKey, canisterId, record.owner, store.nextTaskId)) {
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
      };
      case (#err(e)) {
        record.status := #Failed("Failed to generate frontend tasks: " # e);
      };
    };
  };

  /// Queue controller update task
  func queueUpdateControllers(store : Store, creationId : Nat, canisterId : Principal) {
    let ?record = getCreationById(store, creationId) else return;

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

  /// Handle task failure
  func handleTaskFailure(store : Store, creationId : Nat, errorMsg : Text) {
    switch (getCreationById(store, creationId)) {
      case (?record) {
        record.status := #Failed(errorMsg);
      };
      case null {};
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  func mapStorageCreationRecord(record : StorageCreationRecordMutable) : StorageCreationRecord {
    {
      id = record.id;
      owner = record.owner;
      releaseTag = record.releaseTag;
      initArg = record.initArg;
      createdAt = record.createdAt;
      canisterId = record.canisterId;
      wasmHash = record.wasmHash;
      frontendHash = record.frontendHash;
      status = record.status;
      completedAt = record.completedAt;
    };
  };

  func mapToStorageInfo(record : StorageCreationRecordMutable) : StorageInfo {
    {
      id = record.id;
      canisterId = record.canisterId;
      status = record.status;
      releaseTag = record.releaseTag;
      createdAt = record.createdAt;
      completedAt = record.completedAt;
    };
  };

  /// List all storages for a user with their current status
  public func listStorages(store : Store, caller : Principal) : [StorageInfo] {
    switch (Map.get(store.creationsByOwner, Principal.compare, caller)) {
      case (?creationIds) {
        Vector.vals(creationIds)
        |> Iter.filterMap<Nat, StorageInfo>(
          _,
          func(creationId) {
            switch (Map.get(store.creations, Nat.compare, creationId)) {
              case (?record) ?mapToStorageInfo(record);
              case null null;
            };
          },
        )
        |> Iter.toArray(_);
      };
      case null [];
    };
  };

  /// Delete a failed storage record
  /// Only records with Failed status can be deleted
  public func deleteStorage(store : Store, caller : Principal, storageId : Nat) : Result.Result<(), DeleteStorageError> {
    // 1. Find the record
    let ?record = Map.get(store.creations, Nat.compare, storageId) else {
      return #err(#NotFound);
    };

    // 2. Check ownership
    if (not Principal.equal(record.owner, caller)) {
      return #err(#NotOwner);
    };

    // 3. Check if status is Failed
    switch (record.status) {
      case (#Failed(_)) {};
      case _ return #err(#NotFailed);
    };

    // 4. Remove from creations map
    ignore Map.delete(store.creations, Nat.compare, storageId);

    // 5. Remove from owner index
    switch (Map.get(store.creationsByOwner, Principal.compare, caller)) {
      case (?creationIds) {
        // Find and remove the storageId from the vector
        let newIds = Vector.new<Nat>();
        for (id in Vector.vals(creationIds)) {
          if (id != storageId) {
            Vector.add(newIds, id);
          };
        };
        // Replace with filtered vector
        ignore Map.delete(store.creationsByOwner, Principal.compare, caller);
        Map.add(store.creationsByOwner, Principal.compare, caller, newIds);
      };
      case null {};
    };

    #ok();
  };

  /// Get current active creation status for a user (in-progress creation)
  public func getCreationStatus(store : Store, caller : Principal) : ?CreationStatus {
    switch (findActiveCreation(store, caller)) {
      case (?record) ?record.status;
      case null null;
    };
  };

  /// Get creation status by ID
  public func getCreationStatusById(store : Store, creationId : Nat) : ?CreationStatus {
    switch (getCreationById(store, creationId)) {
      case (?record) ?record.status;
      case null null;
    };
  };

  /// Get all creation records (admin)
  public func getAllCreations(store : Store) : [(Nat, StorageCreationRecord)] {
    Map.entries(store.creations) |> Iter.map(_, func(k, v) = (k, mapStorageCreationRecord(v))) |> Iter.toArray(_);
  };

  // -- Extraction Status --

  public type ExtractionStatus = GitHubReleases.ExtractionStatus;

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

    // Trigger fetch
    await checkAndDownloadReleases<system>(store);
  };
};
