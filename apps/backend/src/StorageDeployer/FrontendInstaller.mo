import Map "mo:core/Map";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Queue "mo:core/Queue";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Error "mo:core/Error";
import Time "mo:core/Time";

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

  public type DiagnosticsMutable = {
    totalFiles : Nat;
    totalBytes : Nat;
    var processedFiles : Nat;
    var processedBytes : Nat;
    var uploadedFiles : Nat;
    var uploadedBytes : Nat;
    var skippedFiles : Nat;
    var skippedBytes : Nat;
    var staleDeletedFiles : Nat;
    var changedDeletedFiles : Nat;
    batchesTotal : Nat;
    var batchesProcessed : Nat;
    var stage : Text;
    startedAt : Time.Time;
    var updatedAt : Time.Time;
    var completedAt : ?Time.Time;
    var error : ?Text;
  };

  /// Store for frontend installation state (passive - no timer)
  public type Store = {
    versions : Map.Map<Text, TarExtractor.Store>; // "storage-frontend@v0.1.0" → TarExtractor.Store
    region : MemoryRegion.MemoryRegion;
    batches : Map.Map<Principal, Nat>; // canisterId → batchId
    operations : Map.Map<Principal, Vector.Vector<HttpAssetsTypes.BatchOperationKind>>; // canisterId → operations
    statuses : Map.Map<Principal, StatusMutable>; // canisterId → status
    diagnostics : Map.Map<Principal, DiagnosticsMutable>; // canisterId → frontend install diagnostics
    /// Track which canisters are being upgraded (need old assets cleanup before commit)
    upgrading : Map.Map<Principal, Bool>; // canisterId → true if upgrade
    /// Existing asset hashes on canister (populated during upgrade in executeCreateBatch)
    /// key → sha256 (identity encoding)
    existingAssets : Map.Map<Principal, Map.Map<Text, Blob>>; // canisterId → (assetKey → sha256)
    /// All new frontend keys (populated during executeUploadChunks, includes skipped unchanged files)
    newFrontendKeys : Map.Map<Principal, Map.Map<Text, ()>>; // canisterId → set of keys
  };

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      region;
      versions = Map.empty();
      batches = Map.empty();
      operations = Map.empty();
      statuses = Map.empty();
      diagnostics = Map.empty();
      upgrading = Map.empty();
      existingAssets = Map.empty();
      newFrontendKeys = Map.empty();
    };
  };

  /// Reset transient per-operation state after canister upgrade.
  /// Preserves `versions` (extracted tar data) and `region`.
  public func resetTransient(store : Store) {
    Map.clear(store.batches);
    Map.clear(store.operations);
    Map.clear(store.statuses);
    Map.clear(store.diagnostics);
    Map.clear(store.upgrading);
    Map.clear(store.existingAssets);
    Map.clear(store.newFrontendKeys);
  };

  /// Clear per-canister installation state. Use this before retrying a failed
  /// frontend install so stale batch ids / operations cannot leak into the new
  /// attempt.
  public func resetCanisterState(store : Store, canisterId : Principal) {
    Map.remove(store.batches, Principal.compare, canisterId);
    Map.remove(store.operations, Principal.compare, canisterId);
    Map.remove(store.statuses, Principal.compare, canisterId);
    Map.remove(store.diagnostics, Principal.compare, canisterId);
    Map.remove(store.upgrading, Principal.compare, canisterId);
    Map.remove(store.existingAssets, Principal.compare, canisterId);
    Map.remove(store.newFrontendKeys, Principal.compare, canisterId);
  };

  func snapshotDiagnostics(d : DiagnosticsMutable) : Types.FrontendInstallDiagnostics {
    {
      totalFiles = d.totalFiles;
      totalBytes = d.totalBytes;
      processedFiles = d.processedFiles;
      processedBytes = d.processedBytes;
      uploadedFiles = d.uploadedFiles;
      uploadedBytes = d.uploadedBytes;
      skippedFiles = d.skippedFiles;
      skippedBytes = d.skippedBytes;
      staleDeletedFiles = d.staleDeletedFiles;
      changedDeletedFiles = d.changedDeletedFiles;
      batchesTotal = d.batchesTotal;
      batchesProcessed = d.batchesProcessed;
      stage = d.stage;
      startedAt = d.startedAt;
      updatedAt = d.updatedAt;
      completedAt = d.completedAt;
      error = d.error;
    };
  };

  func setStage(store : Store, canisterId : Principal, stage : Text) {
    switch (Map.get(store.diagnostics, Principal.compare, canisterId)) {
      case (?diagnostics) {
        diagnostics.stage := stage;
        diagnostics.updatedAt := Time.now();
      };
      case null {};
    };
  };

  func failDiagnostics(store : Store, canisterId : Principal, message : Text) {
    switch (Map.get(store.diagnostics, Principal.compare, canisterId)) {
      case (?diagnostics) {
        diagnostics.stage := "failed";
        diagnostics.updatedAt := Time.now();
        diagnostics.completedAt := ?diagnostics.updatedAt;
        diagnostics.error := ?message;
      };
      case null {};
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
  /// If isUpgrade is true, commit will first delete old frontend assets before creating new ones
  public func generateTasks(
    store : Store,
    versionKey : Text,
    targetCanisterId : Principal,
    owner : Principal,
    startId : Nat,
    isUpgrade : Bool,
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
    var uploadTasksCount = 0;
    let totalBytes = assets.vals() |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);

    // Create status FIRST
    let status : StatusMutable = #Uploading({
      var processed = 0;
      total = totalBytes;
      var processedFilesCount = 0;
      totalFilesCount = assets.size();
    });
    Map.add(store.statuses, Principal.compare, targetCanisterId, status);

    // Remember if this is an upgrade (executeCommitBatch will handle cleanup)
    if (isUpgrade) {
      ignore Map.insert(store.upgrading, Principal.compare, targetCanisterId, true);
    };

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
            uploadTasksCount += 1;
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
      uploadTasksCount += 1;
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

    let now = Time.now();
    ignore Map.insert(
      store.diagnostics,
      Principal.compare,
      targetCanisterId,
      {
        totalFiles = assets.size();
        totalBytes;
        var processedFiles = 0;
        var processedBytes = 0;
        var uploadedFiles = 0;
        var uploadedBytes = 0;
        var skippedFiles = 0;
        var skippedBytes = 0;
        var staleDeletedFiles = 0;
        var changedDeletedFiles = 0;
        batchesTotal = uploadTasksCount;
        var batchesProcessed = 0;
        var stage = "queued";
        startedAt = now;
        var updatedAt = now;
        var completedAt = null : ?Time.Time;
        var error = null : ?Text;
      },
    );

    #ok(Vector.toArray(tasks));
  };

  // ═══════════════════════════════════════════════════════════════
  // TASK EXECUTION
  // ═══════════════════════════════════════════════════════════════

  /// Check if an asset key belongs to user data (should be preserved during upgrade)
  func isUserAsset(key : Text) : Bool {
    key == "/info.json" or Text.startsWith(key, #text "/static/thumbnails/");
  };

  /// Execute batch creation.
  /// For upgrades: also fetches existing asset list with hashes for diff-based upload.
  public func executeCreateBatch(store : Store, canisterId : Principal) : async Result.Result<Nat, Text> {
    let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;
    setStage(store, canisterId, "create_batch");

    try {
      let isUpgrading = switch (Map.get(store.upgrading, Principal.compare, canisterId)) {
        case (?true) true;
        case _ false;
      };

      // For upgrades: fetch existing assets with their hashes before creating batch
      if (isUpgrading) {
        let assetDetails = await assetsCanister.list({});
        let hashMap = Map.empty<Text, Blob>();
        for ({ key; encodings } in assetDetails.vals()) {
          // Use sha256 from any encoding — pre-compressed files (.br, .gz) don't have
          // "identity" encoding, only "br" or "gzip". We need all keys in the map
          // so that delete_asset works correctly for changed/stale assets.
          label findHash for ({ sha256 } in encodings.vals()) {
            switch (sha256) {
              case (?hash) {
                ignore Map.insert(hashMap, Text.compare, key, hash);
                break findHash;
              };
              case null {};
            };
          };
        };
        ignore Map.insert(store.existingAssets, Principal.compare, canisterId, hashMap);
      };

      let { batch_id } = await assetsCanister.create_batch({});
      ignore Map.insert(store.batches, Principal.compare, canisterId, batch_id);
      #ok(batch_id);
    } catch (error) {
      let errMsg = "Create batch failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      failDiagnostics(store, canisterId, errMsg);
      #err(errMsg);
    };
  };

  /// Execute chunk upload for a batch of files.
  /// For upgrades: skips files whose sha256 matches the existing asset on canister.
  public func executeUploadChunks(store : Store, canisterId : Principal, files : [Types.File]) : async Result.Result<(), Text> {
    let ?batchId = Map.get(store.batches, Principal.compare, canisterId) else {
      failDiagnostics(store, canisterId, "No batch found for canister");
      return #err("No batch found for canister");
    };

    let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;
    setStage(store, canisterId, "upload_chunks");

    // For upgrades: filter out unchanged files
    let existingHashes = Map.get(store.existingAssets, Principal.compare, canisterId);
    let filesToUpload = switch (existingHashes) {
      case (?hashes) {
        files.vals()
        |> Iter.filter(
          _,
          func(file : Types.File) : Bool {
            switch (Map.get(hashes, Text.compare, file.key)) {
              case (?existingHash) { not (Blob.equal(existingHash, file.sha256)) };
              case null true; // new file — upload
            };
          },
        )
        |> Iter.toArray(_);
      };
      case null files;
    };

    // Record ALL file keys (including skipped) for stale asset detection in commit
    let keysMap = switch (Map.get(store.newFrontendKeys, Principal.compare, canisterId)) {
      case (?existing) existing;
      case null {
        let m = Map.empty<Text, ()>();
        ignore Map.insert(store.newFrontendKeys, Principal.compare, canisterId, m);
        m;
      };
    };
    for (file in files.vals()) {
      ignore Map.insert(keysMap, Text.compare, file.key, ());
    };

    let skippedFiles = files.size() - filesToUpload.size();
    let skippedBytes = files.vals()
    |> Iter.filter(
      _,
      func(file : Types.File) : Bool {
        switch (existingHashes) {
          case (?hashes) {
            switch (Map.get(hashes, Text.compare, file.key)) {
              case (?existingHash) { Blob.equal(existingHash, file.sha256) };
              case null false;
            };
          };
          case null false;
        };
      },
    )
    |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);
    let uploadedBytes = filesToUpload.vals() |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);

    let markBatchProcessed = func() {
      switch (Map.get(store.statuses, Principal.compare, canisterId)) {
        case (?#Uploading(uploading)) {
          uploading.processed += skippedBytes + uploadedBytes;
          uploading.processedFilesCount += files.size();
        };
        case _ {};
      };
      switch (Map.get(store.diagnostics, Principal.compare, canisterId)) {
        case (?diagnostics) {
          diagnostics.processedBytes += skippedBytes + uploadedBytes;
          diagnostics.processedFiles += files.size();
          diagnostics.uploadedBytes += uploadedBytes;
          diagnostics.uploadedFiles += filesToUpload.size();
          diagnostics.skippedBytes += skippedBytes;
          diagnostics.skippedFiles += skippedFiles;
          diagnostics.batchesProcessed += 1;
          diagnostics.updatedAt := Time.now();
        };
        case null {};
      };
    };

    // If all files in this batch were skipped, return early
    if (filesToUpload.size() == 0) {
      markBatchProcessed();
      return #ok(());
    };

    try {
      let { chunk_ids } = await assetsCanister.create_chunks({
        batch_id = batchId;
        content = filesToUpload.vals() |> Iter.map(_, func({ content }) = content) |> Iter.toArray(_);
      });

      markBatchProcessed();

      // Accumulate operations for commit (only for uploaded files)
      let operations = Iter.zip(filesToUpload.vals(), chunk_ids.vals()) |> Iter.flatMap<(Types.File, Nat), HttpAssetsTypes.BatchOperationKind>(
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
      failDiagnostics(store, canisterId, errMsg);
      #err(errMsg);
    };
  };

  /// Execute batch commit
  /// For upgrades: first deletes old frontend assets via a separate commit_batch,
  /// then commits new assets. This avoids http-assets Certs.mo merge bug and
  /// minimizes downtime (both operations in one queue step).
  public func executeCommitBatch(store : Store, canisterId : Principal) : async Result.Result<(), Text> {
    let ?batchId = Map.get(store.batches, Principal.compare, canisterId) else {
      failDiagnostics(store, canisterId, "No batch found for canister");
      return #err("No batch found for canister");
    };

    let isUpgrading = switch (Map.get(store.upgrading, Principal.compare, canisterId)) {
      case (?true) true;
      case _ false;
    };

    let operations = Map.get(store.operations, Principal.compare, canisterId);

    // For fresh install: operations are required
    if (not isUpgrading) {
      switch (operations) {
        case null {
          failDiagnostics(store, canisterId, "No operations found for canister");
          return #err("No operations found for canister");
        };
        case _ {};
      };
    };

    let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;

    ignore Map.insert(store.statuses, Principal.compare, canisterId, #Committing);
    setStage(store, canisterId, "commit_batch");

    try {
      if (isUpgrading) {
        // Use full set of new frontend keys (collected during executeUploadChunks,
        // includes both changed AND unchanged files)
        let newKeys = switch (Map.get(store.newFrontendKeys, Principal.compare, canisterId)) {
          case (?keys) keys;
          case null Map.empty<Text, ()>();
        };

        // Collect keys of changed files from operations (will be re-created via commit_batch)
        let changedKeys = Map.empty<Text, ()>();
        switch (operations) {
          case (?ops) {
            for (op in Vector.vals(ops)) {
              switch (op) {
                case (#CreateAsset({ key })) {
                  ignore Map.insert(changedKeys, Text.compare, key, ());
                };
                case _ {};
              };
            };
          };
          case null {};
        };

        // 1. Delete stale assets AND changed assets that will be re-created.
        // Stale = exist on canister but not in new frontend → delete to free space.
        // Changed = exist on canister with different hash → delete before #CreateAsset.
        // Unchanged files are left untouched (not in operations, not deleted).
        setStage(store, canisterId, "delete_assets");
        switch (Map.get(store.existingAssets, Principal.compare, canisterId)) {
          case (?existingHashes) {
            for ((key, _) in Map.entries(existingHashes)) {
              let isStale = not Map.containsKey(newKeys, Text.compare, key);
              let isChanged = Map.containsKey(changedKeys, Text.compare, key);
              if (not isUserAsset(key) and (isStale or isChanged)) {
                await assetsCanister.delete_asset({ key });
                switch (Map.get(store.diagnostics, Principal.compare, canisterId)) {
                  case (?diagnostics) {
                    if (isStale) {
                      diagnostics.staleDeletedFiles += 1;
                    } else if (isChanged) {
                      diagnostics.changedDeletedFiles += 1;
                    };
                    diagnostics.updatedAt := Time.now();
                  };
                  case null {};
                };
              };
            };
          };
          case null {};
        };

        // 2. Install new/changed frontend assets (skip if no changes)
        setStage(store, canisterId, "commit_batch");
        switch (operations) {
          case (?ops) {
            if (Vector.size(ops) > 0) {
              await assetsCanister.commit_batch({
                batch_id = batchId;
                operations = Vector.toArray(ops);
              });
            };
          };
          case null {};
        };
      } else {
        // Fresh install: commit as-is
        let ?ops = operations else {
          failDiagnostics(store, canisterId, "No operations found for canister");
          return #err("No operations found for canister");
        };
        await assetsCanister.commit_batch({
          batch_id = batchId;
          operations = Vector.toArray(ops);
        });
      };

      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Completed);
      switch (Map.get(store.diagnostics, Principal.compare, canisterId)) {
        case (?diagnostics) {
          diagnostics.stage := "completed";
          diagnostics.updatedAt := Time.now();
          diagnostics.completedAt := ?diagnostics.updatedAt;
        };
        case null {};
      };

      // Cleanup
      Map.remove(store.operations, Principal.compare, canisterId);
      Map.remove(store.batches, Principal.compare, canisterId);
      Map.remove(store.upgrading, Principal.compare, canisterId);
      Map.remove(store.existingAssets, Principal.compare, canisterId);
      Map.remove(store.newFrontendKeys, Principal.compare, canisterId);

      #ok(());
    } catch (error) {
      let errMsg = "Commit batch failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      failDiagnostics(store, canisterId, errMsg);
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

  public func getDiagnostics(store : Store, canisterId : Principal) : ?Types.FrontendInstallDiagnostics {
    switch (Map.get(store.diagnostics, Principal.compare, canisterId)) {
      case (?diagnostics) ?snapshotDiagnostics(diagnostics);
      case null null;
    };
  };

  /// Mark installation as failed
  public func setFailed(store : Store, canisterId : Principal, error : Text) : () {
    ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(error));
    failDiagnostics(store, canisterId, error);
  };

  /// Clear status for a canister
  public func clearStatus(store : Store, canisterId : Principal) : () {
    Map.remove(store.statuses, Principal.compare, canisterId);
    Map.remove(store.diagnostics, Principal.compare, canisterId);
    Map.remove(store.operations, Principal.compare, canisterId);
    Map.remove(store.batches, Principal.compare, canisterId);
    Map.remove(store.upgrading, Principal.compare, canisterId);
    Map.remove(store.existingAssets, Principal.compare, canisterId);
    Map.remove(store.newFrontendKeys, Principal.compare, canisterId);
  };
};
