import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Principal "mo:core/Principal";

import Vector "mo:vector";

import T "mo:encrypted-storage/Types";

import BridgeTypes "Types";

module {
  public type Envelope = BridgeTypes.Envelope;

  func principalAccessRef(ref : T.AccessRef) : ?Principal {
    switch (ref) {
      case (#principal(principal)) ?principal;
      case (#email(_)) null;
      case (#emailCommitment(_)) null;
    };
  };

  func emailCommitmentAccessRef(ref : T.AccessRef) : ?Blob {
    switch (ref) {
      case (#principal(_)) null;
      case (#email({ emailCommitment })) ?emailCommitment;
      case (#emailCommitment(commitment)) ?commitment;
    };
  };

  func toBackendStorageAccessLifecycleEvent(event : T.StorageAccessEvent) : BridgeTypes.LifecycleEvent {
    switch (event) {
      case (#pendingGrantCreated({ grantId; ref; accessClass; source })) {
        #pendingGrantCreated({ grantId; recipient = principalAccessRef(ref); emailCommitment = emailCommitmentAccessRef(ref); accessClass; source });
      };
      case (#pendingGrantClaimed({ grantId; principal; accessClass; source; claimOrigin; emailClaimState })) {
        #pendingGrantClaimed({ grantId; principal; accessClass; source; claimOrigin; emailClaimState });
      };
      case (#pendingGrantCancelled({ grantId; ref })) {
        #pendingGrantCancelled({ grantId; recipient = principalAccessRef(ref); emailCommitment = emailCommitmentAccessRef(ref) });
      };
      case (#principalGrantCreated({ grantId; principal; accessClass; source })) {
        #principalGrantCreated({ grantId; principal; accessClass; source });
      };
      case (#principalGrantRevoked({ principal; accessClass })) {
        #principalGrantRevoked({ principal; accessClass });
      };
      case (#recoveryControllerRegistered({ principal; previous })) #recoveryControllerRegistered({ principal; previous });
      case (#recoveryControllerCleared({ principal })) #recoveryControllerCleared({ principal });
      case (#recoveryOwnerAdded({ principal })) #recoveryOwnerAdded({ principal });
      case (#recoveryOwnerRemoved({ principal })) #recoveryOwnerRemoved({ principal });
      case (#accessRequestCreated({ requestId; requester })) #accessRequestCreated({ requestId; requester });
      case (#accessRequestResolved({ requestId; requester; status })) #accessRequestResolved({ requestId; requester; status });
      case (#accessRequestCancelled({ requestId; requester })) #accessRequestCancelled({ requestId; requester });
      case (#ownerActivityRecorded({ principal; role; origin })) #ownerActivityRecorded({ principal; role; origin });
      case (#durablePolicyCreated({ policyId; status; trigger })) #durablePolicyCreated({ policyId; status; trigger });
      case (#durablePolicyGraceStarted({ policyId })) #durablePolicyGraceStarted({ policyId });
      case (#durablePolicyMatured({ policyId })) #durablePolicyMatured({ policyId });
      case (#durablePolicyReleased({ policyId })) #durablePolicyReleased({ policyId });
      case (#durablePolicyCancelled({ policyId })) #durablePolicyCancelled({ policyId });
    };
  };

  public func toEnvelope(accountOwner : Principal, storageCanisterId : Principal, event : T.StoredStorageEvent) : Envelope {
    {
      accountOwner;
      storageCanisterId;
      storageEventId = event.id;
      correlationId = event.correlationId;
      event = switch (event.event) {
        case (#access(accessEvent)) toBackendStorageAccessLifecycleEvent(accessEvent);
      };
    };
  };

  public func append(queue : [Envelope], envelope : Envelope) : [Envelope] {
    Array.tabulate<Envelope>(
      queue.size() + 1,
      func(index) {
        if (index < queue.size()) queue[index] else envelope;
      },
    );
  };

  public func prependAll(prefix : [Envelope], queue : [Envelope]) : [Envelope] {
    Array.tabulate<Envelope>(
      prefix.size() + queue.size(),
      func(index) {
        if (index < prefix.size()) prefix[index] else queue[index - prefix.size()];
      },
    );
  };

  public func dispatch(backendId : ?Principal, batch : [Envelope]) : async [Envelope] {
    if (batch.size() == 0) return [];
    let ?bid = backendId else return batch;
    let backend : actor {
      onStorageAccessChanged : Envelope -> async ();
    } = actor (Principal.toText(bid));
    let failed = Vector.new<Envelope>();
    for (envelope in batch.vals()) {
      try {
        await backend.onStorageAccessChanged(envelope);
      } catch _ {
        Vector.add(failed, envelope);
      };
    };
    Vector.toArray(failed);
  };
};
