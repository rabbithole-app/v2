import T "mo:encrypted-storage/Types";

module {
  public type SaveThumbnailArguments = {
    entry : T.Entry;
    thumbnail : { content : Blob; contentType : Text };
  };

  /* -------------------------------------------------------------------------- */
  /*                        Storage Creation Types                              */
  /* -------------------------------------------------------------------------- */

  // Task status lifecycle
  public type StorageTaskStatus = {
    #Pending; // Awaiting processing
    #ValidatingAllowance; // Checking ICP allowance
    #TransferringICP; // Transferring ICP to CMC
    #CreatingCanister; // Creating canister via CMC
    #InstallingWasm; // Installing WASM module
    #DownloadingRelease; // Downloading frontend from GitHub
    #ExtractingArchive; // Extracting tar.gz archive
    #UploadingFrontend; // Uploading frontend assets
    #ConfiguringCanister; // Setting controllers
    #Completed; // Successfully completed
    #Failed : Text; // Failed with error message
  };

  // Main task structure
  public type StorageTask = {
    id : Nat; // Unique task ID
    owner : Principal; // Task owner
    status : StorageTaskStatus; // Current status
    canisterId : ?Principal; // Set after canister creation
    cyclesAmount : Nat; // Requested cycles in trillion cycles (TC)
    createdAt : Int; // Creation timestamp (nanoseconds)
    updatedAt : Int; // Last update timestamp (nanoseconds)
    completedSteps : [Text]; // Audit trail of completed steps
  };

  // GitHub release metadata
  public type Release = {
    tagName : Text; // e.g., "storage-v1.0.0"
    publishedAt : Int; // Publication timestamp
    frontendTarGzUrl : Text; // URL for frontend tar.gz download
    frontendTarGzSize : Nat; // Frontend file size in bytes
    wasmGzUrl : Text; // URL for wasm.gz download
    wasmGzSize : Nat; // WASM file size in bytes
    wasmSha256 : ?Text; // Expected WASM hash (optional)
  };

  // Cached release data
  public type CachedRelease = {
    release : Release;
    frontendTarGzData : Blob; // Compressed frontend
    wasmBlob : Blob; // Decompressed WASM module
    cachedAt : Int; // When cached
  };

  // API types
  public type CreateStorageRequest = {
    cyclesAmount : Nat; // In trillion cycles
  };

  public type CreateStorageResponse = {
    taskId : Nat;
  };

  public type GithubOptions = {
    apiUrl : Text;
    owner : Text;
    repo : Text;
    token : ?Text;
  };

  public type InitArgs = {
    github : ?GithubOptions;
  };

  /* -------------------------------------------------------------------------- */
  /*                    EncryptedStorageCanister Init Args                      */
  /* -------------------------------------------------------------------------- */

  public type EncryptedStorageInitArgs = {
    owner : Principal;
    vetKeyName : Text;
  };
};
