import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Map "mo:map/Map";

import Certification "../Certification";
import Const "../Const";
import ErrorMessages "../ErrorMessages";
import File "../FileSystem/File";
import FileSystem "../FileSystem";
import Permissions "../FileSystem/Permissions";
import StorageAccounting "../StorageAccounting";
import T "../Types";
import Upload "../Upload";
import Utils "../Utils";
import Staging "Staging";

module {
  public type CommitMeasurement = {
    bytes : Nat;
    chunkCount : Nat;
    hashRoundCount : Nat;
    hashInstructions : Nat;
  };

  public type FundingGates = {
    onFileStorage : ?(Nat -> Result.Result<(), Text>);
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>);
  };

  public type BeginHooks = {
    onFileStorage : ?(Nat -> Result.Result<(), Text>);
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>);
    createTarget : (T.CreateArguments) -> Result.Result<T.NodeDetails, Text>;
  };

  public type ValidateUploadShapeArguments = {
    totalSize : Nat;
    expectedChunkCount : ?Nat;
    declaredUploadBytes : ?Nat;
  };

  public type UploadShape = {
    chunkCount : Nat;
    declaredUploadBytes : Nat;
    maxUploadBytes : Nat;
  };

  public type BeginArguments = {
    request : T.BeginUploadSessionArguments;
    hooks : BeginHooks;
  };

  public type BatchArguments = {
    batchId : T.BatchId;
  };

  type CommitToNodeArguments = {
    batchId : T.BatchId;
    nodeKey : T.NodeKey;
    node : T.NodeStore;
    chunkIds : [T.ChunkId];
    sha256 : ?Blob;
    contentType : Text;
    gates : FundingGates;
  };

  public type FinishArguments = {
    request : T.FinishUploadSessionArguments;
    gates : FundingGates;
  };

  type StorageLimitCheckArguments = {
    additionalBytes : Nat;
    gates : FundingGates;
  };

  public func validateUploadShape(args : ValidateUploadShapeArguments) : Result.Result<UploadShape, Text> {
    let { totalSize; expectedChunkCount; declaredUploadBytes } = args;
    let minimumChunkCount = if (totalSize == 0) 1 else (totalSize + Const.ONCHAIN_UPLOAD_CHUNK_SIZE - 1) / Const.ONCHAIN_UPLOAD_CHUNK_SIZE;
    let chunkCount = Option.get(expectedChunkCount, minimumChunkCount);
    if (chunkCount < minimumChunkCount) {
      return #err(
        "Invalid upload: expected chunk count " #
        Nat.toText(chunkCount) #
        " is too low for source size " #
        Nat.toText(totalSize) #
        " bytes. Minimum expected chunks " #
        Nat.toText(minimumChunkCount) #
        "."
      );
    };

    let maxUploadBytes = totalSize + (chunkCount * Const.ENCRYPTED_CHUNK_OVERHEAD_BYTES);
    let declared = Option.get(declaredUploadBytes, maxUploadBytes);
    if (declared > maxUploadBytes) {
      return #err(
        "Invalid upload: declared upload size exceeds allowed size. Declared " #
        Nat.toText(declared) #
        " bytes, source size " #
        Nat.toText(totalSize) #
        " bytes, maximum allowed stored size " #
        Nat.toText(maxUploadBytes) #
        " bytes."
      );
    };

    #ok({
      chunkCount;
      declaredUploadBytes = declared;
      maxUploadBytes;
    });
  };

  func refreshSubscriptionStatus(
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<(), Text> {
    switch (onSubscriptionRefresh) {
      case (?refresh) switch (await* refresh()) {
        case (#err msg) #err msg;
        case (#ok _) #ok;
      };
      case null #ok;
    };
  };

  func checkStorageLimit(
    { additionalBytes; gates } : StorageLimitCheckArguments,
  ) : async* Result.Result<(), Text> {
    switch (await* refreshSubscriptionStatus(gates.onSubscriptionRefresh)) {
      case (#err msg) return #err msg;
      case (#ok) {};
    };

    switch (gates.onFileStorage) {
      case (?check) switch (check(additionalBytes)) {
        case (#err msg) #err msg;
        case (#ok) #ok;
      };
      case null #ok;
    };
  };

  public func begin(
    self : T.StableStore,
    caller : Principal,
    args : BeginArguments,
  ) : async* Result.Result<T.BeginUploadSessionResponse, Text> {
    let request = args.request;
    let hooks = args.hooks;

    let (#File, _) = request.entry else return #err("Upload sessions can only target files");
    Staging.cleanupExpired(self);

    let existingNodeKey = Staging.entryToNodeKey(self.fs, { entry = request.entry });
    switch (existingNodeKey) {
      case (?nodeKey) switch (Map.get(self.staging, Utils.hashNodes, nodeKey)) {
        case (?staging) switch (staging.batchId) {
          case (?batchId) switch (Upload.getBatch(self.upload, batchId)) {
            case (?batch) {
              if (not Principal.equal(batch.owner, caller)) {
                return #err("Upload already in progress for this file.");
              };
              let shape = switch (validateUploadShape({
                totalSize = request.totalSize;
                expectedChunkCount = request.expectedChunkCount;
                declaredUploadBytes = request.declaredUploadBytes;
              })) {
                case (#ok(value)) value;
                case (#err(message)) return #err(message);
              };
              if (
                batch.declaredTotalBytes == shape.declaredUploadBytes and
                batch.expectedChunkCount == shape.chunkCount
              ) {
                return #ok({
                  batchId;
                  node = FileSystem.getDetails(self.fs, self.storageBackendType, staging.node);
                });
              };
              return #err("Upload already in progress for this file.");
            };
            case null {};
          };
          case null {};
        };
        case null {};
      };
      case null {};
    };

    let nodeDetails = switch (hooks.createTarget({
      entry = request.entry;
      createMode = request.createMode;
    })) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    let nodeKey : T.NodeKey = (#File, nodeDetails.parentId, nodeDetails.name);
    let ?node = Map.get(self.fs.nodes, Utils.hashNodes, nodeKey) else {
      return #err("Upload session target not found after create.");
    };
    switch (await* checkStorageLimit({
      additionalBytes = request.totalSize;
      gates = hooks;
    })) {
      case (#err msg) {
        Staging.removeNodeIfUncommitted(self, { nodeKey; node });
        return #err msg;
      };
      case (#ok) {};
    };

    let shape = switch (validateUploadShape({
      totalSize = request.totalSize;
      expectedChunkCount = request.expectedChunkCount;
      declaredUploadBytes = request.declaredUploadBytes;
    })) {
      case (#ok(value)) value;
      case (#err(message)) {
        Staging.removeNodeIfUncommitted(self, { nodeKey; node });
        return #err(message);
      };
    };

    let batch = switch (Upload.reserveBatch(self.upload, caller, shape.declaredUploadBytes, shape.chunkCount)) {
      case (#ok(value)) value;
      case (#err(message)) {
        Staging.removeNodeIfUncommitted(self, { nodeKey; node });
        return #err(message);
      };
    };

    Staging.putBatchTarget(self, {
      nodeKey;
      node;
      batchId = batch.batchId;
    });

    #ok({
      batchId = batch.batchId;
      node = FileSystem.getDetails(self.fs, self.storageBackendType, node);
    });
  };

  public func get(self : T.StableStore, caller : Principal, args : BatchArguments) : Result.Result<T.UploadSessionStatus, Text> {
    let batchId = args.batchId;
    let ?status = Upload.getBatchStatus(self.upload, batchId) else return #err(ErrorMessages.batchNotFound(batchId));
    if (not Principal.equal(status.owner, caller)) {
      return #err("Batch " # Nat.toText(batchId) # " does not belong to caller");
    };
    #ok status;
  };

  func commitToNode(
    self : T.StableStore,
    caller : Principal,
    args : CommitToNodeArguments,
  ) : async* Result.Result<CommitMeasurement, Text> {
    let { batchId; nodeKey; node; chunkIds; sha256; contentType; gates } = args;
    let ?liveNode = Map.get(self.fs.nodes, Utils.hashNodes, nodeKey) else {
      return #err("Upload session target was deleted before commit.");
    };
    if (liveNode.id != node.id) {
      return #err("Upload session target changed before commit.");
    };

    switch (Permissions.ensureUserCanWrite(self.fs, caller, #keyId(liveNode.keyId))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let #File(file) = liveNode.metadata else return #err("Upload session target is not a file.");

    let ?batch = Upload.getBatch(self.upload, batchId) else return #err(ErrorMessages.batchNotFound(batchId));
    if (not Principal.equal(batch.owner, caller)) {
      return #err("Batch " # Nat.toText(batchId) # " does not belong to caller");
    };
    if (batch.totalBytes != batch.declaredTotalBytes) {
      return #err(
        "Invalid upload: batch " #
        Nat.toText(batchId) #
        " has " #
        Nat.toText(batch.totalBytes) #
        " bytes uploaded but declared " #
        Nat.toText(batch.declaredTotalBytes) #
        " bytes."
      );
    };

    let chunkPointers = switch (Upload.getPointersForChunkIds(self.upload, batchId, chunkIds)) {
      case (#ok(value)) value;
      case (#err(message)) return #err message;
    };

    var totalLength = 0;
    for ((_, size) in chunkPointers.vals()) {
      totalLength += size;
    };

    switch (await* refreshSubscriptionStatus(gates.onSubscriptionRefresh)) {
      case (#err msg) return #err msg;
      case (#ok) {};
    };

    let hashResult = switch (Upload.getBatchHash(self.upload, batchId)) {
      case (#ok(value)) value;
      case (#err(msg)) return #err("Failed to finalize upload hash: " # msg);
    };
    let hash = hashResult.hash;

    switch (sha256) {
      case (?providedHash) {
        if (hash != providedHash) {
          return #err(ErrorMessages.sha256HashMismatch(providedHash, hash));
        };
      };
      case null {};
    };

    switch (File.getCurrentVersion(file)) {
      case (?prevVer) Certification.decertifyBlobInfo(self, {
        keyId = liveNode.keyId;
        version = prevVer;
      });
      case null {};
    };

    let contentRefs = Array.map<T.SizedPointer, T.ContentRef>(
      chunkPointers,
      func(address : Nat, size : Nat) : T.ContentRef = #OnChain(address, size),
    );

    let storedBytesBefore = StorageAccounting.fileStoredBytes(file);
    File.addVersionRefs(self.fs, file, contentRefs, totalLength, hash, contentType);
    Certification.certifyContentHash(self, {
      keyId = liveNode.keyId;
      hash;
    });
    ignore Upload.forgetBatch(self.upload, batchId);

    StorageAccounting.applyStoredBytesDelta(self, {
      file;
      beforeBytes = storedBytesBefore;
    });

    Staging.removeByNodeKey(self, { nodeKey });
    #ok({
      bytes = hashResult.bytes;
      chunkCount = hashResult.chunkCount;
      hashRoundCount = hashResult.chunkCount;
      hashInstructions = hashResult.hashInstructions;
    });
  };

  public func finish(
    self : T.StableStore,
    caller : Principal,
    args : FinishArguments,
  ) : async* Result.Result<CommitMeasurement, Text> {
    let request = args.request;
    let gates = args.gates;
    let status = switch (get(self, caller, { batchId = request.batchId })) {
      case (#ok(value)) value;
      case (#err(message)) return #err message;
    };
    let (nodeKey, staging) = switch (Staging.findByBatchId(self, { batchId = request.batchId })) {
      case (?value) value;
      case null return #err("Upload session target not found for batch " # Nat.toText(request.batchId) # ".");
    };
    switch (await* commitToNode(
      self,
      caller,
      {
        batchId = request.batchId;
        nodeKey;
        node = staging.node;
        chunkIds = status.chunkIds;
        sha256 = request.sha256;
        contentType = request.contentType;
        gates;
      },
    )) {
      case (#ok(measurement)) {
        if (status.chunkIds.size() == 0) {
          ignore Upload.forgetBatch(self.upload, request.batchId);
        };
        #ok(measurement);
      };
      case (#err(message)) #err(message);
    };
  };

  public func rollback(self : T.StableStore, caller : Principal, args : BatchArguments) : Result.Result<(), Text> {
    let batchId = args.batchId;
    let ?batch = Upload.getBatch(self.upload, batchId) else return #ok;
    if (not Principal.equal(batch.owner, caller)) {
      return #err("Batch " # Nat.toText(batchId) # " does not belong to caller");
    };

    ignore Upload.removeBatch(self.upload, batchId);
    Staging.removeBatchTargets(self, { batchId });
    #ok;
  };

  public func abort(self : T.StableStore, caller : Principal, args : BatchArguments) : Result.Result<(), Text> {
    rollback(self, caller, args);
  };

  public func activeUploadSessionCount(self : T.StableStore) : Nat {
    var count = 0;
    for ((_, staging) in Map.entries(self.staging)) {
      switch (staging.batchId) {
        case (?batchId) switch (Upload.getBatch(self.upload, batchId)) {
          case (?_) count += 1;
          case null {};
        };
        case null {};
      };
    };
    count;
  };
};
