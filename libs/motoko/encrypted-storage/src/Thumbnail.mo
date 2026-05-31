import Result "mo:core/Result";

import T "Types";

module Thumbnail {
  public func encryption(ref : T.ThumbnailRef) : T.ThumbnailEncryptionRef {
    switch (ref) {
      case (#OnChain(thumbnail)) thumbnail.encryption;
      case (#BlobStorage(thumbnail)) thumbnail.encryption;
    };
  };

  public func storageBackend(ref : T.ThumbnailRef) : T.StorageBackend {
    switch (ref) {
      case (#OnChain(_)) #OnChain;
      case (#BlobStorage(_)) #BlobStorage;
    };
  };

  public func withEncryption(ref : T.ThumbnailRef, nextEncryption : T.ThumbnailEncryptionRef) : T.ThumbnailRef {
    switch (ref) {
      case (#OnChain(thumbnail)) #OnChain({
        key = thumbnail.key;
        sha256 = thumbnail.sha256;
        contentType = thumbnail.contentType;
        size = thumbnail.size;
        encryption = nextEncryption;
      });
      case (#BlobStorage(thumbnail)) #BlobStorage({
        rootHash = thumbnail.rootHash;
        blobId = thumbnail.blobId;
        sha256 = thumbnail.sha256;
        contentType = thumbnail.contentType;
        size = thumbnail.size;
        encryption = nextEncryption;
      });
    };
  };

  public func validateEncryption(expected : T.ThumbnailEncryptionRequirement, provided : T.ThumbnailEncryptionRef) : Result.Result<(), Text> {
    if (expected.scopeKeyId != provided.scopeKeyId) {
      #err("Encrypted thumbnail scope does not match current directory scope.");
    } else {
      #ok;
    };
  };

  public func validateStorageBackend(expected : T.StorageBackend, provided : T.ThumbnailRef) : Result.Result<(), Text> {
    switch (expected, storageBackend(provided)) {
      case (#OnChain, #OnChain) #ok;
      case (#BlobStorage, #BlobStorage) #ok;
      case (#OnChain, #BlobStorage) #err("Blob Storage thumbnails are not enabled for this entry.");
      case (#BlobStorage, #OnChain) #err("On-chain thumbnails are not enabled for this entry.");
    };
  };
};
