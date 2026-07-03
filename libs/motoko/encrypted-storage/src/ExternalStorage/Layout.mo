import Char "mo:core/Char";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";

import T "Types";

module {
  public let layoutVersionV1 : Nat = 1;

  func joinKey(prefix : Text, suffix : Text) : Text {
    if (Text.equal(prefix, "")) suffix else prefix # "/" # suffix;
  };

  func isControlChar(char : Char) : Bool {
    Char.fromNat32(0x00) <= char and char <= Char.fromNat32(0x1f);
  };

  func isLowerHexChar(char : Char) : Bool {
    char.isDigit() or ('a' <= char and char <= 'f');
  };

  public func normalizePrefix(prefix : Text) : Result.Result<Text, Text> {
    let trimmed = Text.trim(prefix, #char ' ');
    var normalized = "";

    for (segment in Text.tokens(trimmed, #char '/')) {
      if (Text.equal(segment, ".") or Text.equal(segment, "..")) {
        return #err("external storage prefix must not contain '.' or '..' segments");
      };
      if (Text.notEqual(segment, Text.trim(segment, #char ' '))) {
        return #err("external storage prefix segments must not have surrounding spaces");
      };
      for (char in segment.chars()) {
        if (isControlChar(char) or char == '\\' or char == '?' or char == '#') {
          return #err("external storage prefix contains an unsupported character");
        };
      };
      normalized := joinKey(normalized, segment);
    };

    #ok(normalized);
  };

  public func validateRootHashHex(rootHashHex : T.RootHashHex) : Result.Result<(), Text> {
    if (Text.size(rootHashHex) != 64) {
      return #err("external blob root hash must be a 64-character lowercase sha256 hex string");
    };

    for (char in rootHashHex.chars()) {
      if (not isLowerHexChar(char)) {
        return #err("external blob root hash must use lowercase hexadecimal characters");
      };
    };

    #ok;
  };

  public func blobLocator({ prefix; rootHashHex } : T.BlobLocatorArgs) : Result.Result<T.BlobLocator, Text> {
    switch (validateRootHashHex(rootHashHex)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };

    let normalizedPrefix = switch (normalizePrefix(prefix)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };

    let rootKey = joinKey(normalizedPrefix, "v1/blobs/" # rootHashHex);
    #ok({
      layoutVersion = layoutVersionV1;
      treeKey = rootKey # "/tree.json";
      blobKey = rootKey # "/blob.bin";
    });
  };

  public func replicaId(targetId : T.TargetId, rootHashHex : T.RootHashHex) : Text {
    targetId # "\n" # rootHashHex;
  };

  /// Throwaway key used by the configure-time capability probe.
  public func probeKey(prefix : Text, nonce : Text) : Text {
    let normalizedPrefix = switch (normalizePrefix(prefix)) {
      case (#ok(value)) value;
      case (#err(_)) "";
    };
    joinKey(normalizedPrefix, "v1/_probe/" # nonce);
  };
};
