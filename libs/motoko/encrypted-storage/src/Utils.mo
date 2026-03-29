import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Text "mo:core/Text";
import Order "mo:core/Order";
import Principal "mo:core/Principal";

import Map "mo:map/Map";

import T "Types";

module {
  let { hashText; hashNat64 } = Map;

  public let hashNodes : Map.HashUtils<T.NodeKey> = (
    func(key) = switch (key) {
      case (kind, ?parent_id, name) (hashText(debug_show kind # name) +% hashNat64(parent_id)) & 0x3fffffff;
      case (kind, null, name) hashText(debug_show kind # name);
    },
    func(a, b) = switch (a, b) {
      case (((#File, apid, aname), (#File, bpid, bname)) or ((#Directory, apid, aname), (#Directory, bpid, bname))) Option.equal(apid, bpid, Nat64.equal) and Text.equal(aname, bname);
      case (_, _) false;
    },
  );

  /// Repeat a specified text `n` number of times
  ///
  /// #### Examples
  /// ```
  /// repeat("*", 3) // "***"
  /// ```
  public func repeat(text : Text, n : Nat) : Text {
    var repeatedText = text;

    for (_ in Nat.range(2, n)) {
      repeatedText #= text;
    };

    repeatedText;
  };

  public func permissionCompare(a : T.Permission, b : T.Permission) : Order.Order {
    switch ((a, b)) {
      case ((#Read, #Read) or (#ReadWrite, #ReadWrite) or (#ReadWriteManage, #ReadWriteManage)) #equal;
      case ((#ReadWriteManage, _) or (#ReadWrite, #Read)) #greater;
      case ((#Read, _) or (#ReadWrite, #ReadWriteManage)) #less;
    };
  };

  public func divCeiling(a : Nat, b : Nat) : Nat {
    (a + (b - 1)) / b;
  };
};
