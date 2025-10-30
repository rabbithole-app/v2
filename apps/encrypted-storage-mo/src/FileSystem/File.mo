import Iter "mo:core/Iter";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";

import MemoryRegion "mo:memory-region/MemoryRegion";
import Vector "mo:vector";

import T "../Types";
import Utils "../Utils";
import Const "../Const";

module File {
  /// Creates a new file.
  public func new() : T.FileMetadataStore = {
    var contentPointer = (0, 0);
    var sha256 = null;
    var contentType = "";
    var size = 0;
    var locked = true;
    var thumbnailKey = null;
  };

  /// Deallocates the file content
  public func deallocate(fs : T.FileSystemStore, self : T.FileMetadataStore) {
    let (address, size) = self.contentPointer;
    MemoryRegion.deallocate(fs.region, address, size);
    self.contentPointer := (0, 0);
  };

  public func replaceContentViaChunks(fs : T.FileSystemStore, self : T.FileMetadataStore, chunksIter : Iter.Iter<Blob>, totalLength : Nat, contentHash : Blob) {
    // allocating new space is not guaranteed so we need to ensure we have enough space
    // before deallocating the old content
    let newContentAddress = MemoryRegion.allocate(fs.region, totalLength);
    deallocate(fs, self);

    var offset = 0;
    for (chunk in chunksIter) {
      MemoryRegion.storeBlob(fs.region, newContentAddress + offset, chunk);
      offset += chunk.size();
    };

    self.contentPointer := (newContentAddress, totalLength);
    self.size := totalLength;
    self.sha256 := ?contentHash;
    self.locked := false;
  };

  public func replaceContent(fs : T.FileSystemStore, self : T.FileMetadataStore, content : Blob, contentHash : Blob) {
    let chunksIter = Iter.singleton(content);
    replaceContentViaChunks(fs, self, chunksIter, content.size(), contentHash);
  };

  public func getContent(fs : T.FileSystemStore, self : T.FileMetadataStore) : Blob {
    let (address, size) = self.contentPointer;
    MemoryRegion.loadBlob(fs.region, address, size);
  };

  public func getChunksSize(self : T.FileMetadataStore) : Nat {
    Utils.divCeiling(self.contentPointer.1, Const.MAX_CHUNK_SIZE);
  };

  public func getChunk(fs : T.FileSystemStore, self : T.FileMetadataStore, chunkIndex : Nat) : ?Blob {
    let (address, size) = self.contentPointer;

    let numChunks = Utils.divCeiling(size, Const.MAX_CHUNK_SIZE);

    if (chunkIndex >= numChunks) return null;

    let chunkOffset = chunkIndex * Const.MAX_CHUNK_SIZE;
    let chunkSize = Nat.min(Const.MAX_CHUNK_SIZE, size - chunkOffset);

    ?MemoryRegion.loadBlob(fs.region, address + chunkOffset, chunkSize);
  };

  /// Returns a deep copy of the asset record with a reference to the existing content.
  public func copy(self : T.FileMetadataStore) : T.FileMetadataStore {
    let newFile = new();

    newFile.contentPointer := self.contentPointer;
    newFile.sha256 := self.sha256;
    newFile.size := self.size;
    newFile.contentType := self.contentType;
    newFile.locked := self.locked;
    newFile.thumbnailKey := self.thumbnailKey;

    newFile;
  };
};
