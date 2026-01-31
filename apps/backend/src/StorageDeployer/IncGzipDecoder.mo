import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Blob "mo:core/Blob";
import Timer "mo:core/Timer";
import IC "mo:core/InternetComputer";
import Buffer "mo:base/Buffer";

import Gzip "mo:compression/Gzip";
import MemoryRegion "mo:memory-region/MemoryRegion";

import Types "Types";

module IncGzipDecoder {
  public type Store = {
    region : MemoryRegion.MemoryRegion;
    var timerId : ?Timer.TimerId;
  };

  public type DecodeArgs = {
    // pointer to the memory region where gzip data is stored
    pointer : Types.SizedPointer;
    // processed bytes
    offset : Nat;
    // callback to report progress
    onProgress : ?((progress : Types.Progress) -> ());
    // callback to report when decoding is complete
    // the pointer to the memory region where the decompressed data is stored
    // old pointer is deallocated
    onFinish : ?((pointer : Types.SizedPointer) -> ());
  };

  let GZIP_CHUNK_SIZE : Nat = 32_000; // 32KB
  let MAX_INSTRUCTIONS_PER_ITERATION : Nat64 = 3_500_000_000; // 3.5B out of 5B limit

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      region;
      var timerId = null;
    };
  };

  public func decode<system>(store : Store, args : DecodeArgs) : () {
    let decoder = Gzip.Decoder();
    decodeChunk<system>(store, decoder, args);
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

  func decodeChunk<system>(store : Store, decoder : Gzip.Decoder, args : DecodeArgs) : () {
    let startInstructions = IC.performanceCounter(0);
    let totalSize = args.pointer.1;
    var currentOffset = args.offset;
    var chunksProcessed : Nat = 0;
    var bytesInIteration : Nat = 0;

    // Process chunks until we run out of data or hit instruction limit
    label chunking while (currentOffset < totalSize) {
      let currentInstructions = IC.performanceCounter(0);
      let usedInstructions = Nat64.sub(currentInstructions, startInstructions);

      // Check if we're approaching the instruction limit
      if (Nat64.greater(usedInstructions, MAX_INSTRUCTIONS_PER_ITERATION)) {
        break chunking;
      };

      // Calculate chunk size
      let remainingSize = if (totalSize > currentOffset) totalSize - currentOffset else 0;
      let chunkSize = Nat.min(GZIP_CHUNK_SIZE, remainingSize);

      // Load and decode chunk
      let address = args.pointer.0 + currentOffset;
      let blob = MemoryRegion.loadBlob(store.region, address, chunkSize);
      // Note: decoder.decode may trap on invalid gzip data
      // Motoko try/catch doesn't work for traps, only for thrown errors
      // If decoding fails, the canister will trap and state will rollback
      decoder.decode(Blob.toArray(blob));

      currentOffset += chunkSize;
      chunksProcessed += 1;
      bytesInIteration += chunkSize;
    };

    switch (args.onProgress) {
      case (?cb) cb({ processed = currentOffset; total = totalSize });
      case null {};
    };

    // Check if we're done
    if (currentOffset >= totalSize) {
      // Finalize decoding
      let result = decoder.finish();
      let blob = Blob.fromArray(Buffer.toArray(result.buffer));
      let size = blob.size();

      // Deallocate original and store result
      MemoryRegion.deallocate(store.region, args.pointer.0, args.pointer.1);
      let address = MemoryRegion.allocate(store.region, size);
      MemoryRegion.storeBlob(store.region, address, blob);

      store.timerId := null;

      // Report completion
      switch (args.onFinish) {
        case (?cb) cb((address, size));
        case null {};
      };
    } else {
      // Schedule next iteration with current decoder and new offset
      store.timerId := ?Timer.setTimer<system>(
        #milliseconds 0,
        func() : async () {
          decodeChunk<system>(store, decoder, { args with offset = currentOffset });
        },
      );
    };
  };
};
