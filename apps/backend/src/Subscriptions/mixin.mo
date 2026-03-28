import Error "mo:core/Error";
import Principal "mo:core/Principal";

import Subscriptions "lib";
import ZenDB "mo:zendb";

mixin(
  db : ZenDB.Database,
  findOwnerByCanister : (Principal) -> ?Principal,
  isKnownWasm : (Blob) -> Bool,
  assertAdmin : (Principal) -> (),
) {
  transient let subscriptions = Subscriptions.Subscriptions(db);

  /// Expire overdue subscriptions. Available to other mixins in the actor.
  func expireOverdueSubscriptions() : [Principal] {
    subscriptions.expireOverdue();
  };

  /// Called by storage canister (caller = canisterId) to check subscription status
  public shared ({ caller }) func checkSubscription(wasmHash : Blob) : async Subscriptions.SubscriptionCheckResult {
    // Resolve canister → owner (rejects both non-canister and unregistered callers)
    let ?owner = findOwnerByCanister(caller) else return #unknownCanister;

    // 2. Validate WASM hash
    if (not isKnownWasm(wasmHash)) return #invalidWasm;

    // 3. Check subscription
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
    assertAdmin(caller);
    let #err(e) = subscriptions.activateSubscription(userId, plan, expiresAt) else return;
    throw Error.reject(debug_show e);
  };

  public query ({ caller }) func listSubscriptions(
    options : Subscriptions.ListOptions,
  ) : async Subscriptions.GetSubscriptionsResponse {
    assertAdmin(caller);
    subscriptions.list(options);
  };

  /// Called by storage canister to report trial bytes usage
  public shared ({ caller }) func reportTrialBytes(bytes : Nat) : async () {
    let ?reportOwner = findOwnerByCanister(caller) else return;
    subscriptions.recordTrialBytes(reportOwner, bytes);
  };
};
