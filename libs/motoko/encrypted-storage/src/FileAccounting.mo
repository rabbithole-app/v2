import CoreMap "mo:core/Map";

import T "Types";

module {
  public type StoredBytesDeltaArguments = {
    file : T.FileMetadataStore;
    beforeBytes : Nat;
  };

  public func encryptedFileStoredBytes(file : T.FileMetadataStore) : Nat {
    if (file.encryptionMode != #Encrypted) return 0;
    var total = 0;
    for ((_, version) in CoreMap.entries(file.versions)) {
      total += version.size;
    };
    total;
  };

  public func applyEncryptedFileStoredBytesDelta(self : T.StableStore, args : StoredBytesDeltaArguments) {
    let { file; beforeBytes } = args;
    if (file.encryptionMode != #Encrypted) return;
    let afterBytes = encryptedFileStoredBytes(file);
    if (afterBytes >= beforeBytes) {
      let added = afterBytes - beforeBytes;
      self.encryptedBytesUsed += added;
    } else {
      let removed = beforeBytes - afterBytes;
      self.encryptedBytesUsed := if (removed >= self.encryptedBytesUsed) 0 else self.encryptedBytesUsed - removed;
    };
  };
};
