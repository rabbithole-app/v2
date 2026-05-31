import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Option "mo:core/Option";
import Map "mo:core/Map";

import MemoryRegion "mo:memory-region/MemoryRegion";

import T "../Types";

module File {

  /// Creates a new encrypted file metadata store with the given max versions limit.
  public func new(maxVersions : ?Nat) : T.FileMetadataStore = {
    versions = Map.empty<Nat, T.FileVersion>();
    var nextVersionId = 0;
    var currentVersion = 0;
    var maxVersions = maxVersions;
    var locked = true;
    var thumbnailRef = null;
  };

  /// Returns the current (active) version, or null if no versions exist.
  public func getCurrentVersion(self : T.FileMetadataStore) : ?T.FileVersion {
    Map.get(self.versions, Nat.compare, self.currentVersion);
  };

  /// Returns the storage backend type based on the first chunk's ContentRef.
  public func storageBackendOf(chunks : [T.ContentRef]) : T.StorageBackend {
    if (chunks.size() == 0) return #OnChain;
    switch (chunks[0]) {
      case (#OnChain _) #OnChain;
      case (#BlobStorage _) #BlobStorage;
    };
  };

  /// Allocates each chunk separately in MemoryRegion, returning ContentRef array.
  /// Each pointer preserves the exact upload chunk boundary.
  func allocateChunks(fs : T.FileSystemStore, chunksIter : Iter.Iter<Blob>) : [T.ContentRef] {
    Array.fromIter<T.ContentRef>(
      Iter.map<Blob, T.ContentRef>(
        chunksIter,
        func(chunk : Blob) : T.ContentRef {
          let size = chunk.size();
          let address = MemoryRegion.allocate(fs.region, size);
          MemoryRegion.storeBlob(fs.region, address, chunk);
          #OnChain(address, size);
        },
      )
    );
  };

  /// Deallocates chunk pointers for a version. Only #OnChain chunks use MemoryRegion.
  func deallocateChunks(fs : T.FileSystemStore, chunks : [T.ContentRef]) {
    for (ref in chunks.vals()) {
      switch (ref) {
        case (#OnChain(address, size)) MemoryRegion.deallocate(fs.region, address, size);
        case (#BlobStorage _) {}; // managed by blob storage scrubber
      };
    };
  };

  /// Trims versions exceeding maxVersions, removing the oldest (smallest key) first.
  func trimVersions(fs : T.FileSystemStore, self : T.FileMetadataStore) {
    switch (self.maxVersions) {
      case null {};
      case (?limit) {
        while (Map.size(self.versions) > limit) {
          let ?(key, ver) = Map.minEntry(self.versions) else return;
          deallocateChunks(fs, ver.chunks);
          Map.remove(self.versions, Nat.compare, key);
        };
        if (not Map.containsKey(self.versions, Nat.compare, self.currentVersion)) {
          let ?(minKey, _) = Map.minEntry(self.versions) else return;
          self.currentVersion := minKey;
        };
      };
    };
  };

  /// Adds a new version from uploaded chunks (#OnChain backend).
  /// Trims old versions per maxVersions.
  public func addVersion(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    chunksIter : Iter.Iter<Blob>,
    totalLength : Nat,
    contentHash : Blob,
    contentType : Text,
  ) {
    let chunks = allocateChunks(fs, chunksIter);
    commitVersion(fs, self, chunks, totalLength, contentHash, contentType);
  };

  /// Adds a new version for Caffeine blob storage (#BlobStorage backend).
  /// The blob is stored off-chain; only the hash reference is kept on-chain.
  public func addVersionBlobStorage(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    blobId : Blob,
    totalLength : Nat,
    contentHash : Blob,
    contentType : Text,
  ) {
    let chunks : [T.ContentRef] = [#BlobStorage { blobId; size = totalLength }];
    commitVersion(fs, self, chunks, totalLength, contentHash, contentType);
  };

  /// Adds a new version from already allocated content refs.
  /// The caller transfers ownership of #OnChain pointers to the file version.
  public func addVersionRefs(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    chunks : [T.ContentRef],
    totalLength : Nat,
    contentHash : Blob,
    contentType : Text,
  ) {
    commitVersion(fs, self, chunks, totalLength, contentHash, contentType);
  };

  /// Shared version commit logic for both backends.
  func commitVersion(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    chunks : [T.ContentRef],
    totalLength : Nat,
    contentHash : Blob,
    contentType : Text,
  ) {
    let version : T.FileVersion = {
      chunks;
      sha256 = ?contentHash;
      size = totalLength;
      contentType;
      createdAt = Time.now();
    };
    let key = self.nextVersionId;
    Map.add(self.versions, Nat.compare, key, version);
    self.nextVersionId += 1;
    self.currentVersion := key;
    self.locked := false;
    trimVersions(fs, self);
  };

  /// Adds a new version from a single blob (#OnChain).
  public func addVersionFromContent(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    content : Blob,
    contentHash : Blob,
    contentType : Text,
  ) {
    addVersion(fs, self, Iter.singleton(content), content.size(), contentHash, contentType);
  };

  /// Deallocates ALL versions (used for file deletion).
  public func deallocateAll(fs : T.FileSystemStore, self : T.FileMetadataStore) {
    Map.forEach<Nat, T.FileVersion>(self.versions, func(_key, v) {
      deallocateChunks(fs, v.chunks);
    });
    Map.clear(self.versions);
    self.currentVersion := 0;
    self.nextVersionId := 0;
  };

  /// Returns the number of chunks for a given version (or current).
  public func getChunksSize(self : T.FileMetadataStore, version : ?Nat) : Nat {
    let ver = getVersion(self, version);
    switch (ver) {
      case (?v) v.chunks.size();
      case null 0;
    };
  };

  /// Reads a chunk from a specific version (or current).
  /// Returns null for #BlobStorage chunks (frontend downloads from gateway directly).
  public func getChunk(fs : T.FileSystemStore, self : T.FileMetadataStore, chunkIndex : Nat, version : ?Nat) : ?Blob {
    let ver = getVersion(self, version);
    switch (ver) {
      case (?v) {
        if (chunkIndex >= v.chunks.size()) return null;
        switch (v.chunks[chunkIndex]) {
          case (#OnChain(address, size)) ?MemoryRegion.loadBlob(fs.region, address, size);
          case (#BlobStorage _) null;
        };
      };
      case _ null;
    };
  };

  /// Returns a deep copy of the file metadata, including all versions.
  public func copy(self : T.FileMetadataStore) : T.FileMetadataStore = {
    versions = Map.clone(self.versions);
    var nextVersionId = self.nextVersionId;
    var currentVersion = self.currentVersion;
    var maxVersions = self.maxVersions;
    var locked = self.locked;
    var thumbnailRef = self.thumbnailRef;
  };

  /// Returns the number of versions.
  public func versionCount(self : T.FileMetadataStore) : Nat {
    Map.size(self.versions);
  };

  /// Checks if a version key exists.
  public func hasVersion(self : T.FileMetadataStore, version : Nat) : Bool {
    Map.containsKey(self.versions, Nat.compare, version);
  };

  /// Gets a version by key, or current version if key is null.
  func getVersion(self : T.FileMetadataStore, version : ?Nat) : ?T.FileVersion {
    Map.get(self.versions, Nat.compare, Option.get(version, self.currentVersion));
  };
};
