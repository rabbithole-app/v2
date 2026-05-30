import IdentityAttributeTypes "mo:identity-attributes/Internal/Attributes";

import Types "../Types/lib";

module {
  public type VerifiedIdentityAttributes = Types.VerifiedIdentityAttributes;
  public type IdentityAttributesSyncError = Types.IdentityAttributesSyncError;
  public type IdentityAttributesSyncResult = Types.IdentityAttributesSyncResult;

  public type VerifiedIdentityAttributesBundle = IdentityAttributeTypes.IdentityAttributes;

  public let VERIFIED_ATTRIBUTES_TTL_NS : Nat = 300_000_000_000;

  public func fromVerifiedBundle(attrs : VerifiedIdentityAttributesBundle) : VerifiedIdentityAttributes {
    let provider = switch (attrs.sso) {
      case (?_) ?"sso";
      case null ?"openid";
    };

    {
      email = attrs.email;
      name = attrs.name;
      verifiedEmail = switch (attrs.email) {
        case (?_) ?true;
        case null null;
      };
      provider;
    };
  };
};
