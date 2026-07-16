import MemoryRegion "mo:memory-region/MemoryRegion";
import Result "mo:core/Result";

import IncGzipDecoder "IncGzipDecoder";
import TarIndexer "TarIndexer";
import Types "Types";

module TarExtractor {
  public type Status = {
    #Idle;
    #Decoding : Types.Progress;
    #Complete;
    #Failed : Text;
  };

  public type Store = {
    /// Source archive location. Owned by the HttpDownloader store — never
    /// deallocated here; invalidation flows through GitHubReleases which
    /// removes the download and this store in the same message.
    pointer : Types.SizedPointer;
    region : MemoryRegion.MemoryRegion;
    gzipDecoder : IncGzipDecoder.Store;
    isGzipped : Bool;
    var status : Status;
    var decompressedPointer : ?Types.SizedPointer; // Pointer to decompressed tar data (if gzipped)
  };

  public func new({ region; pointer; isGzipped } : { region : MemoryRegion.MemoryRegion; pointer : Types.SizedPointer; isGzipped : Bool }) : Store {
    {
      region;
      pointer;
      isGzipped;
      gzipDecoder = IncGzipDecoder.new(region);
      var status = #Idle;
      var decompressedPointer = null;
    };
  };

  /// Pointer to the raw tar data (decompressed if the source is gzipped).
  /// Null while gzip decoding is still in progress.
  public func contentPointer(store : Store) : ?Types.SizedPointer {
    if (store.isGzipped) store.decompressedPointer else ?store.pointer;
  };

  public func extract<system>(store : Store, onIndexed : (Result.Result<TarIndexer.Index, Text>) -> ()) : () {
    store.status := #Decoding({ processed = 0; total = store.pointer.1 });

    if (store.isGzipped) {
      // Gzipped tar - use incremental decoder
      IncGzipDecoder.decode<system>(
        store.gzipDecoder,
        {
          pointer = store.pointer;
          offset = 0;
          onProgress = ?(
            func(progress) {
              store.status := #Decoding(progress);
            }
          );
          onFinish = ?(
            func(pointer) {
              // Gzip decompression complete, save pointer for later deallocation
              store.decompressedPointer := ?pointer;
              onIndexed(index(store, pointer));
            }
          );
        },
      );
    } else {
      // Plain tar - index directly without gzip decompression
      onIndexed(index(store, store.pointer));
    };
  };

  /// Rebuild the index from the retained tar data (e.g. after an upgrade
  /// dropped the transient index cache).
  public func rebuildIndex(store : Store) : Result.Result<TarIndexer.Index, Text> {
    switch (store.status) {
      case (#Complete) {
        switch (contentPointer(store)) {
          case (?pointer) index(store, pointer);
          case null #err("tar data is not available");
        };
      };
      case (#Decoding(_)) #err("tar extraction is in progress");
      case (#Idle) #err("tar extraction has not started");
      case (#Failed(e)) #err(e);
    };
  };

  func index(store : Store, pointer : Types.SizedPointer) : Result.Result<TarIndexer.Index, Text> {
    switch (TarIndexer.buildIndex(store.region, pointer)) {
      case (#ok(result)) {
        store.status := #Complete;
        #ok(result);
      };
      case (#err(e)) {
        store.status := #Failed(e);
        #err(e);
      };
    };
  };

  public func cancel<system>(store : Store) : () {
    IncGzipDecoder.cancel<system>(store.gzipDecoder);
  };

  /// Deallocate owned memory (decompressed tar data). The source pointer is
  /// owned by the downloader and left untouched.
  public func clear<system>(store : Store) : () {
    IncGzipDecoder.cancel<system>(store.gzipDecoder);

    switch (store.decompressedPointer) {
      case (?(address, size)) {
        MemoryRegion.deallocate(store.region, address, size);
        store.decompressedPointer := null;
      };
      case null {};
    };

    store.status := #Idle;
  };

  public func getStatus(store : Store) : Status {
    store.status;
  };
};
