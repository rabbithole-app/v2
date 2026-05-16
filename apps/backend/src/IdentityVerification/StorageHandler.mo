import Blob "mo:core/Blob";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import T "mo:encrypted-storage/Types";

import IdentityVerification "lib";

module {
  public type Deps = {
    emailCommitment : Text -> Blob;
    claimByEmailCommitments : (Principal, [Blob]) -> Result.Result<[T.PrincipalAccessGrant], Text>;
    afterClaim : () -> async ();
  };

  public func onVerifiedAttributes(
    deps : Deps,
    caller : Principal,
    attrs : IdentityVerification.VerifiedIdentityAttributes,
  ) : async Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
    let isVerifiedEmail = switch (attrs.verifiedEmail) {
      case (?value) value;
      case null false;
    };
    if (not isVerifiedEmail) {
      return #err(#verifiedEmailRequired);
    };
    let ?email = attrs.email else {
      return #err(#malformedPayload);
    };
    switch (deps.claimByEmailCommitments(caller, [deps.emailCommitment(email)])) {
      case (#ok(_)) {
        await deps.afterClaim();
        #ok;
      };
      case (#err(message)) {
        ignore message;
        #err(#malformedPayload);
      };
    };
  };
};
