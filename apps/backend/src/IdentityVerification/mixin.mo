import Int "mo:core/Int";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import IdentityVerification "lib";

mixin(
  deps : {
    onVerifiedAttributes : (Principal, IdentityVerification.VerifiedIdentityAttributes) -> Result.Result<(), IdentityVerification.IdentityAttributesSyncError>;
    claimVerifiedEmailAccess : (Principal, IdentityVerification.VerifiedIdentityAttributes) -> async Result.Result<(), IdentityVerification.IdentityAttributesSyncError>;
  }
) {
  type IdentityAttributesSyncResult = IdentityVerification.IdentityAttributesSyncResult;
  type VerifiedIdentityAttributes = IdentityVerification.VerifiedIdentityAttributes;

  type PendingVerifiedAttributes = {
    attrs : VerifiedIdentityAttributes;
    createdAt : Time.Time;
  };

  transient let pendingVerifiedAttributes : Map.Map<Principal, PendingVerifiedAttributes> = Map.empty();

  func pruneExpiredVerifiedAttributes() {
    let now = Time.now();
    for ((principal, pending) in Map.entries(pendingVerifiedAttributes)) {
      if (Int.abs(now - pending.createdAt) > IdentityVerification.VERIFIED_ATTRIBUTES_TTL_NS) {
        Map.remove(pendingVerifiedAttributes, Principal.compare, principal);
      };
    };
  };

  func storeVerifiedIdentityAttributes(caller : Principal, bundle : IdentityVerification.VerifiedIdentityAttributesBundle) {
    if (Principal.isAnonymous(caller)) return;

    pruneExpiredVerifiedAttributes();
    let attrs = IdentityVerification.fromVerifiedBundle(bundle);
    switch (deps.onVerifiedAttributes(caller, attrs)) {
      case (#ok) {
        Map.add(pendingVerifiedAttributes, Principal.compare, caller, {
          attrs;
          createdAt = Time.now();
        });
      };
      case (#err(_)) {};
    };
  };

  public shared ({ caller }) func claimVerifiedEmailAccess() : async IdentityAttributesSyncResult {
    assert not Principal.isAnonymous(caller);

    pruneExpiredVerifiedAttributes();
    let ?pending = Map.get(pendingVerifiedAttributes, Principal.compare, caller) else {
      return #err(#attributesNotFound);
    };
    Map.remove(pendingVerifiedAttributes, Principal.compare, caller);

    if (Int.abs(Time.now() - pending.createdAt) > IdentityVerification.VERIFIED_ATTRIBUTES_TTL_NS) {
      return #err(#expired);
    };

    switch (await deps.claimVerifiedEmailAccess(caller, pending.attrs)) {
      case (#ok _) #ok;
      case (#err error) #err(error);
    };
  };
};
