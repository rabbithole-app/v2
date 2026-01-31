// import CRC32 "mo:hash/CRC32";
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat32 "mo:core/Nat32";
import Nat8 "mo:core/Nat8";
import Principal "mo:core/Principal";

module {
  // 32-byte array.
  public type AccountIdentifier = Blob;
  // 32-byte array.
  public type Subaccount = Blob;

  //   public func beBytes(n : Nat32) : [Nat8] {
  //     func byte(n : Nat32) : Nat8 {
  //       Nat8.fromNat(Nat32.toNat(n & 0xff));
  //     };
  //     [byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)];
  //   };

  // public func defaultSubaccount() : Subaccount {
  //     Blob.fromArrayMut(Array.init(32, 0 : Nat8));
  // };

  // public func accountIdentifier(principal : Principal, subaccount : Subaccount) : AccountIdentifier {
  //     let hash = Sha256.Digest(#sha224);
  //     hash.writeArray([0x0A]);
  //     hash.writeBlob(Text.encodeUtf8("account-id"));
  //     hash.writeBlob(Principal.toBlob(principal));
  //     hash.writeBlob(subaccount);
  //     let hashSum : [Nat8] = Blob.toArray(hash.sum());
  //     let crc32Bytes : [Nat8] = beBytes(CRC32.checksum(hashSum));
  //     let buffer = Buffer.fromArray<Nat8>(crc32Bytes);
  //     buffer.append(Buffer.fromArray(hashSum));
  //     Blob.fromArray(Buffer.toArray(buffer));
  // };

  // public func validateAccountIdentifier(accountIdentifier : AccountIdentifier) : Bool {
  //     if (accountIdentifier.size() != 32) {
  //         return false;
  //     };
  //     let a = Blob.toArray(accountIdentifier);
  //     let accIdPart = Array.tabulate(28, func(i : Nat) : Nat8 { a[i + 4] });
  //     let checksumPart = Array.tabulate(4, func(i : Nat) : Nat8 { a[i] });
  //     let crc32 = CRC32.checksum(accIdPart);
  //     Array.equal(beBytes(crc32), checksumPart, Nat8.equal);
  // };

  public func principalToSubaccount(principal : Principal) : Blob {
    let principalBytes = Blob.toArray(Principal.toBlob(principal));
    let arr = Array.tabulate(
      32,
      func(i : Nat) : Nat8 {
        if (i == 0) Nat8.fromNat(principalBytes.size()) else if (i <= principalBytes.size()) principalBytes[i - 1] else 0;
      },
    );
    Blob.fromArray(arr);
  };

  public func canisterToSubaccount(id : Principal) : Blob {
    let p = Blob.toArray(Principal.toBlob(id));
    let arr = Array.tabulate(
      32,
      func(i : Nat) : Nat8 {
        if (i >= p.size() + 1) 0 else if (i == 0) Nat8.fromNat(p.size()) else p[i - 1];
      },
    );
    Blob.fromArray(arr);
  };
};
