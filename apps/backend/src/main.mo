import Text "mo:base/Text";
import Principal "mo:base/Principal";

actor Rabbithole {
  public query ({ caller }) func whoami() : async Text {
    Principal.toText(caller);
  };
};
