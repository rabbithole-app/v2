import Time "mo:core/Time";
import Principal "mo:core/Principal";

import IC "mo:ic";

import TreasuryTypes "mo:treasury/Types";
import ZenDB "mo:zendb";

import LedgerTypes "../Types/LedgerTypes";
import CMCTypes "../Types/CMCTypes";
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
  public type EnvPair = { name : Text; value : Text };

  public type CreateStorageOptions = {
    target : TargetCanister;
    releaseSelector : ReleaseSelector;
    initArg : Blob;
    envPairs : ?[EnvPair];
  };

  /// Errors that can occur during storage creation
  public type CreateStorageError = {
    #ReleaseNotFound;
    #AlreadyInProgress;
    #CanisterAlreadyUsed : { canisterId : Principal };
    #InsufficientBalance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.Icrc1TransferError;
    #NotifyFailed : CMCTypes.NotifyError;
    #WasmInstallFailed : Text;
    #FrontendInstallFailed : Text;
    #UpdateControllersFailed : Text;
  };

  /// Errors that can occur when adding an external storage
  public type AddStorageError = {
    #CanisterAlreadyUsed : { canisterId : Principal };
    #InvalidWasm : Text;
    #NotController;
  };

  /// Errors that can occur when deleting a storage record
  public type DeleteStorageError = {
    #NotFound;
    #NotOwner;
    #NotFailed;
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

  /// Payment lifecycle. `#completed` on initial charge; flips to `#refunded`
  /// only via `recoverFailedStorage(#refund)` (owner-initiated) or admin
  /// intervention. License charges land 100% in the treasury subaccount
  /// (see Balance.chargeForLicense with `deferAmbassadorPayout = true`),
  /// so refunds are a straight 1:1 transfer back to the payer — no
  /// ambassador clawback is involved. Ambassador share is disbursed
  /// separately at `#CanisterCreated` via `treasury.distributeAmbassadorShare`.
  public type PaymentStatus = {
    #completed;
    #refunded : { at : Time.Time; blockIndex : ?Nat; reason : Text };
  };

  /// Payment receipt — proof that a license was paid for this storage creation.
  /// Lifecycle is represented by `status`; amount/tokenId/paymentId are immutable.
  public type PaymentReceipt = {
    tokenId : TreasuryTypes.TokenId;
    amount : Nat;
    paymentId : Text;
    paidAt : Time.Time;
    status : PaymentStatus;
  };

  /// License — one per storage canister, lives independently of StorageCreationRecord.
  /// `owner` is stored as a field (used to be the implicit Map key). `statusTag`
  /// shadows `receipt.status` variant for ZenDB index queries — kept in sync on
  /// every write. Never read by code; variant stays source of truth.
  public type License = {
    owner : Principal;
    canisterId : ?Principal;  // null = unbound, ?id = bound to canister
    receipt : PaymentReceipt;
    statusTag : Text;         // "completed" | "refunded"
    createdAt : Time.Time;
  };

  /// Outcome of the deferred ambassador payout for a license-backed
  /// creation. Lifecycle:
  ///   - `#skipped` — no license attached, or external `addStorage` path.
  ///     No payout expected.
  ///   - `#pending` — license attached, canister not yet created; payout
  ///     is queued for `#CanisterCreated` (the refund point of no return).
  ///   - `#completed` — ambassadors have been transferred their share from
  ///     treasury (idempotent — dedup key `"ambassador:" # paymentId`).
  ///   - `#failed : Text` — payout attempt returned an error. Admin can
  ///     retry via `retryAmbassadorPayout(creationId)`.
  public type AmbassadorPayoutStatus = {
    #skipped;
    #pending;
    #completed;
    #failed : Text;
  };

  /// Project `AmbassadorPayoutStatus` variant to its index-friendly Text
  /// form. Used as a shadow field `ambassadorPayoutStatusTag` so admin
  /// listings can filter "all failed payouts" via ZenDB `#anyOf([#Text("failed")])`.
  /// (ZenDB Orchid encoder doesn't support `#eq` on variant fields, hence
  /// the shadow.)
  public func tagOfAmbassadorPayoutStatus(s : AmbassadorPayoutStatus) : Text {
    switch (s) {
      case (#skipped) "skipped";
      case (#pending) "pending";
      case (#completed) "completed";
      case (#failed _) "failed";
    };
  };

  /// Project `PaymentStatus` variant to its index-friendly Text form.
  public func tagOfPaymentStatus(s : PaymentStatus) : Text {
    switch (s) {
      case (#completed) "completed";
      case (#refunded _) "refunded";
    };
  };

  // -- List options / responses --

  /// Time-range filter used in ListCreationsOptions / ListLicensesOptions.
  public type TimeRangeFilter = { min : ?Time.Time; max : ?Time.Time };

  public type ListLicensesOptions = {
    filter : {
      id : ?[Nat];
      owner : ?[Principal];
      canisterId : ?[Principal];
      paymentId : ?Text;
      statusTag : ?[Text];
      hasCanister : ?Bool;
      createdAt : ?TimeRangeFilter;
      paidAt : ?TimeRangeFilter;
    };
    sort : [(Text, ZenDB.Types.SortDirection)];
    pagination : { limit : Nat; offset : Nat };
    count : Bool;
  };

  public type GetLicensesResponse = {
    data : [License];
    total : ?Nat;
    instructions : Nat;
  };

  public let DEFAULT_LIST_LICENSES_OPTIONS : ListLicensesOptions = {
    filter = {
      id = null;
      owner = null;
      canisterId = null;
      paymentId = null;
      statusTag = null;
      hasCanister = null;
      createdAt = null;
      paidAt = null;
    };
    sort = [];
    pagination = { limit = 100; offset = 0 };
    count = false;
  };

  /// Sub-phases of `#ProcessingPayment`. Each phase has a distinct tag so the
  /// timeline records a separate event when the record advances between them;
  /// progress-only transitions (e.g. chunk counts inside `#InstallingWasm`)
  /// still collapse into one event via tag-based dedup.
  public type PaymentPhase = {
    #Starting;
    #FetchingRates;       // XRC calls for ICP/ETH/SOL prices
    #CheckingBalances;    // iterating spending-priority tokens (HTTPS outcalls)
    #Charging : { tokenId : TreasuryTypes.TokenId; amount : Nat };
    #RecordingLicense;
    #Activating;
    #Queueing;
  };

  /// Current status of a storage creation process
  public type CreationStatus = {
    #ProcessingPayment : PaymentPhase;
    #Pending;
    #CheckingBalance;
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

  /// One entry in the creation record's audit trail. Appended on every
  /// meaningful status transition; all data is carried by the `status` variant.
  public type StatusEvent = {
    status : CreationStatus;
    timestamp : Time.Time;
  };

  // -- Storage Creation Record --

  /// Record of a storage creation (for history/tracking).
  /// `statusTag` shadows `status` variant for ZenDB index queries — kept in
  /// sync on every write. `events` is an append-only timeline of major
  /// status transitions (dedup by tag in lib.mo:appendEvent).
  public type StorageCreationRecord = {
    /// Unique ID of this creation process
    id : Nat;
    owner : Principal;
    releaseTag : Text;
    initArg : Blob;
    envPairs : ?[EnvPair];
    createdAt : Time.Time;
    canisterId : ?Principal;
    wasmHash : ?Blob;
    frontendHash : ?Blob;
    installedReleaseTag : ?Text;
    status : CreationStatus;
    statusTag : Text;
    completedAt : ?Time.Time;
    licensePaymentId : ?Text;
    isUpgrade : Bool;
    upgradeIncludesFrontend : Bool;
    lastUpgradeError : ?Text;
    events : [StatusEvent];
    /// Deferred ambassador payout status. Set to #pending when a license
    /// is attached, flips to #completed/#failed at #CanisterCreated when
    /// the orchestrator fires the payout callback. #skipped for records
    /// without a license (external addStorage path).
    ambassadorPayoutStatus : AmbassadorPayoutStatus;
    /// Shadow of `ambassadorPayoutStatus` variant tag — Text for ZenDB
    /// query compatibility. Kept in sync on every mutation via
    /// `setAmbassadorPayoutStatus`.
    ambassadorPayoutStatusTag : Text;
  };

  /// Project `CreationStatus` variant to its index-friendly Text form. Inner
  /// progress data (chunk counts) is NOT part of the tag — dedup happens on
  /// tag alone, so a 100-chunk install yields one `"InstallingWasm"` event.
  public func tagOfCreationStatus(s : CreationStatus) : Text {
    switch (s) {
      case (#ProcessingPayment(phase)) switch (phase) {
        case (#Starting) "ProcessingPayment.Starting";
        case (#FetchingRates) "ProcessingPayment.FetchingRates";
        case (#CheckingBalances) "ProcessingPayment.CheckingBalances";
        case (#Charging _) "ProcessingPayment.Charging";
        case (#RecordingLicense) "ProcessingPayment.RecordingLicense";
        case (#Activating) "ProcessingPayment.Activating";
        case (#Queueing) "ProcessingPayment.Queueing";
      };
      case (#Pending) "Pending";
      case (#CheckingBalance) "CheckingBalance";
      case (#TransferringICP _) "TransferringICP";
      case (#NotifyingCMC _) "NotifyingCMC";
      case (#CanisterCreated _) "CanisterCreated";
      case (#InstallingWasm _) "InstallingWasm";
      case (#UploadingFrontend _) "UploadingFrontend";
      case (#RevokingInstallerPermission _) "RevokingInstallerPermission";
      case (#UpdatingControllers _) "UpdatingControllers";
      case (#UpgradingWasm _) "UpgradingWasm";
      case (#UpgradingFrontend _) "UpgradingFrontend";
      case (#Completed _) "Completed";
      case (#Failed _) "Failed";
    };
  };

  public type ListCreationsOptions = {
    filter : {
      id : ?[Nat];
      owner : ?[Principal];
      canisterId : ?[Principal];
      statusTag : ?[Text];
      releaseTag : ?Text;
      hasCanister : ?Bool;
      hasLicense : ?Bool;
      createdAt : ?TimeRangeFilter;
      completedAt : ?TimeRangeFilter;
      ambassadorPayoutStatus : ?[Text];
    };
    sort : [(Text, ZenDB.Types.SortDirection)];
    pagination : { limit : Nat; offset : Nat };
    count : Bool;
  };

  public type GetCreationsResponse = {
    data : [StorageCreationRecord];
    total : ?Nat;
    instructions : Nat;
  };

  public let DEFAULT_LIST_CREATIONS_OPTIONS : ListCreationsOptions = {
    filter = {
      id = null;
      owner = null;
      canisterId = null;
      statusTag = null;
      releaseTag = null;
      hasCanister = null;
      hasLicense = null;
      createdAt = null;
      completedAt = null;
      ambassadorPayoutStatus = null;
    };
    sort = [];
    pagination = { limit = 100; offset = 0 };
    count = false;
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
    lastUpgradeError : ?Text;
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
