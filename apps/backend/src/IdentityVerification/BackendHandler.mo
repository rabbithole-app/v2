import Blob "mo:core/Blob";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import EncryptedStorage "mo:encrypted-storage";

import SharedAccess "../SharedAccess/lib";
import IdentityVerification "lib";

module {
  public type Deps = {
    upsertFromVerifiedAttributes : (Principal, IdentityVerification.VerifiedIdentityAttributes) -> Result.Result<(), Text>;
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
    deps : Deps,
    caller : Principal,
    attrs : IdentityVerification.VerifiedIdentityAttributes,
  ) : async Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
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
              await claimStorageEmailAccessForVerifiedEmail(sharedAccess, caller, email, deps.claimStorageEmailAccessByCommitment);
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
};
