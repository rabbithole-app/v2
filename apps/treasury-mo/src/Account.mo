import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Principal "mo:core/Principal";

module {
  /// Convert a Principal to a 32-byte subaccount blob.
  /// Format: [length_byte, principal_bytes..., zero_padding...]
  public func principalToSubaccount(principal : Principal) : Blob {
    let principalBytes = Blob.toArray(Principal.toBlob(principal));
    let arr = Array.tabulate(
      32,
      func(i : Nat) : Nat8 {
        if (i == 0) Nat8.fromNat(principalBytes.size())
        else if (i <= principalBytes.size()) principalBytes[i - 1]
        else 0;
      },
    );
    Blob.fromArray(arr);
  };
};
