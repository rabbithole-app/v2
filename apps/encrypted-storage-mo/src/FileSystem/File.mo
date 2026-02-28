import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Option "mo:core/Option";
import Map "mo:core/Map";

import MemoryRegion "mo:memory-region/MemoryRegion";

import T "../Types";
import Utils "../Utils";
import Const "../Const";

module File {

  /// Creates a new file with the given encryption mode and max versions limit.
  public func new(encryptionMode : T.EncryptionMode, maxVersions : ?Nat) : T.FileMetadataStore = {
    versions = Map.empty<Nat, T.FileVersion>();
    var nextVersionId = 0;
    var currentVersion = 0;
    var maxVersions = maxVersions;
    var locked = true;
    var thumbnailKey = null;
    var encryptionMode = encryptionMode;
  };

  /// Returns the current (active) version, or null if no versions exist.
  public func getCurrentVersion(self : T.FileMetadataStore) : ?T.FileVersion {
    Map.get(self.versions, Nat.compare, self.currentVersion);
  };

  /// Returns the storage backend for a ContentRef.
  public func storageBackendOf(ref : T.ContentRef) : T.StorageBackend {
    switch (ref) {
      case (#Inline _) #Inline;
      case (#BlobStorage _) #BlobStorage;
      case (#External _) #External;
    };
  };

  /// Allocates inline content from chunks and returns a ContentRef.
  func allocateInline(fs : T.FileSystemStore, chunksIter : Iter.Iter<Blob>, totalLength : Nat) : T.ContentRef {
    let address = MemoryRegion.allocate(fs.region, totalLength);
    var offset = 0;
    for (chunk in chunksIter) {
      MemoryRegion.storeBlob(fs.region, address + offset, chunk);
      offset += chunk.size();
    };
    #Inline(address, totalLength);
  };

  /// Deallocates a single #Inline ContentRef. No-op for other backends.
  func deallocateInlineRef(fs : T.FileSystemStore, ref : T.ContentRef) {
    switch (ref) {
      case (#Inline(address, size)) MemoryRegion.deallocate(fs.region, address, size);
      case (#BlobStorage _) {};
      case (#External _) {};
    };
  };

  /// Trims versions exceeding maxVersions, removing the oldest (smallest key) first.
  func trimVersions(fs : T.FileSystemStore, self : T.FileMetadataStore) {
    switch (self.maxVersions) {
      case null {};
      case (?limit) {
        while (Map.size(self.versions) > limit) {
          let ?(key, ver) = Map.minEntry(self.versions) else return;
          deallocateInlineRef(fs, ver.contentRef);
          Map.remove(self.versions, Nat.compare, key);
        };
        // If currentVersion was trimmed, clamp to the smallest remaining key
        if (not Map.containsKey(self.versions, Nat.compare, self.currentVersion)) {
          let ?(minKey, _) = Map.minEntry(self.versions) else return;
          self.currentVersion := minKey;
        };
      };
    };
  };

  /// Adds a new version from uploaded chunks. Trims old versions per maxVersions.
  public func addVersion(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    chunksIter : Iter.Iter<Blob>,
    totalLength : Nat,
    contentHash : Blob,
    contentType : Text,
  ) {
    let contentRef = allocateInline(fs, chunksIter, totalLength);
    let version : T.FileVersion = {
      contentRef;
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

  /// Adds a new version from a single blob.
  public func addVersionFromContent(
    fs : T.FileSystemStore,
    self : T.FileMetadataStore,
    content : Blob,
    contentHash : Blob,
    contentType : Text,
  ) {
    addVersion(fs, self, Iter.singleton(content), content.size(), contentHash, contentType);
  };

  /// Deallocates ALL inline versions (used for file deletion).
  public func deallocateAll(fs : T.FileSystemStore, self : T.FileMetadataStore) {
    Map.forEach<Nat, T.FileVersion>(self.versions, func(_key, v) {
      deallocateInlineRef(fs, v.contentRef);
    });
    Map.clear(self.versions);
    self.currentVersion := 0;
    self.nextVersionId := 0;
  };

  /// Gets content from a specific version (or current if version is null). Only works for #Inline.
  public func getContent(fs : T.FileSystemStore, self : T.FileMetadataStore, version : ?Nat) : Blob {
    let ver = getVersion(self, version);
    switch (ver) {
      case (?{ contentRef = #Inline(address, size) }) MemoryRegion.loadBlob(fs.region, address, size);
      case _ "";
    };
  };

  /// Returns the number of chunks for a given version (or current).
  public func getChunksSize(self : T.FileMetadataStore, version : ?Nat) : Nat {
    let ver = getVersion(self, version);
    switch (ver) {
      case (?v) Utils.divCeiling(v.size, Const.MAX_CHUNK_SIZE);
      case null 0;
    };
  };

  /// Reads a chunk from a specific version (or current).
  public func getChunk(fs : T.FileSystemStore, self : T.FileMetadataStore, chunkIndex : Nat, version : ?Nat) : ?Blob {
    let ver = getVersion(self, version);
    switch (ver) {
      case (?{ contentRef = #Inline(address, size) }) {
        let numChunks = Utils.divCeiling(size, Const.MAX_CHUNK_SIZE);
        if (chunkIndex >= numChunks) return null;
        let chunkOffset = chunkIndex * Const.MAX_CHUNK_SIZE;
        let chunkSize = Nat.min(Const.MAX_CHUNK_SIZE, size - chunkOffset);
        ?MemoryRegion.loadBlob(fs.region, address + chunkOffset, chunkSize);
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
    var thumbnailKey = self.thumbnailKey;
    var encryptionMode = self.encryptionMode;
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
