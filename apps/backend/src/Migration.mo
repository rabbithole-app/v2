import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Time "mo:core/Time";

import Vector "mo:vector";

import StorageTypes "mo:encrypted-storage/Types";

import Types "Notifications/Types";

/// One-shot migration for the cycles-reserve release (2026-07).
///
/// `NotificationPayload` gained `#cyclesReserveLow`, but stored notifications
/// live under the `var` internals of `Map`/`Vector`, which are invariant for
/// stable compatibility — widening the variant there requires an explicit
/// container rebuild. The elements themselves upcast implicitly (immutable
/// record fields are covariant).
///
/// REMOVE THIS FILE and the `(with migration = ...)` clause in main.mo right
/// after the first successful mainnet upgrade: the migration domain describes
/// the pre-upgrade state, so leaving it attached would fail the
/// stable-compatibility gate on the following deploy.
module {
  /// `NotificationPayload` exactly as deployed on mainnet (from the
  /// `motoko:stable-types` metadata) — the current type minus
  /// `#cyclesReserveLow`.
  type OldNotificationPayload = {
    #subscriptionActivated : { plan : { #Free; #Pro } };
    #subscriptionExpired;
    #lowCycles : {
      canisterId : Principal;
      remaining : Nat;
      estimatedDaysLeft : Nat;
      severity : { #warning; #critical };
    };
    #updateAvailable : { canisterId : Principal; releaseTag : Text };
    #paymentReceived : { purpose : Text; amount : Nat; tokenId : Text };
    #depositReceived : { amount : Nat; tokenId : Text };
    #subscriptionRenewed : { plan : { #Free; #Pro }; expiresAt : ?Int };
    #balanceLow : { requiredAmount : Nat };
    #autoRenewFailed : { reason : Text };
    #topUpCompleted : { canisterId : Principal; cyclesAmount : Nat };
    #topUpFailed : { canisterId : Principal; reason : Text };
    #autoTopUpCompleted : { canisterId : Principal; cyclesAmount : Nat };
    #autoTopUpFailed : { canisterId : Principal; reason : Text };
    #storageAccessRequestCreated : {
      canisterId : Principal;
      requestId : Nat;
      requester : Principal;
    };
    #storageAccessRequestResolved : {
      canisterId : Principal;
      requestId : Nat;
      status : StorageTypes.AccessRequestStatus;
    };
    #storageAccessRequestCancelled : {
      canisterId : Principal;
      requestId : Nat;
      requester : Principal;
    };
    #storageInviteCreated : {
      canisterId : Principal;
      grantId : Nat;
      accessClass : StorageTypes.AccessClass;
      source : StorageTypes.AccessSource;
    };
    #storageInviteClaimed : {
      canisterId : Principal;
      grantId : Nat;
      principal : Principal;
      accessClass : StorageTypes.AccessClass;
      source : StorageTypes.AccessSource;
    };
    #storageInviteCancelled : {
      canisterId : Principal;
      grantId : Nat;
    };
    #storageAccessGranted : {
      canisterId : Principal;
      grantId : ?Nat;
      accessClass : StorageTypes.AccessClass;
      source : StorageTypes.AccessSource;
    };
    #storageAccessRevoked : {
      canisterId : Principal;
      accessClass : ?StorageTypes.AccessClass;
    };
    #storageRecoveryOwnerAdded : { canisterId : Principal };
    #storageRecoveryOwnerRemoved : { canisterId : Principal };
    #backendLowCycles : { current : Nat; threshold : Nat };
    #creationRefunded : {
      creationId : Nat;
      owner : Principal;
      tokenId : Text;
      amount : Nat;
    };
    #backendSelfTopUpFailed : { reason : Text };
    #ambassadorPayoutFailed : {
      creationId : Nat;
      owner : Principal;
      reason : Text;
    };
    #cmcNotifyStuck : {
      id : Nat;
      canisterId : Principal;
      blockIndex : Nat;
      reason : Text;
      caller : Principal;
    };
    #treasuryIcpLow : {
      currentBalance : Nat;
      required : Nat;
      reserve : Nat;
    };
  };

  type OldStoredNotification = {
    id : Nat;
    payload : OldNotificationPayload;
    read : Bool;
    createdAt : Time.Time;
    correlationId : ?Text;
    source : Types.NotificationSource;
    sourceEvent : ?Types.SourceEventRef;
    severity : Types.NotificationSeverity;
  };

  type OldInbox = {
    items : Vector.Vector<OldStoredNotification>;
    var unreadCount : Nat;
  };

  type OldStore = {
    inboxes : Map.Map<Principal, OldInbox>;
    var nextId : Nat;
  };

  public func run(old : { notifStore : OldStore }) : { notifStore : Types.Store } {
    let inboxes = Map.empty<Principal, Types.Inbox>();
    for ((principal, oldInbox) in Map.entries(old.notifStore.inboxes)) {
      let items = Vector.new<Types.StoredNotification>();
      for (notification in Vector.vals(oldInbox.items)) {
        Vector.add(items, notification);
      };
      Map.add(
        inboxes,
        Principal.compare,
        principal,
        { items; var unreadCount = oldInbox.unreadCount },
      );
    };
    { notifStore = { inboxes; var nextId = old.notifStore.nextId } };
  };
};
