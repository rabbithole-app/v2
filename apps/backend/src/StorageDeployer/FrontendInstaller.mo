import Map "mo:core/Map";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Queue "mo:core/Queue";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Error "mo:core/Error";
import Timer "mo:core/Timer";
import Option "mo:core/Option";

import MemoryRegion "mo:memory-region/MemoryRegion";
import Vector "mo:vector";

import TarExtractor "TarExtractor";
import Types "Types";
import HttpAssetsTypes "mo:http-assets/BaseAssets/Types";

module FrontendInstaller {
  /// Re-export TarExtractor.Status for external use
  public type ExtractionStatus = TarExtractor.Status;

  let MAX_INTEROP_CHUNKS_SIZE : Nat = 1_900_000; // 1.9MB

  /// Maximum number of files per batch to prevent output queue overflow.
  /// The http-assets library creates parallel async self-calls for each file in create_chunks,
  /// which can overflow the output queue when too many files are processed at once.
  /// Keeping this at 5 prevents "could not perform self call" errors in real IC environment
  /// where parallel message processing (interleaved execution) can cause output queue overflow.
  /// Note: 10 files works in PocketIC tests but fails in dfx/mainnet due to different scheduling.
  let MAX_FILES_PER_BATCH : Nat = 5;

  /// Delay between operations in milliseconds.
  /// This gives the system time to process pending messages and prevents output queue overflow.
  let OPERATION_DELAY_MS : Nat = 100;

  type Operation = (
    Principal,
    {
      #CreateBatch;
      #UploadChunks : [Types.File];
      #CommitBatch;
    },
  );

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

