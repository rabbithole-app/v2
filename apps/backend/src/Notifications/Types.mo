import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Map "mo:core/Map";

import Vector "mo:vector";
import StorageTypes "mo:encrypted-storage/Types";

module {
  public type NotificationPayload = {
    #subscriptionActivated : { plan : { #Free; #Trial; #Pro } };
    #subscriptionExpired;
    #trialStarted : { limitBytes : Nat };
    #lowCycles : {
      canisterId : Principal;
      remaining : Nat;
      estimatedDaysLeft : Nat;
      severity : { #warning; #critical };
    };
    #updateAvailable : { canisterId : Principal; releaseTag : Text };
    #paymentReceived : { purpose : Text; amount : Nat; tokenId : Text };
    #depositReceived : { amount : Nat; tokenId : Text };
    #subscriptionRenewed : { plan : { #Free; #Trial; #Pro }; expiresAt : ?Int };
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

  public type NotificationSeverity = {
    #info;
    #success;
    #warning;
    #critical;
  };

  public type NotificationSource = {
    #backend;
    #storage;
  };

  public type SourceEventRef = {
    #backend : { kind : Text };
    #storage : {
      canisterId : Principal;
      storageEventId : Nat;
    };
  };

  public type StoredNotification = {
    id : Nat;
    payload : NotificationPayload;
    read : Bool;
    createdAt : Time.Time;
    correlationId : ?Text;
    source : NotificationSource;
    sourceEvent : ?SourceEventRef;
    severity : NotificationSeverity;
  };

  public type Inbox = {
    items : Vector.Vector<StoredNotification>;
    var unreadCount : Nat;
  };

  public type Store = {
    inboxes : Map.Map<Principal, Inbox>;
    var nextId : Nat;
  };

  public type NotificationsPage = {
    data : [StoredNotification];
    unreadCount : Nat;
  };

  public type ListNotificationsArgs = {
    afterId : ?Nat;
    limit : Nat;
    unreadOnly : Bool;
  };

  public type Delivery = {
    recipient : Principal;
    payload : NotificationPayload;
    correlationId : ?Text;
    source : NotificationSource;
    sourceEvent : ?SourceEventRef;
    severity : NotificationSeverity;
  };
};
