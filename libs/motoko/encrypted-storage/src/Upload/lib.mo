/// The upload module is responsible for managing data that is uploaded but not yet committed to the canister.

import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import IC "mo:core/InternetComputer";
import VarArray "mo:core/VarArray";

import Map "mo:map/Map";
import Vector "mo:vector";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";

import T "../Types";
import Const "../Const";
import ErrorMessages "../ErrorMessages";

module {
  public type Store = T.UploadStore;
  public type BatchHash = {
    hash : Blob;
    bytes : Nat;
    chunkCount : Nat;
    hashInstructions : Nat;
  };
  public type ActiveSession = {
    batchId : T.BatchId;
    owner : Principal;
    declaredBytes : Nat;
    uploadedBytes : Nat;
    uploadedChunkCount : Nat;
    remainingBytes : Nat;
    expiresAt : Time.Time;
  };
  let { nhash } = Map;

  func initialHashState() : Sha256.StaticSha256 {
    let sha256 = Sha256.Digest(#sha256);
    sha256.share();
  };

  func advanceHashState(state : Sha256.StaticSha256, content : Blob) : (Sha256.StaticSha256, Nat) {
    let sha256 = Sha256.Digest(#sha256);
    sha256.unshare(state);
    let instructions = Nat64.toNat(IC.countInstructions(func() {
      sha256.writeBlob(content);
    }));
    (sha256.share(), instructions);
  };

  func finalizeHashState(state : Sha256.StaticSha256) : Blob {
    let sha256 = Sha256.Digest(#sha256);
    sha256.unshare(state);
    sha256.sum();
  };

  func firstMissingChunkIndex(batch : T.Batch) : ?Nat {
    var index = 0;
    while (index < batch.expectedChunkCount) {
      if (batch.chunkIdsByIndex[index] == null) return ?index;
      index += 1;
    };
    null;
  };

  func orderedUploadedChunkIds(batch : T.Batch) : [T.ChunkId] {
    let ordered = Vector.new<T.ChunkId>();
    var index = 0;
    while (index < batch.expectedChunkCount) {
      switch (batch.chunkIdsByIndex[index]) {
        case (?chunkId) Vector.add(ordered, chunkId);
        case null {};
      };
      index += 1;
    };
    Vector.toArray(ordered);
  };

  func advanceHashPrefix(self : Store, batch : T.Batch) {
    var advancedBytes = 0;
    var advancedChunks = 0;
    while (batch.nextHashChunkIndex < batch.expectedChunkCount) {
      let chunkId = switch (batch.chunkIdsByIndex[batch.nextHashChunkIndex]) {
        case (?value) value;
        case null return;
      };
      let ?storedChunk = Map.get(self.chunks, nhash, chunkId) else return;
      let contentSize = storedChunk.pointer.1;
      if (
        advancedChunks > 0 and
        advancedBytes + contentSize > Const.MAX_HASHING_BYTES_PER_CALL
      ) return;

      let content = MemoryRegion.loadBlob(self.region, storedChunk.pointer.0, contentSize);
      let (nextHashState, hashInstructions) = advanceHashState(batch.hashState, content);
      batch.hashState := nextHashState;
      batch.hashedBytes += contentSize;
      batch.hashedChunkCount += 1;
      batch.hashInstructions += hashInstructions;
      batch.nextHashChunkIndex += 1;
      advancedBytes += contentSize;
      advancedChunks += 1;
    };
  };

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

  public func activeDeclaredBytes(self : Store) : Nat {
    var total = 0;
    for ((_, batch) in Map.entries(self.batches)) {
      total += batch.declaredTotalBytes;
    };
    total;
  };

  public func activeUploadedBytes(self : Store) : Nat {
    var total = 0;
    for ((_, batch) in Map.entries(self.batches)) {
      total += batch.totalBytes;
    };
    total;
  };

  public func activeUploadedChunkCount(self : Store) : Nat {
    var total = 0;
    for ((_, batch) in Map.entries(self.batches)) {
      total += Vector.size(batch.chunkIds);
    };
    total;
  };

  public func activeSessions(self : Store) : [ActiveSession] {
    let sessions = Vector.new<ActiveSession>();
    for ((batchId, batch) in Map.entries(self.batches)) {
      Vector.add(sessions, {
        batchId;
        owner = batch.owner;
        declaredBytes = batch.declaredTotalBytes;
        uploadedBytes = batch.totalBytes;
        uploadedChunkCount = Vector.size(batch.chunkIds);
        remainingBytes = if (batch.declaredTotalBytes > batch.totalBytes) {
          Nat.sub(batch.declaredTotalBytes, batch.totalBytes);
        } else {
          0;
        };
        expiresAt = batch.expiresAt;
      });
    };
    Vector.toArray(sessions);
  };

  public func getBatchStatus(self : Store, batchId : Nat) : ?T.UploadSessionStatus {
    let ?batch = Map.get(self.batches, nhash, batchId) else return null;
    ?{
      batchId;
      owner = batch.owner;
      declaredUploadBytes = batch.declaredTotalBytes;
      uploadedBytes = batch.totalBytes;
      expiresAt = batch.expiresAt;
      chunkIds = orderedUploadedChunkIds(batch);
    };
  };

  public func createBatch(self : Store, caller : Principal, declaredTotalBytes : Nat, expectedChunkCount : Nat) : Result.Result<T.CreateBatchResponse, Text> {
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

    switch (self.configuration.maxBytes) {
      case (?maxBytes) {
        let activeReserved = activeDeclaredBytes(self);
        let requestedReserved = activeReserved + declaredTotalBytes;
        if (Nat64.fromNat(requestedReserved) > maxBytes) {
          return #err(
            "Maximum number of reserved upload bytes reached. Reserved " #
            Nat.toText(activeReserved) #
            " bytes, trying to reserve " #
            Nat.toText(declaredTotalBytes) #
            " bytes, maximum " #
            Nat64.toText(maxBytes) #
            " bytes."
          );
        };
      };
      case (_) {};
    };

    let batchId = self.nextBatchId;
    self.nextBatchId += 1;

    let batch : T.Batch = {
      owner = caller;
      var expiresAt = now + Const.BATCH_EXPIRY_DURATION;
      declaredTotalBytes;
      var totalBytes = 0;
      var hashState = initialHashState();
      var hashedBytes = 0;
      var hashedChunkCount = 0;
      var hashInstructions = 0;
      var nextHashChunkIndex = 0;
      expectedChunkCount;
      chunkIds = Vector.new();
      chunkIdsByIndex = VarArray.repeat<?T.ChunkId>(null, expectedChunkCount);
    };

    ignore Map.put(self.batches, nhash, batchId, batch);

    #ok({ batchId });
  };

  public func batchAlive(self : Store, batchId : Nat) : Result.Result<(), Text> {
    let ?batch = Map.get(self.batches, nhash, batchId) else return #err(ErrorMessages.batchNotFound(batchId));
    batch.expiresAt := Time.now() + Const.BATCH_EXPIRY_DURATION;
    #ok;
  };

  public func createChunk(self : Store, caller : Principal, args : T.Chunk) : Result.Result<T.CreateChunkResponse, Text> {
    switch (self.configuration.maxChunks) {
      case (?maxChunks) {
        if (Nat64.fromNat(Map.size(self.chunks)) >= maxChunks) {
          return #err("Maximum number of chunks reached.");
        };
      };
      case (_) {};
    };

    let ?batch = Map.get(self.batches, nhash, args.batchId) else return #err(ErrorMessages.batchNotFound(args.batchId));
    if (not Principal.equal(batch.owner, caller)) {
      return #err("Batch " # Nat.toText(args.batchId) # " does not belong to caller");
    };
    let contentSize = args.content.size();

    let chunkIndex = switch (args.chunkIndex) {
      case (?value) value;
      case null {
        switch (firstMissingChunkIndex(batch)) {
          case (?value) value;
          case null return #err("Invalid upload: batch " # Nat.toText(args.batchId) # " already has all expected chunks.");
        };
      };
    };
    if (chunkIndex >= batch.expectedChunkCount) {
      return #err(
        "Invalid upload: chunk index " #
        Nat.toText(chunkIndex) #
        " is out of bounds for batch " #
        Nat.toText(args.batchId) #
        " with " #
        Nat.toText(batch.expectedChunkCount) #
        " expected chunks."
      );
    };

    switch (batch.chunkIdsByIndex[chunkIndex]) {
      case (?chunkId) {
        let ?storedChunk = Map.get(self.chunks, nhash, chunkId) else {
          return #err(ErrorMessages.chunkNotFound(chunkId));
        };
        let existing = MemoryRegion.loadBlob(self.region, storedChunk.pointer.0, storedChunk.pointer.1);
        if (not Blob.equal(existing, args.content)) {
          return #err("Invalid upload: chunk index " # Nat.toText(chunkIndex) # " was already uploaded with different content.");
        };
        advanceHashPrefix(self, batch);
        batch.expiresAt := Time.now() + Const.BATCH_EXPIRY_DURATION;
        return #ok({ chunkId });
      };
      case null {};
    };

    if (batch.totalBytes + contentSize > batch.declaredTotalBytes) {
      return #err(
        "Invalid upload: chunk exceeds declared batch size. Declared " #
        Nat.toText(batch.declaredTotalBytes) #
        " bytes, already uploaded " #
        Nat.toText(batch.totalBytes) #
        " bytes, trying to add " #
        Nat.toText(contentSize) #
        " bytes."
      );
    };

    switch (self.configuration.maxBytes) {
      case (?maxBytes) {
        let activeUploaded = activeUploadedBytes(self);
        let activeUploadedPlusNewChunk = activeUploaded + contentSize;
        if (Nat64.fromNat(activeUploadedPlusNewChunk) > maxBytes) {
          return #err("Maximum number of uploaded staging bytes reached. Can only add " # Nat64.toText(maxBytes - Nat64.fromNat(activeUploaded)) # " more bytes but trying to add " # Nat.toText(args.content.size()));
        };
      };
      case (_) {};
    };

    let chunkId = self.nextChunkId;
    self.nextChunkId += 1;

    let chunkAddress = MemoryRegion.addBlob(self.region, args.content);

    let chunk : T.StoredChunk = {
      batchId = args.batchId;
      pointer = (chunkAddress, contentSize);
      chunkIndex;
    };

    ignore Map.put(self.chunks, nhash, chunkId, chunk);
    batch.expiresAt := Time.now() + Const.BATCH_EXPIRY_DURATION;
    batch.totalBytes += contentSize;
    batch.chunkIdsByIndex[chunkIndex] := ?chunkId;
    Vector.add(batch.chunkIds, chunkId);
    advanceHashPrefix(self, batch);

    #ok({ chunkId });
  };

  public func getChunk(self : Store, chunkId : T.ChunkId) : ?T.StoredChunk {
    Map.get<Nat, T.StoredChunk>(self.chunks, nhash, chunkId);
  };

  public func getChunkPointer(self : Store, chunkId : T.ChunkId) : ?(Nat, Nat) {
    let ?chunk = getChunk(self, chunkId) else return null;
    ?chunk.pointer;
  };

  public func getPointersForChunkIds(self : Store, batchId : T.BatchId, orderedChunkIds : [T.ChunkId]) : Result.Result<[T.SizedPointer], Text> {
    let ?batch = Map.get(self.batches, nhash, batchId) else return #err(ErrorMessages.batchNotFound(batchId));
    if (orderedChunkIds.size() != batch.expectedChunkCount) {
      return #err(
        "Invalid upload: expected " #
        Nat.toText(batch.expectedChunkCount) #
        " chunks for batch " #
        Nat.toText(batchId) #
        " but got " #
        Nat.toText(orderedChunkIds.size()) #
        "."
      );
    };

    let pointers = Vector.new<T.SizedPointer>();

    var chunkIndex = 0;
    for (chunkId in orderedChunkIds.vals()) {
      let expectedChunkId = switch (batch.chunkIdsByIndex[chunkIndex]) {
        case (?value) value;
        case null return #err(
          "Invalid upload: missing chunk at index " #
          Nat.toText(chunkIndex) #
          " for batch " #
          Nat.toText(batchId) #
          "."
        );
      };
      if (chunkId != expectedChunkId) {
        return #err(
          "Invalid upload: chunk " #
          Nat.toText(chunkId) #
          " is out of order for batch " #
          Nat.toText(batchId) #
          ". Expected chunk " #
          Nat.toText(expectedChunkId) #
          " at index " #
          Nat.toText(chunkIndex) #
          "."
        );
      };

      let ?chunk = Map.get(self.chunks, nhash, chunkId) else return #err("Chunk with id " # Nat.toText(chunkId) # " not found.");
      if (chunk.batchId != batchId) {
        return #err("Invalid upload: chunk " # Nat.toText(chunkId) # " does not belong to batch " # Nat.toText(batchId) # ".");
      };
      if (chunk.chunkIndex != chunkIndex) {
        return #err("Invalid upload: chunk " # Nat.toText(chunkId) # " belongs to index " # Nat.toText(chunk.chunkIndex) # " but was provided at index " # Nat.toText(chunkIndex) # ".");
      };
      Vector.add(pointers, chunk.pointer);
      chunkIndex += 1;
    };

    #ok(Vector.toArray(pointers));
  };

  public func getBatchHash(self : Store, batchId : T.BatchId) : Result.Result<BatchHash, Text> {
    let ?batch = Map.get(self.batches, nhash, batchId) else return #err(ErrorMessages.batchNotFound(batchId));
    advanceHashPrefix(self, batch);
    if (batch.hashedChunkCount != batch.expectedChunkCount) {
      return #err("Invalid upload: hash state covers " # Nat.toText(batch.hashedChunkCount) # " chunks but batch expects " # Nat.toText(batch.expectedChunkCount) # " chunks.");
    };
    if (batch.hashedBytes != batch.totalBytes) {
      return #err("Invalid upload: hash state covers " # Nat.toText(batch.hashedBytes) # " bytes but batch has " # Nat.toText(batch.totalBytes) # " bytes.");
    };
    #ok({
      hash = finalizeHashState(batch.hashState);
      bytes = batch.hashedBytes;
      chunkCount = batch.hashedChunkCount;
      hashInstructions = batch.hashInstructions;
    });
  };

  public func forgetBatch(self : Store, batchId : T.BatchId) : ?T.Batch {
    let ?batch = Map.remove(self.batches, nhash, batchId) else return null;
    for (chunkId in Vector.vals(batch.chunkIds)) {
      ignore Map.remove(self.chunks, nhash, chunkId);
    };
    ?batch;
  };
};