  public type Store = {
    versions : Map.Map<Text, TarExtractor.Store>; // "storage-frontend@v0.1.0" → TarExtractor.Store
    region : MemoryRegion.MemoryRegion;
    queue : Queue.Queue<Operation>;
    batches : Map.Map<Principal, Nat>; // canisterId → batchId
    operations : Map.Map<Principal, Vector.Vector<HttpAssetsTypes.BatchOperationKind>>; // canisterId → operations
    statuses : Map.Map<Principal, StatusMutable>; // canisterId → status
    var timerId : ?Timer.TimerId;
  };

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      region;
      queue = Queue.empty();
      versions = Map.empty();
      batches = Map.empty();
      operations = Map.empty();
      statuses = Map.empty();
      var timerId = null;
    };
  };

  public func add<system>(store : Store, args : { versionKey : Text; hash : Blob; contentPointer : Types.SizedPointer }) : () {
    let extractor = TarExtractor.new({
      region = store.region;
      pointer = args.contentPointer;
    });
    TarExtractor.extract<system>(extractor);
    Map.add(store.versions, Text.compare, args.versionKey, extractor);
  };

  public func remove(store : Store, key : Text) : () {
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

  public func install<system>(store : Store, key : Text, targetCanisterId : Principal) : async () {
    switch (Map.get(store.versions, Text.compare, key)) {
      case (?extractor) {
        let assets = TarExtractor.getFiles(extractor);

        // Create status FIRST, before adding tasks to queue
        // This ensures status is available immediately after install call
        let status : StatusMutable = #Uploading({
          var processed = 0;
          total = assets.vals() |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);
          var processedFilesCount = 0;
          totalFilesCount = assets.size();
        });
        Map.add(store.statuses, Principal.compare, targetCanisterId, status);

        // Now add tasks to queue
        Queue.pushBack(store.queue, (targetCanisterId, #CreateBatch));
        let assetsQueue : Queue.Queue<Types.File> = assets |> Queue.fromArray(_);
        let partition : Vector.Vector<Types.File> = Vector.new();
        var collectedSize : Nat = 0;
        while (not Queue.isEmpty(assetsQueue)) {
          switch (Queue.popFront(assetsQueue)) {
            case (?asset) {
              // Check both size limit AND file count limit to prevent output queue overflow
              let shouldFlush = (collectedSize + asset.size > MAX_INTEROP_CHUNKS_SIZE or Vector.size(partition) >= MAX_FILES_PER_BATCH)
                and Vector.size(partition) > 0;

              if (shouldFlush) {
                Queue.pushBack(store.queue, (targetCanisterId, #UploadChunks(Vector.toArray(partition))));
                Vector.clear(partition);
                collectedSize := 0;
              };

              Vector.add(partition, asset);
              collectedSize += asset.size;
            };
            case null {};
          };
        };
        if (Vector.size(partition) > 0) {
          Queue.pushBack(store.queue, (targetCanisterId, #UploadChunks(Vector.toArray(partition))));
        };
        Queue.pushBack(store.queue, (targetCanisterId, #CommitBatch));
        await run<system>(store);
      };
      case null {
        // Version not found - set failed status
        let status = #Failed("Version not found: " # key);
        ignore Map.insert(store.statuses, Principal.compare, targetCanisterId, status);
      };
    };
  };

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

  public func run<system>(store : Store) : async () {
    if (Option.isNull(store.timerId)) {
      await runProcessor<system>(store);
    };
  };

  public func cancel<system>(store : Store) : () {
    switch (store.timerId) {
      case (?id) {
        Timer.cancelTimer(id);
        store.timerId := null;
      };
      case null {};
    };
  };

  public func runProcessor<system>(store : Store) : async () {
    switch (Queue.popFront(store.queue)) {
      case (?(canisterId, operation)) {
        // Get status - if not found, set failed status and skip this operation
        let status = switch (Map.get(store.statuses, Principal.compare, canisterId)) {
          case (?s) s;
          case null {
            // Status should exist, but if it doesn't, create failed status
            let failedStatus : StatusMutable = #Failed("Status not found for canister");
            ignore Map.insert(store.statuses, Principal.compare, canisterId, failedStatus);
            return;
          };
        };

        let assetsCanister = actor (Principal.toText(canisterId)) : HttpAssetsTypes.AssetsInterface;

        try {
          switch (operation) {
            case (#CreateBatch) {
              let { batch_id } = await assetsCanister.create_batch({});
              ignore Map.insert(store.batches, Principal.compare, canisterId, batch_id);
            };
            case (#UploadChunks(assets)) {
              let ?batchId = Map.get(store.batches, Principal.compare, canisterId) else return;
              let { chunk_ids } = await assetsCanister.create_chunks({
                batch_id = batchId;
                content = assets.vals() |> Iter.map(_, func({ content }) = content) |> Iter.toArray(_);
              });
              switch (status) {
                case (#Uploading(uploading)) {
                  uploading.processed += assets.vals() |> Iter.foldLeft(_, 0, func(total, { size }) = total + size);
                  uploading.processedFilesCount += assets.size();
                };
                case _ {};
              };
              let operations = Iter.zip(assets.vals(), chunk_ids.vals()) |> Iter.flatMap<(Types.File, Nat), HttpAssetsTypes.BatchOperationKind>(
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
            };
            case (#CommitBatch) {
              let ?batchId = Map.get(store.batches, Principal.compare, canisterId) else return;
              let ?operations = Map.get(store.operations, Principal.compare, canisterId) else return;
              ignore Map.insert(store.statuses, Principal.compare, canisterId, #Committing);
              await assetsCanister.commit_batch({
                batch_id = batchId;
                operations = Vector.toArray(operations);
              });
              ignore Map.insert(store.statuses, Principal.compare, canisterId, #Completed);
              Map.remove(store.operations, Principal.compare, canisterId);
              Map.remove(store.batches, Principal.compare, canisterId);
            };
          };

          // Schedule next iteration with delay to prevent output queue overflow
          store.timerId := ?Timer.setTimer<system>(#milliseconds OPERATION_DELAY_MS, func() : async () { await runProcessor<system>(store) });
        } catch (error) {
          let errorMsg = Error.message(error);
          ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errorMsg));
          // Don't schedule next iteration - stop processing for this canister
          store.timerId := null;
        };
      };
      case null {
        cancel<system>(store);
      };
    };
  };
};
