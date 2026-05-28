import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";

module {
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
