import Map "mo:core/Map";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Queue "mo:core/Queue";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Error "mo:core/Error";

import MemoryRegion "mo:memory-region/MemoryRegion";
import Vector "mo:vector";

import TarExtractor "TarExtractor";
import Types "Types";
import HttpAssetsTypes "mo:http-assets/BaseAssets/Types";

module FrontendInstaller {
  /// Re-export TarExtractor.Status for external use
  public type ExtractionStatus = TarExtractor.Status;

  /// Maximum size of files per batch (in bytes)
  public let MAX_INTEROP_CHUNKS_SIZE : Nat = 1_900_000; // 1.9MB

  /// Maximum number of files per batch to prevent output queue overflow.
  /// The http-assets library creates parallel async self-calls for each file in create_chunks,
  /// which can overflow the output queue when too many files are processed at once.
  /// Keeping this at 5 prevents "could not perform self call" errors in real IC environment
  /// where parallel message processing (interleaved execution) can cause output queue overflow.
  public let MAX_FILES_PER_BATCH : Nat = 5;

  public type UploadingStatus = {
    processed : Nat;
    total : Nat;
    processedFilesCount : Nat;
    totalFilesCount : Nat;
  };

  public type UploadingStatusMutable = {
    var processed : Nat;
    total : Nat;
    var processedFilesCount : Nat;
    totalFilesCount : Nat;
  };

  public type Status = {
    #Uploading : UploadingStatus;
    #Committing;
    #Failed : Text;
    #Completed;
  };

  public type StatusMutable = {
    #Uploading : UploadingStatusMutable;
    #Committing;
    #Failed : Text;
    #Completed;
  };

