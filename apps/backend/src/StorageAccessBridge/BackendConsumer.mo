import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

import EncryptedStorage "mo:encrypted-storage";

import SharedAccess "../SharedAccess/lib";
import Users "../Users/lib";
import BridgeTypes "Types";

module {
  public func normalizeStorageAccessChanged(
    accountOwner : Principal,
    storageCanisterId : Principal,
    envelope : BridgeTypes.Envelope,
  ) : BridgeTypes.Envelope {
    {
      accountOwner;
      storageCanisterId;
      storageEventId = envelope.storageEventId;
      correlationId = envelope.correlationId;
      event = envelope.event;
    };
  };

  public func pendingEmailCommitment(envelope : BridgeTypes.Envelope) : ?Blob {
    switch (envelope.event) {
      case (#pendingGrantCreated({ emailCommitment = ?commitment })) ?commitment;
      case _ null;
    };
  };

  public func verifiedEmailPrincipalsForCommitment(
    identities : [Users.VerifiedEmailIdentity],
    storageCanisterId : Principal,
    emailCommitment : Blob,
  ) : [Principal] {
    let result = Array.map<Users.VerifiedEmailIdentity, ?Principal>(
      identities,
      func(identity : Users.VerifiedEmailIdentity) : ?Principal {
        let commitment = EncryptedStorage.emailCommitmentForCanister(storageCanisterId, identity.email);
        if (commitment == emailCommitment) ?identity.principal else null;
      },
    );
    Array.map<?Principal, Principal>(
      Array.filter<?Principal>(result, func(item) = item != null),
      func(item) = switch (item) {
        case (?value) value;
        case null Runtime.unreachable();
      },
    );
  };

  public func apply(
    store : SharedAccess.Store,
    envelope : BridgeTypes.Envelope,
    matchedEmailRecipients : [Principal],
  ) {
    SharedAccess.applyStorageAccessChanged(store, envelope, matchedEmailRecipients);
  };
};
