import Array "mo:core/Array";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import TreasuryTypes "mo:treasury/Types";

import Balance "lib";
import Settings "../Settings/lib";
import Subscriptions "../Subscriptions/lib";
import Notifications "../Notifications/lib";
import Users "../Users/lib";

mixin(
  getUserSettings : (Principal) -> Settings.UserSettings,
  getExpiringSubscriptions : (Nat) -> [(Principal, Subscriptions.Subscription)],
  getAmbassadorChain : (Principal) -> Users.AmbassadorChain,
  activateSubscriptionInternal : (Principal, Subscriptions.Plan, ?Int) -> Result.Result<(), Subscriptions.ActivateError>,
  notifyUser : (Principal, Notifications.TypedEvent) -> (),
  treasuryChargeAndDistribute : (TreasuryTypes.ChargeAndDistributeArgs) -> async* TreasuryTypes.ChargeAndDistributeResult,
  treasuryGetUserBalances : (Principal) -> async* [TreasuryTypes.BalanceEntry],
) {
  // ---- Charge for service ----

  /// Charge user for a service. Tries each token in spending priority order.
  /// Stablecoins are charged 1:1 (USD cents → 6 decimal token).
  /// ICP/ETH/SOL require exchange rate lookup (TODO: XRC integration).
  func chargeForService(
    userId : Principal,
    usdAmountCents : Nat,
    purpose : Text,
    paymentId : Text,
  ) : async* Balance.ChargeResult {
    let settings = getUserSettings(userId);
    let balances = await* treasuryGetUserBalances(userId);

    label priorities for (tokenId in settings.spendingPriority.vals()) {
      // Convert USD to token amount (only stablecoins for now)
      let tokenAmount = if (Balance.isStablecoin(tokenId)) {
        Balance.usdCentsToStablecoin(usdAmountCents);
      } else {
        // TODO: For ICP use CMC get_icp_xdr_conversion_rate
        // TODO: For ETH/SOL use XRC
        // Skip non-stablecoin tokens if no rate available
        continue priorities;
      };

      // Check if user has enough of this token
      let userBalance = findBalance(balances, tokenId);
      if (userBalance >= tokenAmount) {
        let chain = getAmbassadorChain(userId);
        let result = await* treasuryChargeAndDistribute({
          paymentId;
          userId;
          tokenId;
          totalAmount = tokenAmount;
          ambassadorL1 = chain.l1;
          ambassadorL2 = chain.l2;
          metadata = ?purpose;
        });
        switch (result) {
          case (#ok(_)) return #ok({ tokenId; amount = tokenAmount });
          case (#err(#PartiallyCompleted(_))) return #ok({ tokenId; amount = tokenAmount });
          case (#err(_)) {}; // Try next token
        };
      };
    };

    #insufficientFunds({ required = usdAmountCents });
  };

  func findBalance(balances : [TreasuryTypes.BalanceEntry], tokenId : TreasuryTypes.TokenId) : Nat {
    for (entry in balances.vals()) {
      if (entry.tokenId == tokenId) return entry.balance;
    };
    0;
  };

  // ---- Auto-renew ----

  /// Process subscription auto-renewals. Called from daily timer.
  /// Error boundary per user — one user's failure doesn't stop the batch.
  func processAutoRenewals() : async () {
    let expiring = getExpiringSubscriptions(24);

    label renewals for ((userId, sub) in expiring.vals()) {
      try {
        let settings = getUserSettings(userId);
        if (not settings.autoRenew) continue renewals;

        let (amountCents, plan) : (Nat, Subscriptions.Plan) = switch (sub.plan) {
          case (#Pro) (990, #Pro); // $9.90
          case _ continue renewals; // Only Pro has auto-renew
        };

        let paymentId = "auto_" # Principal.toText(userId) # "_" # Int.toText(Time.now());
        let result = await* chargeForService(userId, amountCents, "auto_renew", paymentId);

        switch (result) {
          case (#ok(_)) {
            let thirtyDays = 30 * 24 * 60 * 60 * 1_000_000_000;
            ignore activateSubscriptionInternal(userId, plan, ?(Time.now() + thirtyDays));
            notifyUser(userId, #subscriptionRenewed({ plan; expiresAt = ?(Time.now() + thirtyDays) }));
          };
          case (#insufficientFunds(details)) {
            notifyUser(userId, #balanceLow({ requiredAmount = details.required }));
          };
          case (#err(msg)) {
            notifyUser(userId, #autoRenewFailed({ reason = msg }));
          };
        };
      } catch (e) {
        // Error boundary: trap in one user doesn't kill the batch
      };
    };

    // Grace period: downgrade subscriptions expired > 3 days with no successful renewal
    let expiredGrace = getExpiringSubscriptions(0); // already expired
    let threeDays = 3 * 24 * 60 * 60 * 1_000_000_000;
    for ((userId, sub) in expiredGrace.vals()) {
      switch (sub.expiresAt) {
        case (?exp) {
          if (Time.now() - exp > threeDays) {
            ignore activateSubscriptionInternal(userId, #Free, null);
            notifyUser(userId, #subscriptionExpired);
          };
        };
        case null {};
      };
    };
  };

  // ---- Top-up from balance ----

  /// Top up a storage canister's cycles from user's balance.
  /// Uses backend's ICP reserve for the CMC conversion.
  public shared ({ caller }) func topUpFromBalance(
    canisterId : Principal,
    cyclesAmount : Nat,
  ) : async Result.Result<(), Text> {
    assert not Principal.isAnonymous(caller);
    // TODO: Phase 2 implementation
    // 1. Verify caller owns canisterId (StorageDeployer registry)
    // 2. Calculate ICP needed from CMC rate
    // 3. chargeForService(caller, usdEquivalent, "top_up", ...)
    // 4. Use backend ICP reserve → CMC → notify_top_up
    // 5. If backend ICP insufficient → enqueue TopUpRequest
    #err("Not implemented yet — Phase 2");
  };
};