  /// Store for frontend installation state (passive - no timer)
  public type Store = {
    versions : Map.Map<Text, TarExtractor.Store>; // "storage-frontend@v0.1.0" → TarExtractor.Store
    region : MemoryRegion.MemoryRegion;
    batches : Map.Map<Principal, Nat>; // canisterId → batchId
    operations : Map.Map<Principal, Vector.Vector<HttpAssetsTypes.BatchOperationKind>>; // canisterId → operations
    statuses : Map.Map<Principal, StatusMutable>; // canisterId → status
  };

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      region;
      versions = Map.empty();
      batches = Map.empty();
      operations = Map.empty();
      statuses = Map.empty();
    };
  };

  /// Add a new version for extraction
  /// If isGzipped is true, will decompress gzip before parsing tar
  public func add<system>(store : Store, args : { versionKey : Text; hash : Blob; contentPointer : Types.SizedPointer; isGzipped : Bool }) : () {
    let extractor = TarExtractor.new({
      region = store.region;
      pointer = args.contentPointer;
      isGzipped = args.isGzipped;
    });
    TarExtractor.extract<system>(extractor);
    Map.add(store.versions, Text.compare, args.versionKey, extractor);
  };

  public func remove(store : Store, key : Text) : () {
    Map.remove(store.versions, Text.compare, key);
  };

  /// Invalidate a version: clear extracted files, deallocate memory, and remove from store
  /// Use this when the source asset has changed (e.g., hash mismatch detected)
  public func invalidateVersion<system>(store : Store, key : Text) : () {
    switch (Map.get(store.versions, Text.compare, key)) {
      case (?extractor) {
        // Clear and deallocate all resources
        TarExtractor.clear<system>(extractor);
      };
      case null {};
    };
    // Remove from versions map
    Map.remove(store.versions, Text.compare, key);
  };

  public func getFiles(store : Store, key : Text) : [Types.File] {
    switch (Map.get(store.versions, Text.compare, key)) {
      case (?extractor) TarExtractor.getFiles(extractor);
      case null [];
    };
  };

  public func getExtractionStatus(store : Store, key : Text) : ExtractionStatus {
    switch (Map.get(store.versions, Text.compare, key)) {
      case (?extractor) TarExtractor.getStatus(extractor);
      case null #Idle;
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // TASK GENERATION
  // ═══════════════════════════════════════════════════════════════

  /// Generate tasks for frontend installation
  /// Returns GeneratedTask (without creationId) - the orchestrator adds creationId when queuing
  public func generateTasks(
    store : Store,
    versionKey : Text,
    targetCanisterId : Principal,
    owner : Principal,
    startId : Nat,
  ) : Result.Result<[Types.GeneratedTask], Text> {
    let ?extractor = Map.get(store.versions, Text.compare, versionKey) else {
      return #err("Version not found: " # versionKey);
    };

    let assets = TarExtractor.getFiles(extractor);
    if (assets.size() == 0) {
      return #err("No files found in version: " # versionKey);
    };

    let tasks = Vector.new<Types.GeneratedTask>();
    var taskId = startId;

    // Create status FIRST
    let status : StatusMutable = #Uploading({
      var processed = 0;
      total = assets.vals() |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);
      var processedFilesCount = 0;
      totalFilesCount = assets.size();
    });
    Map.add(store.statuses, Principal.compare, targetCanisterId, status);

    // Task 1: Create batch
    Vector.add(
      tasks,
      {
        id = taskId;
        owner;
        taskType = #FrontendCreateBatch({ canisterId = targetCanisterId });
        var attempts = 0;
      },
    );
    taskId += 1;

    // Tasks 2-N: Upload chunks in batches
    let assetsQueue : Queue.Queue<Types.File> = assets |> Queue.fromArray(_);
    let partition : Vector.Vector<Types.File> = Vector.new();
    var collectedSize : Nat = 0;

    while (not Queue.isEmpty(assetsQueue)) {
      switch (Queue.popFront(assetsQueue)) {
        case (?asset) {
          // Check both size limit AND file count limit
          let shouldFlush = (collectedSize + asset.size > MAX_INTEROP_CHUNKS_SIZE or Vector.size(partition) >= MAX_FILES_PER_BATCH)
            and Vector.size(partition) > 0;

          if (shouldFlush) {
            Vector.add(
              tasks,
              {
                id = taskId;
                owner;
                taskType = #FrontendUploadChunks({
                  canisterId = targetCanisterId;
                  files = Vector.toArray(partition);
                });
                var attempts = 0;
              },
            );
            taskId += 1;
            Vector.clear(partition);
            collectedSize := 0;
          };

          Vector.add(partition, asset);
          collectedSize += asset.size;
        };
        case null {};
      };
    };

    // Flush remaining files
    if (Vector.size(partition) > 0) {
      Vector.add(
        tasks,
        {
          id = taskId;
          owner;
          taskType = #FrontendUploadChunks({
            canisterId = targetCanisterId;
            files = Vector.toArray(partition);
          });
          var attempts = 0;
        },
      );
      taskId += 1;
    };

    // Final task: Commit batch
    Vector.add(
      tasks,
      {
        id = taskId;
        owner;
        taskType = #FrontendCommitBatch({ canisterId = targetCanisterId });
        var attempts = 0;
      },
    );

    #ok(Vector.toArray(tasks));
  };

  // ═══════════════════════════════════════════════════════════════
  // TASK EXECUTION
  // ═══════════════════════════════════════════════════════════════

  /// Execute batch creation
  public func executeCreateBatch(store : Store, canisterId : Principal) : async Result.Result<Nat, Text> {
    let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;

    try {
      let { batch_id } = await assetsCanister.create_batch({});
      ignore Map.insert(store.batches, Principal.compare, canisterId, batch_id);
      #ok(batch_id);
    } catch (error) {
      let errMsg = "Create batch failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      #err(errMsg);
    };
  };

  /// Execute chunk upload for a batch of files
  public func executeUploadChunks(store : Store, canisterId : Principal, files : [Types.File]) : async Result.Result<(), Text> {
    let ?batchId = Map.get(store.batches, Principal.compare, canisterId) else {
      return #err("No batch found for canister");
    };

    let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;

    try {
      let { chunk_ids } = await assetsCanister.create_chunks({
        batch_id = batchId;
        content = files.vals() |> Iter.map(_, func({ content }) = content) |> Iter.toArray(_);
      });

      // Update status
      switch (Map.get(store.statuses, Principal.compare, canisterId)) {
        case (?#Uploading(uploading)) {
          uploading.processed += files.vals() |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);
          uploading.processedFilesCount += files.size();
        };
        case _ {};
      };

      // Accumulate operations for commit
      let operations = Iter.zip(files.vals(), chunk_ids.vals()) |> Iter.flatMap<(Types.File, Nat), HttpAssetsTypes.BatchOperationKind>(
        _,
        func((file, chunkId)) {
          let encoding = if (Text.endsWith(file.key, #text ".gz")) "gzip" else if (Text.endsWith(file.key, #text ".br")) "br" else "identity";
          Iter.fromArray<HttpAssetsTypes.BatchOperationKind>([
            #CreateAsset({
              key = file.key;
              content_type = file.contentType;
              headers = ?[];
              allow_raw_access = ?false;
              max_age = null;
              enable_aliasing = ?Text.endsWith(file.key, #text "index.html");
            }),
            #SetAssetContent({
              key = file.key;
              sha256 = ?file.sha256;
              chunk_ids = [chunkId];
              content_encoding = encoding;
            }),
          ]);
        },
      ) |> Iter.toArray(_);

      switch (Map.get(store.operations, Principal.compare, canisterId)) {
        case (?vector) {
          for (op in operations.vals()) {
            Vector.add(vector, op);
          };
        };
        case null {
          let vector = Vector.fromArray<HttpAssetsTypes.BatchOperationKind>(operations);
          Map.add(store.operations, Principal.compare, canisterId, vector);
        };
      };

      #ok(());
    } catch (error) {
      let errMsg = "Upload chunks failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      #err(errMsg);
    };
  };

  /// Execute batch commit
  public func executeCommitBatch(store : Store, canisterId : Principal) : async Result.Result<(), Text> {
    let ?batchId = Map.get(store.batches, Principal.compare, canisterId) else {
      return #err("No batch found for canister");
    };

    let ?operations = Map.get(store.operations, Principal.compare, canisterId) else {
      return #err("No operations found for canister");
    };

    let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;

    ignore Map.insert(store.statuses, Principal.compare, canisterId, #Committing);

    try {
      await assetsCanister.commit_batch({
        batch_id = batchId;
        operations = Vector.toArray(operations);
      });

      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Completed);

      // Cleanup
      Map.remove(store.operations, Principal.compare, canisterId);
      Map.remove(store.batches, Principal.compare, canisterId);

      #ok(());
    } catch (error) {
      let errMsg = "Commit batch failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      #err(errMsg);
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // STATUS QUERIES
  // ═══════════════════════════════════════════════════════════════

  public func getInstallationStatus(store : Store, canisterId : Principal) : ?Status {
    switch (Map.get(store.statuses, Principal.compare, canisterId)) {
      case (?#Uploading(uploading)) {
        ?#Uploading({
          processed = uploading.processed;
          total = uploading.total;
          processedFilesCount = uploading.processedFilesCount;
          totalFilesCount = uploading.totalFilesCount;
        });
      };
      case (?#Committing) ?#Committing;
      case (?#Failed(error)) ?#Failed(error);
      case (?#Completed) ?#Completed;
      case null null;
    };
  };

  /// Mark installation as failed
  public func setFailed(store : Store, canisterId : Principal, error : Text) : () {
    ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(error));
  };

  /// Clear status for a canister
  public func clearStatus(store : Store, canisterId : Principal) : () {
    Map.remove(store.statuses, Principal.compare, canisterId);
    Map.remove(store.operations, Principal.compare, canisterId);
    Map.remove(store.batches, Principal.compare, canisterId);
  };
};
