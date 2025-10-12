import Text "mo:base/Text";
import Principal "mo:base/Principal";

persistent actor Rabbithole {
  public query ({ caller }) func whoami() : async Text {
    Principal.toText(caller);
  };
};
