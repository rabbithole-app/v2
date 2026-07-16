import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";

import MemoryRegion "mo:memory-region/MemoryRegion";

import TarExtractor "TarExtractor";
import TarIndexer "TarIndexer";
import Types "Types";

/// Serves frontend release archives to storage canisters (pull model):
/// keeps per-version tar sources in the shared MemoryRegion and a transient
/// index (key → offset/size/sha256) rebuilt lazily after upgrades.
module FrontendInstaller {
  /// Re-export TarExtractor.Status for external use
  public type ExtractionStatus = TarExtractor.Status;

  /// Maximum content bytes served per pull chunk
  public let PULL_CHUNK_SIZE : Nat = 1_900_000;

  /// Stable store: tar sources only. Indexes live in the transient cache.
  public type Store = {
    versions : Map.Map<Text, TarExtractor.Store>; // "v0.4.0/storage-frontend.tar" → tar source
    region : MemoryRegion.MemoryRegion;
  };

  /// Transient: versionKey → built index
  public type IndexCache = Map.Map<Text, TarIndexer.Index>;

  public type Manifest = {
    entries : [Types.FileMetadata];
    totalFiles : Nat;
    totalBytes : Nat;
  };

  public type FileChunk = {
    content : Blob;
    chunkCount : Nat;
    totalSize : Nat;
    sha256 : Blob;
  };

  public type ReadChunkError = {
    #UnknownFile;
    #InvalidChunk;
    #NotReady : Text;
  };

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      region;
      versions = Map.empty();
    };
  };

  public func newIndexCache() : IndexCache = Map.empty();

  /// Add a new version and index it. The content pointer is owned by the
  /// downloader. If isGzipped is true, decompresses (incrementally, into an
  /// owned allocation) before indexing.
  public func add<system>(store : Store, cache : IndexCache, args : { versionKey : Text; contentPointer : Types.SizedPointer; isGzipped : Bool }) : () {
    let extractor = TarExtractor.new({
      region = store.region;
      pointer = args.contentPointer;
      isGzipped = args.isGzipped;
    });
    Map.add(store.versions, Text.compare, args.versionKey, extractor);
    TarExtractor.extract<system>(
      extractor,
      func(result) {
        switch (result) {
          case (#ok(index)) ignore Map.insert(cache, Text.compare, args.versionKey, index);
          case (#err(_)) {}; // recorded as #Failed in the extractor status
        };
      },
    );
  };

  /// Invalidate a version: deallocate owned memory and drop the index.
  /// Use this when the source asset has changed (e.g. hash mismatch detected).
  public func invalidateVersion<system>(store : Store, cache : IndexCache, key : Text) : () {
    switch (Map.get(store.versions, Text.compare, key)) {
      case (?extractor) TarExtractor.clear<system>(extractor);
      case null {};
    };
    Map.remove(store.versions, Text.compare, key);
    Map.remove(cache, Text.compare, key);
  };

  public func getExtractionStatus(store : Store, key : Text) : ExtractionStatus {
    switch (Map.get(store.versions, Text.compare, key)) {
      case (?extractor) TarExtractor.getStatus(extractor);
      case null #Idle;
    };
  };

  /// Get the index for a version, rebuilding it from the retained tar data
  /// when the transient cache was dropped by an upgrade.
  public func ensureIndex(store : Store, cache : IndexCache, versionKey : Text) : Result.Result<TarIndexer.Index, Text> {
    switch (Map.get(cache, Text.compare, versionKey)) {
      case (?index) return #ok(index);
      case null {};
    };
    let ?extractor = Map.get(store.versions, Text.compare, versionKey) else {
      return #err("Version not found: " # versionKey);
    };
    switch (TarExtractor.rebuildIndex(extractor)) {
      case (#ok(index)) {
        ignore Map.insert(cache, Text.compare, versionKey, index);
        #ok(index);
      };
      case (#err(e)) #err(e);
    };
  };

  public func manifest(store : Store, cache : IndexCache, versionKey : Text, offset : Nat, limit : Nat) : Result.Result<Manifest, Text> {
    switch (ensureIndex(store, cache, versionKey)) {
      case (#err(e)) #err(e);
      case (#ok(index)) {
        let totalFiles = index.entries.size();
        let from = Nat.min(offset, totalFiles);
        let to = if (limit == 0) totalFiles else Nat.min(from + limit, totalFiles);
        let entries = Array.sliceToArray<TarIndexer.IndexEntry>(index.entries, from, to)
        |> Array.map<TarIndexer.IndexEntry, Types.FileMetadata>(
          _,
          func({ key; contentType; size; sha256 }) = { key; contentType; size; sha256 },
        );
        #ok({ entries; totalFiles; totalBytes = index.totalBytes });
      };
    };
  };

  public func chunkCount(size : Nat) : Nat {
    if (size == 0) 1 else (size + PULL_CHUNK_SIZE - 1) / PULL_CHUNK_SIZE;
  };

  public func readChunk(store : Store, cache : IndexCache, versionKey : Text, key : Text, chunkIndex : Nat) : Result.Result<FileChunk, ReadChunkError> {
    switch (ensureIndex(store, cache, versionKey)) {
      case (#err(e)) #err(#NotReady(e));
      case (#ok(index)) {
        let ?entry = Array.find<TarIndexer.IndexEntry>(index.entries, func(e) = e.key == key) else {
          return #err(#UnknownFile);
        };
        let chunks = chunkCount(entry.size);
        if (chunkIndex >= chunks) {
          return #err(#InvalidChunk);
        };
        let start = chunkIndex * PULL_CHUNK_SIZE;
        let len = Nat.min(PULL_CHUNK_SIZE, entry.size - start);
        #ok({
          content = MemoryRegion.loadBlob(store.region, entry.contentOffset + start, len);
          chunkCount = chunks;
          totalSize = entry.size;
          sha256 = entry.sha256;
        });
      };
    };
  };

  /// Cache-only metadata view for admin status queries. Never rebuilds the
  /// index — queries must not pay the hashing pass; update paths do.
  public func fileMetadata(_store : Store, cache : IndexCache, versionKey : Text) : [Types.FileMetadata] {
    switch (Map.get(cache, Text.compare, versionKey)) {
      case (?index) {
        index.entries.vals()
        |> Iter.map<TarIndexer.IndexEntry, Types.FileMetadata>(
          _,
          func({ key; contentType; size; sha256 }) = { key; contentType; size; sha256 },
        )
        |> Iter.toArray(_);
      };
      case null [];
    };
  };
};
