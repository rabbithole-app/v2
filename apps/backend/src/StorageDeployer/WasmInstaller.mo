import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Error "mo:core/Error";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";

import IC "mo:ic";
import Vector "mo:vector";

import Types "Types";

module WasmInstaller {
  // Chunk size limit according to IC spec (1 MiB)
  // https://docs.internetcomputer.org/references/execution-errors#wasm-chunk-store-error
  public let CHUNK_SIZE : Nat = 1_048_576;

  // Threshold for using chunked installation (2 MB)
  public let CHUNKED_THRESHOLD : Nat = 2_000_000;

  public type Status = {
    #Pending;
    #UploadingChunks : { uploaded : Nat; total : Nat };
    #Installing;
    #Completed;
    #Failed : Text;
  };

  type StatusMutable = {
    #Pending;
    #UploadingChunks : { var uploaded : Nat; total : Nat };
    #Installing;
    #Completed;
    #Failed : Text;
  };

  public type InstallTask = {
    targetCanister : Principal;
    wasmModule : Blob;
    wasmHash : Blob;
    mode : IC.CanisterInstallMode;
    initArg : Blob;
  };

  /// Store for WASM installation state (passive - no timer)
  public type Store = {
    statuses : Map.Map<Principal, StatusMutable>;
    /// Chunk hashes accumulated during chunked upload
    chunkHashes : Map.Map<Principal, Vector.Vector<IC.ChunkHash>>;
  };

  public func new() : Store {
    {
      statuses = Map.empty();
      chunkHashes = Map.empty();
    };
  };

  // Split blob into chunks of specified size
  public func splitIntoChunks(blob : Blob, chunkSize : Nat) : [Blob] {
    let bytes = Blob.toArray(blob);
    let totalSize = bytes.size();
    let chunks = List.empty<Blob>();
    var offset = 0;

    while (offset < totalSize) {
      let end = Nat.min(offset + chunkSize, totalSize);
      let chunk = Array.sliceToArray(bytes, offset, end) |> Blob.fromArray(_);
      List.add(chunks, chunk);
      offset += chunkSize;
    };

    List.toArray(chunks);
  };

  // ═══════════════════════════════════════════════════════════════
  // TASK GENERATION
  // ═══════════════════════════════════════════════════════════════

