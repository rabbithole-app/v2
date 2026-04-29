import IIVerify "../Types/IIVerify";
import Types "../Types/lib";

module {
  public type AttributeMap = IIVerify.AttributeMap;
  public type Icrc3Value = IIVerify.Icrc3Value;
  public type VerifiedIdentityAttributes = IIVerify.VerifiedIdentityAttributes;
  public type IdentityAttributesSyncError = Types.IdentityAttributesSyncError;
  public type IdentityAttributesSyncResult = Types.IdentityAttributesSyncResult;

  public let NONCE_TTL_NS : Nat = 300_000_000_000;

  public func isFresh(issuedAtNs : Nat, nowNs : Nat) : Bool {
    issuedAtNs <= nowNs and nowNs <= issuedAtNs + NONCE_TTL_NS;
  };
};
