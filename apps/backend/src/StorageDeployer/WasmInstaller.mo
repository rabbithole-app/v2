import Map "mo:core/Map";
import Queue "mo:core/Queue";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";
import Option "mo:core/Option";
import Error "mo:core/Error";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";

import IC "mo:ic";

import Types "Types";

module WasmInstaller {
  // Chunk size limit according to IC spec (1 MiB)
  // https://docs.internetcomputer.org/references/execution-errors#wasm-chunk-store-error
  let CHUNK_SIZE : Nat = 1_048_576;

  // Threshold for using chunked installation (2 MB)
  let CHUNKED_THRESHOLD : Nat = 2_000_000;

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

  type TaskState = {
    task : InstallTask;
    chunkHashes : Map.Map<Nat, IC.ChunkHash>;
    var uploadedChunks : Nat;
    totalChunks : Nat;
  };

  type Operation = {
    #UploadChunk : {
      state : TaskState;
      chunkIndex : Nat;
      chunk : Blob;
    };
    #InstallCode : InstallTask;
    #InstallChunkedCode : TaskState;
  };

  public type Store = {
    queue : Queue.Queue<Operation>;
    statuses : Map.Map<Principal, StatusMutable>;
    var timerId : ?Timer.TimerId;
  };

  public func new() : Store {
    {
      queue = Queue.empty();
      statuses = Map.empty();
      var timerId = null;
    };
  };

  // Split blob into chunks of specified size
  func splitIntoChunks(blob : Blob, chunkSize : Nat) : [Blob] {
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

  // Add installation task to the queue
  // Automatically splits into chunks if > 2MB
  public func install<system>(store : Store, task : InstallTask) : () {
    let wasmSize = task.wasmModule.size();

    if (wasmSize < CHUNKED_THRESHOLD) {
      // Direct installation - single operation
      Queue.pushBack(store.queue, #InstallCode(task));
      Map.add(store.statuses, Principal.compare, task.targetCanister, #Pending);
    } else {
      // Chunked installation - multiple operations
      let chunks = splitIntoChunks(task.wasmModule, CHUNK_SIZE);
      let totalChunks = chunks.size();

      let state : TaskState = {
        task;
        chunkHashes = Map.empty();
        var uploadedChunks = 0;
        totalChunks;
      };

      // Add chunk upload operations
      for ((chunkIndex, chunk) in Array.enumerate(chunks)) {
        Queue.pushBack(
          store.queue,
          #UploadChunk({
            state;
            chunkIndex;
            chunk;
          }),
        );
      };

      // Add final installation operation
      Queue.pushBack(store.queue, #InstallChunkedCode(state));

      Map.add(
        store.statuses,
        Principal.compare,
        task.targetCanister,
        #UploadingChunks({ var uploaded = 0; total = totalChunks }),
      );
    };

    ensureTimer<system>(store);
  };

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

  public func run<system>(store : Store) : async () {
    if (Option.isNull(store.timerId)) {
      await processQueue<system>(store);
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

  func ensureTimer<system>(store : Store) : () {
    if (Option.isNull(store.timerId) and not Queue.isEmpty(store.queue)) {
      store.timerId := ?Timer.setTimer<system>(
        #milliseconds 0,
        func() : async () { await processQueue<system>(store) },
      );
    };
  };

  func processQueue<system>(store : Store) : async () {
    switch (Queue.popFront(store.queue)) {
      case (?operation) {
        switch (operation) {
          case (#UploadChunk({ state; chunkIndex; chunk })) {
            try {
              let chunkHash = await IC.ic.upload_chunk({
                canister_id = state.task.targetCanister;
                chunk;
              });

              Map.add(state.chunkHashes, Nat.compare, chunkIndex, chunkHash);
              state.uploadedChunks += 1;

              // Update status
              switch (Map.get(store.statuses, Principal.compare, state.task.targetCanister)) {
                case (?#UploadingChunks(status)) {
                  status.uploaded := state.uploadedChunks;
                };
                case _ {};
              };
            } catch (error) {
              ignore Map.insert(
                store.statuses,
                Principal.compare,
                state.task.targetCanister,
                #Failed("Upload chunk failed: " # Error.message(error)),
              );
            };
          };

          case (#InstallCode(task)) {
            ignore Map.insert(store.statuses, Principal.compare, task.targetCanister, #Installing);

            try {
              await IC.ic.install_code({
                mode = task.mode;
                canister_id = task.targetCanister;
                wasm_module = task.wasmModule;
                arg = task.initArg;
                sender_canister_version = null;
              });

              ignore Map.insert(store.statuses, Principal.compare, task.targetCanister, #Completed);
            } catch (error) {
              ignore Map.insert(
                store.statuses,
                Principal.compare,
                task.targetCanister,
                #Failed("Install code failed: " # Error.message(error)),
              );
            };
          };

          case (#InstallChunkedCode(state)) {
            ignore Map.insert(store.statuses, Principal.compare, state.task.targetCanister, #Installing);

            try {
              await IC.ic.install_chunked_code({
                mode = state.task.mode;
                target_canister = state.task.targetCanister;
                wasm_module_hash = state.task.wasmHash;
                chunk_hashes_list = Map.values(state.chunkHashes) |> Array.fromIter(_);
                arg = state.task.initArg;
                sender_canister_version = null;
                store_canister = null;
              });

              ignore Map.insert(store.statuses, Principal.compare, state.task.targetCanister, #Completed);
            } catch (error) {
              ignore Map.insert(
                store.statuses,
                Principal.compare,
                state.task.targetCanister,
                #Failed("Install chunked code failed: " # Error.message(error)),
              );
            };
          };
        };

        // Schedule next iteration
        store.timerId := ?Timer.setTimer<system>(
          #milliseconds 0,
          func() : async () { await processQueue<system>(store) },
        );
      };
      case null {
        // Queue is empty - cancel timer
        cancel<system>(store);
      };
    };
  };
};
