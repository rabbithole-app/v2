import Time "mo:core/Time";
import Principal "mo:core/Principal";

import LedgerTypes "LedgerTypes";
import CMCTypes "CMCTypes";
import GitHubReleasesTypes "../GitHubReleases/Types";

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

  /// Options for creating a new storage canister
  ///
  /// Example:
  /// ```motoko
  /// let options : CreateStorageOptions = {
  ///   initialCycles = 1_000_000_000_000;
  ///   canisterId = null;
  ///   subnetId = null;
  ///   releaseSelector = #Latest;
  ///   initArg = to_candid({});
  /// };
  /// ```
  public type CreateStorageOptions = {
    initialCycles : Nat;
    canisterId : ?Principal;
    subnetId : ?Principal;
    releaseSelector : ReleaseSelector;
    initArg : Blob;
  };

  /// Errors that can occur during storage creation
  public type CreateStorageError = {
    #ReleaseNotFound;
    #AlreadyInProgress;
    #InsufficientAllowance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.TransferFromError;
    #NotifyFailed : CMCTypes.NotifyError;
    #WasmInstallFailed : Text;
    #FrontendInstallFailed : Text;
    #UpdateControllersFailed : Text;
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
    #UpdatingControllers : { canisterId : Principal };
    #Completed : { canisterId : Principal };
    #Failed : Text;
  };

  // -- Storage Creation Record --

  /// Record of a storage creation (for history/tracking)
  public type StorageCreationRecord = {
    owner : Principal;
    releaseTag : Text;
    initArg : Blob;
    createdAt : Time.Time;
    canisterId : ?Principal;
    wasmHash : ?Blob;
    frontendHash : ?Blob;
    status : CreationStatus;
    completedAt : ?Time.Time;
  };

  // -- Task Types --

  /// Task in the orchestrator queue
  public type OrchestratorTask = {
    owner : Principal;
    taskType : TaskType;
  };

  /// Type of orchestrator task
  public type TaskType = {
    #CreateCanister : { options : CreateStorageOptions };
    #LinkCanister : { canisterId : Principal };
    #InstallWasm : { canisterId : Principal; releaseTag : Text; initArg : Blob };
    #WaitForWasm : { canisterId : Principal; releaseTag : Text };
    #InstallFrontend : { canisterId : Principal; releaseTag : Text };
    #WaitForFrontend : { canisterId : Principal };
    #UpdateControllers : { canisterId : Principal };
    #Complete : { canisterId : Principal };
  };
};
