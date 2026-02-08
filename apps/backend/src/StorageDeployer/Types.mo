import Time "mo:core/Time";
import Principal "mo:core/Principal";

import IC "mo:ic";

import LedgerTypes "LedgerTypes";
import CMCTypes "CMCTypes";
import GitHubReleasesTypes "GitHubReleasesTypes";

module {
  // -- Basic Types --

  /// Pointer to a memory region: (address, size)
  public type SizedPointer = (Nat, Nat);

  /// Progress indicator for long-running operations
  public type Progress = {
    processed : Nat;
    total : Nat;
  };

  /// File with content for storage
  public type File = {
    key : Text;
    content : Blob;
    contentType : Text;
    size : Nat;
    sha256 : Blob;
  };

  /// File metadata without content (for status reporting)
  public type FileMetadata = {
    key : Text;
    contentType : Text;
    size : Nat;
    sha256 : Blob;
  };

  // -- Re-exported Types --

  /// Release selector from GitHubReleases
  public type ReleaseSelector = GitHubReleasesTypes.ReleaseSelector;

  // -- Creation Options & Errors --

  /// Target canister specification for storage deployment
  public type TargetCanister = {
    /// Create a new canister with specified cycles
    #Create : {
      initialCycles : Nat;
      subnetId : ?Principal;
    };
    /// Use an existing canister
    #Existing : Principal;
  };

  /// Options for creating a new storage canister
  ///
  /// Example (create new):
  /// ```motoko
  /// let options : CreateStorageOptions = {
  ///   target = #Create({
  ///     initialCycles = 1_000_000_000_000;
  ///     subnetId = null;
  ///   });
  ///   releaseSelector = #Latest;
  ///   initArg = to_candid({});
  /// };
  /// ```
  ///
  /// Example (use existing):
  /// ```motoko
  /// let options : CreateStorageOptions = {
  ///   target = #Existing(existingCanisterId);
  ///   releaseSelector = #Latest;
  ///   initArg = to_candid({});
  /// };
  /// ```
  public type CreateStorageOptions = {
    target : TargetCanister;
    releaseSelector : ReleaseSelector;
    initArg : Blob;
  };

  /// Errors that can occur during storage creation
  public type CreateStorageError = {
    #ReleaseNotFound;
    #AlreadyInProgress;
    #CanisterAlreadyUsed : { canisterId : Principal };
    #InsufficientAllowance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.TransferFromError;
    #NotifyFailed : CMCTypes.NotifyError;
    #WasmInstallFailed : Text;
    #FrontendInstallFailed : Text;
    #UpdateControllersFailed : Text;
  };

  /// Errors that can occur when deleting a storage record
  public type DeleteStorageError = {
    #NotFound;
    #NotOwner;
    #NotFailed; // Can only delete Failed records
  };

  // -- Update Types --

  /// Information about available updates for a storage canister
  public type UpdateInfo = {
    currentWasmHash : ?Blob;
    availableWasmHash : ?Blob;
    currentReleaseTag : ?Text;
    availableReleaseTag : ?Text;
    wasmUpdateAvailable : Bool;
    frontendUpdateAvailable : Bool;
  };

  /// Errors that can occur during storage upgrade
  public type UpgradeStorageError = {
    #NotFound;
    #NotOwner;
    #NotCompleted;
    #NoUpdateAvailable;
    #ReleaseNotReady;
    #AlreadyUpgrading;
  };

  // -- Creation Status --

  /// Current status of a storage creation process
  public type CreationStatus = {
    #Pending;
    #CheckingAllowance;
    #TransferringICP : { amount : Nat };
    #NotifyingCMC : { blockIndex : Nat };
    #CanisterCreated : { canisterId : Principal };
    #InstallingWasm : { canisterId : Principal; progress : Progress };
    #UploadingFrontend : { canisterId : Principal; progress : Progress };
    #RevokingInstallerPermission : { canisterId : Principal };
    #UpdatingControllers : { canisterId : Principal };
    #UpgradingWasm : { canisterId : Principal; progress : Progress };
    #UpgradingFrontend : { canisterId : Principal; progress : Progress };
    #Completed : { canisterId : Principal };
    #Failed : Text;
  };

  // -- Storage Creation Record --

  /// Record of a storage creation (for history/tracking)
  public type StorageCreationRecord = {
    /// Unique ID of this creation process
    id : Nat;
    owner : Principal;
    releaseTag : Text;
    initArg : Blob;
    createdAt : Time.Time;
    canisterId : ?Principal;
    wasmHash : ?Blob;
    frontendHash : ?Blob;
    installedReleaseTag : ?Text;
    status : CreationStatus;
    completedAt : ?Time.Time;
  };

  /// Storage info returned by listStorages (combines record with status)
  public type StorageInfo = {
    id : Nat;
    canisterId : ?Principal;
    status : CreationStatus;
    releaseTag : Text;
    createdAt : Time.Time;
    completedAt : ?Time.Time;
    updateAvailable : ?UpdateInfo;
  };

  // -- Task Types --

  /// Task in the orchestrator queue
  public type OrchestratorTask = {
    owner : Principal;
    taskType : TaskType;
  };

  /// Type of orchestrator task (high-level workflow steps)
  public type TaskType = {
    #CreateCanister : { options : CreateStorageOptions };
    #LinkCanister : { canisterId : Principal };
    #InstallWasm : { canisterId : Principal; releaseTag : Text; initArg : Blob };
    #InstallFrontend : { canisterId : Principal; releaseTag : Text };
    #UpdateControllers : { canisterId : Principal };
    #Complete : { canisterId : Principal };
  };

  // ═══════════════════════════════════════════════════════════════
  // UNIFIED TASK SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /// Unified task type for sequential processing
  /// Combines orchestrator tasks with granular WASM/Frontend operations
  public type UnifiedTaskType = {
    /// High-level orchestrator tasks
    #Orchestrator : OrchestratorTask;

    // -- WASM Installation --
    /// Upload a single WASM chunk to target canister
    #WasmUploadChunk : {
      canisterId : Principal;
      chunkIndex : Nat;
      chunk : Blob;
      totalChunks : Nat;
    };
    /// Install WASM directly (for small modules < 2MB)
    #WasmInstallCode : {
      canisterId : Principal;
      wasmModule : Blob;
      wasmHash : Blob;
      initArg : Blob;
      mode : IC.CanisterInstallMode;
    };
    /// Install WASM from uploaded chunks
    #WasmInstallChunked : {
      canisterId : Principal;
      wasmHash : Blob;
      initArg : Blob;
      mode : IC.CanisterInstallMode;
    };

    // -- Frontend Installation --
    /// Create a new batch for frontend assets
    #FrontendCreateBatch : { canisterId : Principal };
    /// Upload a batch of files to the assets canister
    #FrontendUploadChunks : {
      canisterId : Principal;
      files : [File];
    };
    /// Commit the batch and finalize frontend installation
    #FrontendCommitBatch : { canisterId : Principal };

    // -- Permission Management --
    /// Revoke installer's Commit permission after frontend upload
    #RevokeInstallerPermission : { canisterId : Principal };
  };

  /// Task generated by submodules (without creationId)
  /// Used by WasmInstaller and FrontendInstaller
  public type GeneratedTask = {
    id : Nat;
    owner : Principal;
    taskType : UnifiedTaskType;
    var attempts : Nat;
  };

  /// Unified task for the single-timer queue
  /// Includes creationId to link task to storage creation process
  public type UnifiedTask = {
    id : Nat;
    /// ID of the storage creation process this task belongs to
    creationId : Nat;
    owner : Principal;
    taskType : UnifiedTaskType;
    var attempts : Nat;
  };

  /// State for multi-step task execution (stored per canisterId)
  public type TaskExecutionState = {
    /// Batch ID for frontend installation
    var batchId : ?Nat;
    /// Accumulated chunk hashes for chunked WASM installation
    chunkHashes : [var ?IC.ChunkHash];
    /// Accumulated batch operations for frontend commit
    var operationsCount : Nat;
  };
};
