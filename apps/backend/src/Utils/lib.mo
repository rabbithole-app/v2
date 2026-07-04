import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";

import ByteUtils "mo:byte-utils";
import Random "mo:core/Random";
import Sha256 "mo:sha2/Sha256";

module {
  /// 8-char A-Z0-9 code deterministically derived from the seed parts.
  /// Shared by personal referral codes and coupon codes — they live in one
  /// namespace, so both must draw from the same alphabet and length.
  public func referralCode(seedParts : [Blob]) : Text {
    let alphabet = Text.toArray("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    let digest = Sha256.Digest(#sha256);
    for (part in seedParts.vals()) {
      digest.writeBlob(part);
    };
    let seed = ByteUtils.BigEndian.toNat64(digest.sum().vals());

    let random = Random.seed(seed);
    var code = "";
    var i = 0;
    while (i < 8) {
      let idx = random.natRange(0, alphabet.size());
      code #= Text.fromChar(alphabet[idx]);
      i += 1;
    };
    code;
  };

  public func envText<system>(name : Text, fallback : Text) : Text {
    switch (Runtime.envVar<system>(name)) {
      case (?value) value;
      case null fallback;
    };
  };

  public func envNat<system>(name : Text, fallback : Nat) : Nat {
    switch (Runtime.envVar<system>(name)) {
      case (?value) {
        switch (Nat.fromText(value)) {
          case (?parsed) parsed;
          case null fallback;
        };
      };
      case null fallback;
    };
  };
};