  /// Generate tasks for WASM installation
  /// Returns GeneratedTask (without creationId) - the orchestrator adds creationId when queuing
  public func generateTasks(store : Store, task : InstallTask, owner : Principal, startId : Nat) : [Types.GeneratedTask] {
    let wasmSize = task.wasmModule.size();
    let tasks = Vector.new<Types.GeneratedTask>();
    var taskId = startId;

    if (wasmSize < CHUNKED_THRESHOLD) {
      // Direct installation - single task
      Vector.add(
        tasks,
        {
          id = taskId;
          owner;
          taskType = #WasmInstallCode({
            canisterId = task.targetCanister;
            wasmModule = task.wasmModule;
            wasmHash = task.wasmHash;
            initArg = task.initArg;
            mode = task.mode;
          });
          var attempts = 0;
        },
      );
      Map.add(store.statuses, Principal.compare, task.targetCanister, #Pending);
    } else {
      // Chunked installation - multiple tasks
      let chunks = splitIntoChunks(task.wasmModule, CHUNK_SIZE);
      let totalChunks = chunks.size();

      // Initialize chunk hashes storage
      Map.add(store.chunkHashes, Principal.compare, task.targetCanister, Vector.new<IC.ChunkHash>());

      // Add chunk upload tasks
      for ((chunkIndex, chunk) in Iter.enumerate(chunks.vals())) {
        Vector.add(
          tasks,
          {
            id = taskId;
            owner;
            taskType = #WasmUploadChunk({
              canisterId = task.targetCanister;
              chunkIndex;
              chunk;
              totalChunks;
            });
            var attempts = 0;
          },
        );
        taskId += 1;
      };

      // Add final installation task
      Vector.add(
        tasks,
        {
          id = taskId;
          owner;
          taskType = #WasmInstallChunked({
            canisterId = task.targetCanister;
            wasmHash = task.wasmHash;
            initArg = task.initArg;
            mode = task.mode;
          });
          var attempts = 0;
        },
      );

      Map.add(
        store.statuses,
        Principal.compare,
        task.targetCanister,
        #UploadingChunks({ var uploaded = 0; total = totalChunks }),
      );
    };

    Vector.toArray(tasks);
  };

  // ═══════════════════════════════════════════════════════════════
  // TASK EXECUTION
  // ═══════════════════════════════════════════════════════════════

  public type UploadChunkArgs = {
    canisterId : Principal;
    chunkIndex : Nat;
    chunk : Blob;
    totalChunks : Nat;
  };

  /// Execute a single chunk upload
  public func executeUploadChunk(store : Store, args : UploadChunkArgs) : async Result.Result<IC.ChunkHash, Text> {
    let { canisterId; chunkIndex; chunk } = args;
    try {
      let chunkHash = await IC.ic.upload_chunk({
        canister_id = canisterId;
        chunk;
      });

      // Store chunk hash
      switch (Map.get(store.chunkHashes, Principal.compare, canisterId)) {
        case (?hashes) {
          // Ensure vector is large enough
          while (Vector.size(hashes) <= chunkIndex) {
            Vector.add(hashes, chunkHash); // Placeholder, will be overwritten
          };
          Vector.put(hashes, chunkIndex, chunkHash);
        };
        case null {
          let hashes = Vector.new<IC.ChunkHash>();
          var i = 0;
          while (i <= chunkIndex) {
            Vector.add(hashes, chunkHash);
            i += 1;
          };
          Map.add(store.chunkHashes, Principal.compare, canisterId, hashes);
        };
      };

      // Update status
      switch (Map.get(store.statuses, Principal.compare, canisterId)) {
        case (?#UploadingChunks(status)) {
          status.uploaded += 1;
        };
        case _ {};
      };

      #ok(chunkHash);
    } catch (error) {
      let errMsg = "Upload chunk failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      #err(errMsg);
    };
  };

  public type InstallCodeArgs = {
    canisterId : Principal;
    wasmModule : Blob;
    initArg : Blob;
    mode : IC.CanisterInstallMode;
  };

  /// Execute direct WASM installation (for small modules)
  public func executeInstallCode(store : Store, args : InstallCodeArgs) : async Result.Result<(), Text> {
    let { canisterId; wasmModule; initArg; mode } = args;
    ignore Map.insert(store.statuses, Principal.compare, canisterId, #Installing);

    try {
      await IC.ic.install_code({
        mode;
        canister_id = canisterId;
        wasm_module = wasmModule;
        arg = initArg;
        sender_canister_version = null;
      });

      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Completed);
      #ok;
    } catch (error) {
      let errMsg = "Install code failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      #err(errMsg);
    };
  };

  public type InstallChunkedArgs = {
    canisterId : Principal;
    wasmHash : Blob;
    initArg : Blob;
    mode : IC.CanisterInstallMode;
  };

  /// Execute chunked WASM installation
  public func executeInstallChunked(store : Store, args : InstallChunkedArgs) : async Result.Result<(), Text> {
    let { canisterId; wasmHash; initArg; mode } = args;
    ignore Map.insert(store.statuses, Principal.compare, canisterId, #Installing);

    let ?hashes = Map.get(store.chunkHashes, Principal.compare, canisterId) else {
      let errMsg = "No chunk hashes found for canister";
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      return #err(errMsg);
    };

    try {
      await IC.ic.install_chunked_code({
        mode;
        target_canister = canisterId;
        wasm_module_hash = wasmHash;
        chunk_hashes_list = Vector.toArray(hashes);
        arg = initArg;
        sender_canister_version = null;
        store_canister = null;
      });

      // Cleanup chunk hashes
      Map.remove(store.chunkHashes, Principal.compare, canisterId);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Completed);
      #ok;
    } catch (error) {
      let errMsg = "Install chunked code failed: " # Error.message(error);
      ignore Map.insert(store.statuses, Principal.compare, canisterId, #Failed(errMsg));
      #err(errMsg);
    };
  };

  // ═══════════════════════════════════════════════════════════════
  // STATUS QUERIES
  // ═══════════════════════════════════════════════════════════════

  public func getStatus(store : Store, canisterId : Principal) : ?Status {
    switch (Map.get(store.statuses, Principal.compare, canisterId)) {
      case (?#Pending) ?#Pending;
      case (?#UploadingChunks(value)) ?#UploadingChunks({
        uploaded = value.uploaded;
        total = value.total;
      });
      case (?#Installing) ?#Installing;
      case (?#Completed) ?#Completed;
      case (?#Failed(e)) ?#Failed(e);
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
    Map.remove(store.chunkHashes, Principal.compare, canisterId);
  };
};
