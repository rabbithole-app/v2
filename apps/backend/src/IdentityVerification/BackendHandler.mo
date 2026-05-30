import Blob "mo:core/Blob";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import EncryptedStorage "mo:encrypted-storage";

import SharedAccess "../SharedAccess/lib";
import IdentityVerification "lib";

module {
  public type VerifiedAttributesDeps = {
    upsertFromVerifiedAttributes : (Principal, IdentityVerification.VerifiedIdentityAttributes) -> Result.Result<(), Text>;
  };

  public type ClaimVerifiedEmailAccessDeps = {
    claimStorageEmailAccessByCommitment : (Principal, Principal, Blob) -> async ();
  };

  public func linkSharedAccessForVerifiedEmail(sharedAccess : SharedAccess.Store, principal : Principal, email : Text) {
    for (target in SharedAccess.listPendingEmailGrantTargets(sharedAccess).vals()) {
      let commitment = EncryptedStorage.emailCommitmentForCanister(target.storageCanisterId, email);
      if (commitment == target.emailCommitment) {
        SharedAccess.linkEmailCommitmentToPrincipal(sharedAccess, principal, target.storageCanisterId, target.emailCommitment);
      };
    };
  };

  public func claimStorageEmailAccessForVerifiedEmail(
    sharedAccess : SharedAccess.Store,
    principal : Principal,
    email : Text,
    claimStorageEmailAccessByCommitment : (Principal, Principal, Blob) -> async (),
  ) : async () {
    for (target in SharedAccess.listPendingEmailGrantTargets(sharedAccess).vals()) {
      let commitment = EncryptedStorage.emailCommitmentForCanister(target.storageCanisterId, email);
      if (commitment == target.emailCommitment) {
        await claimStorageEmailAccessByCommitment(principal, target.storageCanisterId, commitment);
      };
    };
  };

  public func onVerifiedAttributes(
    sharedAccess : SharedAccess.Store,
    deps : VerifiedAttributesDeps,
    caller : Principal,
    attrs : IdentityVerification.VerifiedIdentityAttributes,
  ) : Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
    switch (deps.upsertFromVerifiedAttributes(caller, attrs)) {
      case (#ok) {
        let isVerifiedEmail = switch (attrs.verifiedEmail) {
          case (?value) value;
          case null false;
        };
        if (isVerifiedEmail) {
          switch (attrs.email) {
            case (?email) {
              linkSharedAccessForVerifiedEmail(sharedAccess, caller, email);
            };
            case null {};
          };
        };
        #ok;
      };
      case (#err(_error)) {
        #err(#malformedPayload);
      };
    };
  };

  public func claimVerifiedEmailAccess(
    sharedAccess : SharedAccess.Store,
    deps : ClaimVerifiedEmailAccessDeps,
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
    await claimStorageEmailAccessForVerifiedEmail(sharedAccess, caller, email, deps.claimStorageEmailAccessByCommitment);
    #ok;
  };
};
