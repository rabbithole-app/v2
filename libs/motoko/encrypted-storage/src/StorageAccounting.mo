import CoreMap "mo:core/Map";

import T "Types";

module {
  public type StoredBytesDeltaArguments = {
    file : T.FileMetadataStore;
    beforeBytes : Nat;
  };

  public func fileStoredBytes(file : T.FileMetadataStore) : Nat {
    var total = 0;
    for ((_, version) in CoreMap.entries(file.versions)) {
      total += version.size;
    };
    total;
  };

  public func applyStoredBytesDelta(self : T.StableStore, args : StoredBytesDeltaArguments) {
    let { file; beforeBytes } = args;
    let afterBytes = fileStoredBytes(file);
    if (afterBytes >= beforeBytes) {
      let added = afterBytes - beforeBytes;
      self.storedBytesUsed += added;
    } else {
      let removed = beforeBytes - afterBytes;
      self.storedBytesUsed := if (removed >= self.storedBytesUsed) 0 else self.storedBytesUsed - removed;
    };
  };
};
