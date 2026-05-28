import Blob "mo:core/Blob";
import Principal "mo:core/Principal";

import StorageTypes "mo:encrypted-storage/Types";

import NotificationTypes "../Notifications/Types";

module {
  public type CorrelationId = Text;
  public type Plan = { #Free; #Pro };
  public type Progress = { processed : Nat; total : Nat };

  public type NotificationRequest = {
    recipient : Principal;
    payload : NotificationTypes.NotificationPayload;
    correlationId : ?CorrelationId;
  };

  public type AdminNotificationRequest = {
    payload : NotificationTypes.NotificationPayload;
    correlationId : ?CorrelationId;
  };

  public type CreationChanged = {
    accountOwner : Principal;
    creationId : Nat;
    canisterId : ?Principal;
    /// `stage` is the current status tag. Progress-bearing stages keep the
    /// same tag while `progress` changes, so consumers must not treat this as
    /// a unique event version.
    stage : Text;
    progress : ?Progress;
    terminal : Bool;
    /// Timeline index after tag-based deduplication. It changes on stage
    /// transitions, but not on every progress tick within the same stage.
    eventIndex : Nat;
  };

  public type SubscriptionChanged = {
    userId : Principal;
    previousPlan : ?Plan;
    plan : Plan;
    expiresAt : ?Int;
    change : {
      #activated;
      #renewed;
      #expired;
      #downgradedToFree;
      #granted;
    };
    source : {
      #payment;
      #internalBalance;
      #adminGrant;
      #coupon;
      #autoRenew;
      #expirationTimer;
      #manualDowngrade;
    };
  };

  public type BalanceChanged = {
    subject : {
      #user : Principal;
      #treasury;
      #backendCanister;
      #storageCanister : {
        accountOwner : Principal;
        canisterId : Principal;
      };
    };
    balanceKind : {
      #token : { tokenId : Text };
      #cycles;
      #icpTreasuryReserve;
      #ambassadorEarnings;
    };
    reason : {
      #deposit;
      #licensePayment;
      #subscriptionPayment;
      #topUpPayment;
      #autoTopUpPayment;
      #refund;
      #ambassadorPayout;
      #adminAdjustment;
      #observedRefresh;
    };
    amountDelta : ?Int;
  };

  public type PaymentChanged = {
    userId : Principal;
    paymentId : Text;
    purpose : {
      #deposit;
      #license;
      #proMonthly;
      #topUp;
      #autoTopUp;
    };
    tokenId : Text;
    amount : Nat;
    status : {
      #received;
      #failed : Text;
      #refunded;
    };
  };

  public type CyclesAlert = {
    target : {
      #backend;
      #storage : {
        accountOwner : Principal;
        canisterId : Principal;
      };
    };
    remaining : Nat;
    threshold : ?Nat;
    estimatedDaysLeft : ?Nat;
    severity : { #warning; #critical };
  };

  public type StorageFundingStatus = {
    #requested;
    #inFlight;
    #completed : { cyclesAdded : Nat };
    #pendingCmc : { recoveryId : Nat; reason : Text };
    #refunded : { reason : Text };
    #failed : { reason : Text };
  };

  public type StorageFundingChanged = {
    accountOwner : Principal;
    canisterId : Principal;
    status : StorageFundingStatus;
    currentBalance : ?Nat;
    requiredBalance : ?Nat;
    correlationId : ?CorrelationId;
  };

  public type StorageOperationalSlice = {
    #cycles;
    #funding;
    #storage;
    #runtime;
  };

  public type StorageOperationalSeverity = {
    #info;
    #warning;
    #critical;
  };

  public type StorageOperationalStateChanged = {
    accountOwner : Principal;
    canisterId : Principal;
    slices : [StorageOperationalSlice];
    severity : ?StorageOperationalSeverity;
    correlationId : ?CorrelationId;
  };

  public type StorageAccessLifecycleEvent = {
    #pendingGrantCreated : {
      grantId : Nat;
      recipient : ?Principal;
      emailCommitment : ?Blob;
      accessClass : StorageTypes.AccessClass;
      source : StorageTypes.AccessSource;
    };
    #pendingGrantClaimed : {
      grantId : Nat;
      principal : Principal;
      accessClass : StorageTypes.AccessClass;
      source : StorageTypes.AccessSource;
      claimOrigin : ?StorageTypes.EmailClaimOrigin;
      emailClaimState : ?StorageTypes.EmailClaimState;
    };
    #pendingGrantCancelled : {
      grantId : Nat;
      recipient : ?Principal;
      emailCommitment : ?Blob;
    };
    #principalGrantCreated : {
      grantId : ?Nat;
      principal : Principal;
      accessClass : StorageTypes.AccessClass;
      source : StorageTypes.AccessSource;
    };
    #principalGrantRevoked : {
      principal : Principal;
      accessClass : ?StorageTypes.AccessClass;
    };
    #recoveryControllerRegistered : { principal : Principal; previous : ?Principal };
    #recoveryControllerCleared : { principal : Principal };
    #recoveryOwnerAdded : { principal : Principal };
    #recoveryOwnerRemoved : { principal : Principal };
    #accessRequestCreated : {
      requestId : Nat;
      requester : Principal;
    };
    #accessRequestResolved : {
      requestId : Nat;
      requester : Principal;
      status : StorageTypes.AccessRequestStatus;
    };
    #accessRequestCancelled : {
      requestId : Nat;
      requester : Principal;
    };
    #ownerActivityRecorded : {
      principal : Principal;
      role : StorageTypes.OwnerActivityRole;
      origin : StorageTypes.OwnerActivityOrigin;
    };
    #durablePolicyCreated : {
      policyId : Nat;
      status : StorageTypes.DurablePolicyStatus;
      trigger : StorageTypes.DurablePolicyTrigger;
    };
    #durablePolicyGraceStarted : { policyId : Nat };
    #durablePolicyMatured : { policyId : Nat };
    #durablePolicyReleased : { policyId : Nat };
    #durablePolicyCancelled : { policyId : Nat };
  };

  public type StorageAccessChanged = {
    accountOwner : Principal;
    storageCanisterId : Principal;
    storageEventId : Nat;
    correlationId : ?CorrelationId;
    event : StorageAccessLifecycleEvent;
  };

  public type BackendEvent = {
    // Delivery-effect variants: these create notification inbox rows today.
    #notificationRequested : NotificationRequest;
    #adminNotificationRequested : AdminNotificationRequest;

    // Domain-event variants: these are invalidation-oriented facts for future
    // WS consumers. Consumers should refetch canonical state after receiving
    // them instead of treating payloads as complete snapshots.
    #creationChanged : CreationChanged;
    #storagesChanged : { accountOwner : Principal };
    #subscriptionChanged : SubscriptionChanged;
    #balanceChanged : BalanceChanged;
    #paymentChanged : PaymentChanged;
    #cyclesAlert : CyclesAlert;
    #storageFundingChanged : StorageFundingChanged;
    #storageOperationalStateChanged : StorageOperationalStateChanged;
    #storageAccessChanged : StorageAccessChanged;
  };

  public type EventSink = {
    emit : BackendEvent -> ();
  };
};
