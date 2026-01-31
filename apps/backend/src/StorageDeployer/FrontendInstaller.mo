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

  let MAX_INTEROP_CHUNKS_SIZE : Nat = 2_000_000; // 2MB

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
              if (collectedSize + asset.size > MAX_INTEROP_CHUNKS_SIZE and Vector.size(partition) > 0) {
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
                for (operation in operations.vals()) {
                  Vector.add(vector, operation);
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
            try {
              ignore Map.insert(store.statuses, Principal.compare, canisterId, #Committing);
              await assetsCanister.commit_batch({
                batch_id = batchId;
                operations = Vector.toArray(operations);
              });
              ignore Map.insert(store.statuses, Principal.compare, canisterId, #Completed);
              Map.remove(store.operations, Principal.compare, canisterId);
              Map.remove(store.batches, Principal.compare, canisterId);
            } catch (error) {
              ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(Error.message(error)));
            };
          };
        };
        store.timerId := ?Timer.setTimer<system>(#milliseconds 0, func() : async () { await runProcessor<system>(store) });
      };
      case null {
        cancel<system>(store);
      };
    };
  };
};
