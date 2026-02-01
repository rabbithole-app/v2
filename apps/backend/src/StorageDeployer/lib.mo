import Array "mo:core/Array";
import Map "mo:core/Map";
import Queue "mo:core/Queue";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";
import Time "mo:core/Time";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Error "mo:core/Error";
import Iter "mo:core/Iter";

import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import IC "mo:ic";

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

  // -- Internal Types --

  type StorageCreationRecordMutable = {
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

    // Main task queue
    taskQueue : Queue.Queue<OrchestratorTask>;

    // Centralized timers
    var githubTimerId : ?Timer.TimerId;
    var downloaderTimerId : ?Timer.TimerId;
    var orchestratorTimerId : ?Timer.TimerId;
    var running : Bool;

    // Creation history
    creations : Map.Map<Principal, StorageCreationRecordMutable>;
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
      owner : Text;
      repo : Text;
      githubToken : ?Text;
      assets : [(GitHubReleases.ReleaseSelector, [GitHubReleases.GithubAsset])];
    }
  ) : Store {
    let region = MemoryRegion.new();
    {
      var canisterId = null;
      region;
      githubReleases = GitHubReleases.new({
        owner = config.owner;
        repo = config.repo;
        githubToken = config.githubToken;
        assets = config.assets;
        region = ?region;
      });
      storageDeployer = StorageDeployer.new(region);
      wasmInstaller = WasmInstaller.new();
      frontendInstaller = FrontendInstaller.new(region);
      taskQueue = Queue.empty();
      var githubTimerId = null;
      var downloaderTimerId = null;
      var orchestratorTimerId = null;
      var running = false;
      creations = Map.empty();
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
      func() : async () { await checkAndDownloadReleases<system>(store) },
    );

    // 2. Downloader timer (activates when queue has items)
    ensureDownloaderTimer<system>(store);

    // 3. Orchestrator timer (activates when queue has items)
    ensureOrchestratorTimer<system>(store);
  };

  /// Stop all orchestrator timers and subsystems
  public func stop<system>(store : Store) : () {
    store.running := false;

    // Cancel ALL timers centrally
    cancelTimer(store.githubTimerId);
    store.githubTimerId := null;

    cancelTimer(store.downloaderTimerId);
    store.downloaderTimerId := null;

    cancelTimer(store.orchestratorTimerId);
    store.orchestratorTimerId := null;

    // Cancel subsystem timers
    WasmInstaller.cancel<system>(store.wasmInstaller);
    FrontendInstaller.cancel<system>(store.frontendInstaller);
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
              },
            );
          };
          case _ {};
        };
      };
      case (#err(_)) {};
    };
  };

  // Ensure orchestrator timer is running if there are pending tasks
  func ensureOrchestratorTimer<system>(store : Store) {
    if (Queue.isEmpty(store.taskQueue)) {
      cancelTimer(store.orchestratorTimerId);
      store.orchestratorTimerId := null;
    } else if (Option.isNull(store.orchestratorTimerId)) {
      store.orchestratorTimerId := ?Timer.setTimer<system>(
        #milliseconds 0,
        func() : async () { await processOrchestratorQueue<system>(store) },
      );
    };
  };

  // Check and download releases from GitHub
  func checkAndDownloadReleases<system>(store : Store) : async () {
    switch (await GitHubReleases.listReleases(store.githubReleases)) {
      case (#ok(_releases)) {
        // Try to start extraction if assets are already downloaded
        // (in case of cache hit or very fast download)
        tryStartFrontendExtraction<system>(store);
      };
      case (#err(_)) {};
    };
  };

  // -- Storage Creation --

  /// Start creating a new storage canister for the caller
  ///
  /// This adds tasks to the orchestrator queue and returns immediately.
  /// Use `getCreationStatus` to track progress.
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
    switch (Map.get(store.creations, Principal.compare, caller)) {
      case (?existing) {
        switch (existing.status) {
          case (#Completed _) {}; // OK - can create another
          case (#Failed _) {}; // OK - can retry
          case _ return #err(#AlreadyInProgress);
        };
      };
      case null {};
    };

    // 3. Create history record
    let existingCanisterId = switch (options.target) {
      case (#Existing(id)) ?id;
      case (#Create(_)) null;
    };

    let record : StorageCreationRecordMutable = {
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
    ignore Map.insert(store.creations, Principal.compare, caller, record);

    // 4. Add tasks to queue
    switch (options.target) {
      case (#Existing(existingId)) {
        // Link existing canister
        Queue.pushBack(store.taskQueue, { owner = caller; taskType = #LinkCanister({ canisterId = existingId }) });
      };
      case (#Create(_)) {
        // Create new canister
        Queue.pushBack(store.taskQueue, { owner = caller; taskType = #CreateCanister({ options }) });
      };
    };

    // 5. Start queue processing
    ensureOrchestratorTimer<system>(store);

    #ok(());
  };

  func findReleaseTag(store : Store, selector : ReleaseSelector) : ?Text {
    // TODO: Implement proper release lookup from GitHubReleases
    // For now, return "latest" for any selector
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

  func getWasmHash(store : Store, _releaseTag : Text) : ?Blob {
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
          controllers = ?[userPrincipal]; // Only user as controller now
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

  // -- Queue Processor --

  func processOrchestratorQueue<system>(store : Store) : async () {
    switch (Queue.popFront(store.taskQueue)) {
      case (?task) {
        let ?record = Map.get(store.creations, Principal.compare, task.owner) else return;

        switch (task.taskType) {
          case (#CreateCanister({ options })) {
            record.status := #CheckingAllowance;

            // Delegate to StorageDeployer
            switch (
              await StorageDeployer.createStorage(
                store.storageDeployer,
                task.owner,
                options,
              )
            ) {
              case (#ok(canisterId)) {
                record.canisterId := ?canisterId;
                record.status := #CanisterCreated({ canisterId });

                // Add next step
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #InstallWasm({
                      canisterId;
                      releaseTag = record.releaseTag;
                      initArg = record.initArg;
                    });
                  },
                );
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

            // Add next step
            Queue.pushBack(
              store.taskQueue,
              {
                owner = task.owner;
                taskType = #InstallWasm({
                  canisterId;
                  releaseTag = record.releaseTag;
                  initArg = record.initArg;
                });
              },
            );
          };

          case (#InstallWasm({ canisterId; releaseTag; initArg })) {
            record.status := #InstallingWasm({
              canisterId;
              progress = { processed = 0; total = 100 };
            });

            switch (getWasmBlob(store, releaseTag)) {
              case (#ok(wasmBlob)) {
                let wasmHash = Sha256.fromBlob(#sha256, wasmBlob);

                // Add to WasmInstaller queue
                WasmInstaller.install<system>(
                  store.wasmInstaller,
                  {
                    targetCanister = canisterId;
                    wasmModule = wasmBlob;
                    wasmHash;
                    mode = #install;
                    initArg;
                  },
                );

                // Add wait task
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #WaitForWasm({ canisterId; releaseTag });
                  },
                );
              };
              case (#err(e)) {
                record.status := #Failed("Failed to get WASM: " # e);
              };
            };
          };

          case (#WaitForWasm({ canisterId; releaseTag })) {
            switch (WasmInstaller.getStatus(store.wasmInstaller, canisterId)) {
              case (?#Completed) {
                record.wasmHash := getWasmHash(store, releaseTag);
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #InstallFrontend({ canisterId; releaseTag });
                  },
                );
              };
              case (?#Failed(e)) {
                record.status := #Failed("WASM installation failed: " # e);
              };
              case (?#UploadingChunks(progress)) {
                record.status := #InstallingWasm({
                  canisterId;
                  progress = {
                    processed = progress.uploaded;
                    total = progress.total;
                  };
                });
                // Re-add wait task
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #WaitForWasm({ canisterId; releaseTag });
                  },
                );
              };
              case _ {
                // Not ready yet - re-add wait task
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #WaitForWasm({ canisterId; releaseTag });
                  },
                );
              };
            };
          };

          case (#InstallFrontend({ canisterId; releaseTag })) {
            record.status := #UploadingFrontend({
              canisterId;
              progress = { processed = 0; total = 100 };
            });

            let versionKey = "storage-frontend@" # releaseTag;
            await FrontendInstaller.install<system>(store.frontendInstaller, versionKey, canisterId);

            // Add wait task
            Queue.pushBack(
              store.taskQueue,
              {
                owner = task.owner;
                taskType = #WaitForFrontend({ canisterId });
              },
            );
          };

          case (#WaitForFrontend({ canisterId })) {
            let installStatus = FrontendInstaller.getInstallationStatus(store.frontendInstaller, canisterId);
            switch (installStatus) {
              case (?#Completed) {
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #UpdateControllers({ canisterId });
                  },
                );
              };
              case (?#Failed(e)) {
                record.status := #Failed("Frontend installation failed: " # e);
              };
              case (?#Committing) {
                // Committing is in progress - just wait with delay
                store.orchestratorTimerId := ?Timer.setTimer<system>(
                  #milliseconds 500,
                  func() : async () {
                    Queue.pushBack(
                      store.taskQueue,
                      {
                        owner = task.owner;
                        taskType = #WaitForFrontend({ canisterId });
                      },
                    );
                    await processOrchestratorQueue<system>(store);
                  },
                );
                return; // Don't schedule default iteration
              };
              case (?#Uploading(progress)) {
                record.status := #UploadingFrontend({
                  canisterId;
                  progress = {
                    processed = progress.processed;
                    total = progress.total;
                  };
                });
                // Use longer delay (500ms) before re-checking to avoid competing with FrontendInstaller
                // This prevents output queue overflow from parallel message processing
                store.orchestratorTimerId := ?Timer.setTimer<system>(
                  #milliseconds 500,
                  func() : async () {
                    Queue.pushBack(
                      store.taskQueue,
                      {
                        owner = task.owner;
                        taskType = #WaitForFrontend({ canisterId });
                      },
                    );
                    await processOrchestratorQueue<system>(store);
                  },
                );
                return; // Don't schedule default iteration
              };
              case _ {
                // Use longer delay for unknown states too
                store.orchestratorTimerId := ?Timer.setTimer<system>(
                  #milliseconds 500,
                  func() : async () {
                    Queue.pushBack(
                      store.taskQueue,
                      {
                        owner = task.owner;
                        taskType = #WaitForFrontend({ canisterId });
                      },
                    );
                    await processOrchestratorQueue<system>(store);
                  },
                );
                return; // Don't schedule default iteration
              };
            };
          };

          case (#UpdateControllers({ canisterId })) {
            record.status := #UpdatingControllers({ canisterId });

            switch (await updateCanisterSettings(canisterId, task.owner)) {
              case (#ok()) {
                Queue.pushBack(
                  store.taskQueue,
                  {
                    owner = task.owner;
                    taskType = #Complete({ canisterId });
                  },
                );
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

        // Schedule next iteration
        store.orchestratorTimerId := ?Timer.setTimer<system>(
          #milliseconds 100,
          func() : async () { await processOrchestratorQueue<system>(store) },
        );
      };
      case null {
        // Queue is empty - cancel timer
        cancelTimer(store.orchestratorTimerId);
        store.orchestratorTimerId := null;
      };
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  func mapStorageCreationRecord(record : StorageCreationRecordMutable) : StorageCreationRecord {
    {
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

  /// List all storage creations for a user
  public func listStorages(store : Store, caller : Principal) : [StorageCreationRecord] {
    Map.entries(store.creations)
    |> Iter.filterMap<(Principal, StorageCreationRecordMutable), StorageCreationRecord>(
      _,
      func(owner, rec) = if (Principal.equal(owner, caller)) ?mapStorageCreationRecord(rec) else null,
    )
    |> Iter.toArray(_);
  };

  /// Get current creation status for a user
  public func getCreationStatus(store : Store, caller : Principal) : ?CreationStatus {
    switch (Map.get(store.creations, Principal.compare, caller)) {
      case (?record) ?record.status;
      case null null;
    };
  };

  // Get all creation records (admin)
  /// Get all creation records (admin)
  public func getAllCreations(store : Store) : [(Principal, StorageCreationRecord)] {
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
            // Convert Files to FileMetadata (without content)
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
};
