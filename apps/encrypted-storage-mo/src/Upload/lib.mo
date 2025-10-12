/// The upload module is responsible for managing data that is uploaded but not yet committed to the canister.

import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";

import Map "mo:map/Map";
import Vector "mo:vector";
import MemoryRegion "mo:memory-region/MemoryRegion";

import T "../Types";
import Const "../Const";
import ErrorMessages "../ErrorMessages";

module {
  public type Store = T.UploadStore;
  let { nhash } = Map;

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      batches = Map.new();
      var nextBatchId = 0;

      chunks = Map.new();
      region;
      var nextChunkId = 0;

      configuration = {
        var maxBatches = null;
        var maxChunks = null;
        var maxBytes = null;
      };
    };
  };

  public func clear(self : Store) {

    // !don't clear entire region (MemoryRegion.clear(region)) because it's shared with other modules

    self.nextBatchId := 0;
    self.nextChunkId := 0;

    // clearing batches releases the memory allocated for chunks
    for (batchId in Map.keys(self.batches)) {
      ignore removeBatch(self, batchId);
    };

    // clear configuration
    self.configuration.maxBatches := null;
    self.configuration.maxChunks := null;
    self.configuration.maxBytes := null;

  };

  public func getConfiguration(self : Store) : T.ConfigurationResponse {
    let config : T.ConfigurationResponse = {
      maxBatches = self.configuration.maxBatches;
      maxChunks = self.configuration.maxChunks;
      maxBytes = self.configuration.maxBytes;
    };

    config;
  };

  public func setMaxBatches(self : Store, maxBatches : ?Nat64) {
    self.configuration.maxBatches := maxBatches;
  };

  public func setMaxChunks(self : Store, maxChunks : ?Nat64) {
    self.configuration.maxChunks := maxChunks;
  };

  public func setMaxBytes(self : Store, maxBytes : ?Nat64) {
    self.configuration.maxBytes := maxBytes;
  };

  func deallocateChunk(self : Store, chunkId : T.ChunkId) : ?T.StoredChunk {
    let ?chunk = Map.remove(self.chunks, nhash, chunkId) else return null;
    MemoryRegion.deallocate(self.region, chunk.pointer.0, chunk.pointer.1);
    ?chunk;
  };

  func deallocateBatchChunks(self : Store, batch : T.Batch) {
    for (chunkId in Vector.vals(batch.chunkIds)) {
      ignore deallocateChunk(self, chunkId);
    };
  };

  public func removeBatch(self : Store, batchId : Nat) : ?T.Batch {
    let ?batch = Map.remove(self.batches, nhash, batchId) else return null;
    deallocateBatchChunks(self, batch);
    ?batch;
  };

  public func getBatch(self : Store, batchId : Nat) : ?T.Batch {
    Map.get(self.batches, nhash, batchId);
  };

  public func createBatch(self : Store) : Result.Result<T.CreateBatchResponse, Text> {
    let now = Time.now();

    for ((batchId, batch) in Map.entries(self.batches)) {
      // remove expired batches
      if (batch.expiresAt < now) {
        ignore removeBatch(self, batchId);
      };
    };

    switch (self.configuration.maxBatches) {
      case (?maxBatches) {
        if (Nat64.fromNat(Map.size(self.batches)) >= maxBatches) {
          return #err("Maximum number of batches reached.");
        };
      };
      case (_) {};
    };

    let batchId = self.nextBatchId;
    self.nextBatchId += 1;

    let batch : T.Batch = {
      var expiresAt = now + Const.BATCH_EXPIRY_DURATION;
      var totalBytes = 0;
      chunkIds = Vector.new();
    };

    ignore Map.put(self.batches, nhash, batchId, batch);

    #ok({ batchId });
  };

  public func batchAlive(self : Store, batchId : Nat) : Result.Result<(), Text> {
    let ?batch = Map.get(self.batches, nhash, batchId) else return #err(ErrorMessages.batchNotFound(batchId));
    batch.expiresAt := Time.now() + Const.BATCH_EXPIRY_DURATION;
    #ok;
  };

  public func createChunk(self : Store, args : T.Chunk) : Result.Result<T.CreateChunkResponse, Text> {
    switch (self.configuration.maxChunks) {
      case (?maxChunks) {
        if (Nat64.fromNat(Map.size(self.chunks)) >= maxChunks) {
          return #err("Maximum number of chunks reached.");
        };
      };
      case (_) {};
    };

    let ?batch = Map.get(self.batches, nhash, args.batchId) else return #err(ErrorMessages.batchNotFound(args.batchId));
    let contentSize = args.content.size();

    let totalBytesPlusNewChunk = Nat64.fromNat(batch.totalBytes) + Nat64.fromNat(contentSize);

    switch (self.configuration.maxBytes) {
      case (?max_bytes) if (totalBytesPlusNewChunk > max_bytes) {
        return #err("Maximum number of bytes reached. Can only add " # debug_show (max_bytes - Nat64.fromNat(batch.totalBytes)) # " more bytes but trying to add " # debug_show args.content.size());
      };
      case (_) {};
    };

    let chunkId = self.nextChunkId;
    self.nextChunkId += 1;

    let chunkAddress = MemoryRegion.addBlob(self.region, args.content);

    let chunk : T.StoredChunk = {
      batchId = args.batchId;
      pointer = (chunkAddress, contentSize);
    };

    ignore Map.put(self.chunks, nhash, chunkId, chunk);
    batch.expiresAt := Time.now() + Const.BATCH_EXPIRY_DURATION;
    batch.totalBytes += contentSize;
    Vector.add(batch.chunkIds, chunkId);

    #ok({ chunkId });
  };

  public func getChunk(self : Store, chunkId : T.ChunkId) : ?T.StoredChunk {
    Map.get<Nat, T.StoredChunk>(self.chunks, nhash, chunkId);
  };

  public func getChunkPointer(self : Store, chunkId : T.ChunkId) : ?(Nat, Nat) {
    let ?chunk = getChunk(self, chunkId) else return null;
    ?chunk.pointer;
  };
};
