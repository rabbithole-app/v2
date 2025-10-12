import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

import T "Types";

module ErrorMessages {
  public func batchNotFound(batchId : Nat) : Text {
    "Batch not found with id " # debug_show batchId;
  };

  public func sha256HashMismatch(providedHash : Blob, computedHash : Blob) : Text {
    "Provided hash does not match computed hash: " # debug_show ({
      providedHash;
      computedHash;
    });
  };

  public func chunkNotFound(chunkId : Nat) : Text {
    "Chunk not found with id " # debug_show chunkId;
  };

  public func entryAlreadyExists((kind, path) : T.Entry) : Text {
    let output = if (kind == #File) "File" else "Directory";
    output # " already exists: " # path;
  };

  public func entryNotFound((kind, path) : T.Entry) : Text {
    let output = if (kind == #File) "File" else "Directory";
    output # " not found: " # path;
  };

  public func directoryNotEmpty(path : Text) : Text {
    "Directory not empty: " # path;
  };

  public func sourceNotFound((kind, path) : T.Entry) : Text {
    switch (kind) {
      case (#File) "Source file not found: " # path;
      case (#Directory) "Source directory not found: " # path;
    };
  };

  public func targetNotFound((kind, path) : T.Entry) : Text {
    switch (kind) {
      case (#File) "Bad entry arguments: " # debug_show (kind, path);
      case (#Directory) "Target directory not found: " # path;
    };
  };

  public func keyIdNotFound(keyId : T.KeyId) : Text {
    let ?keyName = Text.decodeUtf8(keyId.1) else Runtime.unreachable();
    "File ID " # keyName # " from principal " # Principal.toText(keyId.0) # " not found";
  };

  public func badArgs() : Text {
    "Bad arguments are passed";
  };

  // public func missing_permission(permission : Text) : Text {
  //   "Caller does not have " # debug_show permission # " permission";
  // };

};
