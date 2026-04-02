import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Subscriptions "lib";
import ZenDB "mo:zendb";

mixin(
  db : ZenDB.Database,
  admin : { assertAdmin : (Principal) -> () },
  deps : {
    findOwnerByCanister : (Principal) -> ?Principal;
    isKnownWasm : (Blob) -> Bool;
    hasUsedTrial : (Principal) -> Bool;
    markTrialUsed : (Principal) -> ();
  },
) {
  transient let subscriptions = Subscriptions.Subscriptions(db, deps.hasUsedTrial, deps.markTrialUsed);

  /// Expire overdue subscriptions. Available to other mixins in the actor.
  func expireOverdueSubscriptions() : [Principal] {
    subscriptions.expireOverdue();
  };

  /// Activate subscription internally (available to sibling mixins like PaymentsMixin).
  func activateSubscriptionInternal(userId : Principal, plan : Subscriptions.Plan, expiresAt : ?Int) : Result.Result<(), Subscriptions.ActivateError> {
    subscriptions.activateSubscription(userId, plan, expiresAt);
  };

  /// Get subscriptions expiring within hoursAhead hours. For auto-renew timer.
  func getExpiringSubscriptions(hoursAhead : Nat) : [(Principal, Subscriptions.Subscription)] {
    subscriptions.getExpiring(hoursAhead);
  };

  /// Get expired subscriptions (for grace period downgrade).
  func getExpiredSubscriptions() : [(Principal, Subscriptions.Subscription)] {
    subscriptions.getExpired();
  };

  /// Called by storage canister (caller = canisterId) to check subscription status
  public shared ({ caller }) func checkSubscription(wasmHash : Blob) : async Subscriptions.SubscriptionCheckResult {
    let ?owner = deps.findOwnerByCanister(caller) else return #unknownCanister;

    if (not deps.isKnownWasm(wasmHash)) return #invalidWasm;

    switch (subscriptions.getSubscription(owner)) {
      case null #free;
      case (?sub) {
        switch (sub.status) {
          case (#Expired or #Cancelled) #expired;
          case (#Active) {
            switch (sub.plan) {
              case (#Trial) #trial({
                remainingBytes = if (sub.trialUsedBytes >= Subscriptions.TRIAL_LIMIT_BYTES) 0
                  else Subscriptions.TRIAL_LIMIT_BYTES - sub.trialUsedBytes;
              });
              case (#Free) #free;
              case _ #active({ plan = sub.plan });
            };
          };
        };
      };
    };
  };

  /// Renew an Active/Expired subscription with new expiry. For auto-renew.
  func renewSubscriptionInternal(userId : Principal, plan : Subscriptions.Plan, expiresAt : ?Int) : Result.Result<(), Text> {
    subscriptions.renewSubscription(userId, plan, expiresAt);
  };

  /// Internal: get subscription for a user. Available to sibling mixins.
  func getSubscriptionInternal(userId : Principal) : ?Subscriptions.Subscription {
    subscriptions.getSubscription(userId);
  };

  public query ({ caller }) func getSubscription() : async ?Subscriptions.Subscription {
    assert not Principal.isAnonymous(caller);
    subscriptions.getSubscription(caller);
  };

  public shared ({ caller }) func activateTrial() : async () {
    assert not Principal.isAnonymous(caller);
    let #err(e) = subscriptions.activateTrial(caller) else return;
    throw Error.reject(debug_show e);
  };

  // Admin-only methods
  public shared ({ caller }) func activateSubscription(
    userId : Principal,
    plan : Subscriptions.Plan,
    expiresAt : ?Int,
  ) : async () {
    admin.assertAdmin(caller);
    let #err(e) = subscriptions.activateSubscription(userId, plan, expiresAt) else return;
    throw Error.reject(debug_show e);
  };

  public query ({ caller }) func listSubscriptions(
    options : Subscriptions.ListOptions,
  ) : async Subscriptions.GetSubscriptionsResponse {
    admin.assertAdmin(caller);
    subscriptions.list(options);
  };

  /// Called by storage canister to report trial bytes usage
  public shared ({ caller }) func reportTrialBytes(bytes : Nat) : async () {
    let ?reportOwner = deps.findOwnerByCanister(caller) else return;
    subscriptions.recordTrialBytes(reportOwner, bytes);
  };
};
