import Debug "mo:core/Debug";
import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Set "mo:core/Set";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import Vector "mo:vector";

import TreasuryTypes "mo:treasury/Types";

import Balance "lib";
import Settings "../Settings/lib";
import Subscriptions "../Subscriptions/lib";
import Notifications "../Notifications/lib";
import Users "../Users/lib";

mixin (
  admin : { assertAdmin : (Principal) -> () },
  subscriptions : {
    getExpiring : (Nat) -> [(Principal, Subscriptions.Subscription)];
    getExpired : () -> [(Principal, Subscriptions.Subscription)];
    activate : (Principal, Subscriptions.Plan, ?Int) -> Result.Result<(), Subscriptions.ActivateError>;
    renew : (Principal, Subscriptions.Plan, ?Int) -> Result.Result<(), Text>;
    get : (Principal) -> ?Subscriptions.Subscription;
  },
  treasury : {
    chargeAndDistribute : (TreasuryTypes.ChargeAndDistributeArgs) -> async* TreasuryTypes.ChargeAndDistributeResult;
    getBalance : (Principal, TreasuryTypes.TokenId) -> async* Nat;
    simpleTransfer : (Principal, TreasuryTypes.TokenId, Nat) -> async* Result.Result<Nat, Text>;
    simpleRefund : (Principal, TreasuryTypes.TokenId, Nat) -> async* Result.Result<(), Text>;
  },
  rates : {
    getIcpXdrRate : () -> async Nat;
    getXrcRate : (Text, Text) -> async ?(Nat64, Nat32);
  },
  deps : {
    getUserSettings : (Principal) -> Settings.UserSettings;
    getAmbassadorChain : (Principal) -> Users.AmbassadorChain;
    notifyUser : (Principal, Notifications.TypedEvent) -> ();
    verifyCanisterOwner : (Principal, Principal) -> Bool;
    transferIcpToCmc : (Nat, Principal) -> async Result.Result<Nat, Text>;
    notifyTopUp : (Nat64, Principal) -> async Result.Result<Nat, Text>;
  },
) {
  // ---- Rate fetching ----

  func fetchRates(
    priorities : [TreasuryTypes.TokenId]
  ) : async* {
    icpUsdRate : ?Balance.XrcRate;
    ethRate : ?Balance.XrcRate;
    solRate : ?Balance.XrcRate;
  } {
    var icpUsdRate : ?Balance.XrcRate = null;
    var ethRate : ?Balance.XrcRate = null;
    var solRate : ?Balance.XrcRate = null;

    var needIcp = false;
    var needEth = false;
    var needSol = false;

    for (tokenId in priorities.vals()) {
      switch (tokenId) {
        case (#ICP) needIcp := true;
        case (#ckETH or #BaseETH) { needEth := true };
        case (#SOL) needSol := true;
        case _ {};
      };
    };

    if (needIcp) { icpUsdRate := await rates.getXrcRate("ICP", "USD") };
    if (needEth) { ethRate := await rates.getXrcRate("ETH", "USD") };
    if (needSol) { solRate := await rates.getXrcRate("SOL", "USD") };

    { icpUsdRate; ethRate; solRate };
  };

  /// Convert USD cents to token amount for a given token using pre-fetched rates.
  func usdCentsToToken(
    usdAmountCents : Nat,
    tokenId : TreasuryTypes.TokenId,
    fetchedRates : {
      icpUsdRate : ?Balance.XrcRate;
      ethRate : ?Balance.XrcRate;
      solRate : ?Balance.XrcRate;
    },
  ) : ?Nat {
    if (Balance.isStablecoin(tokenId)) {
      ?Balance.usdCentsToStablecoin(usdAmountCents);
    } else {
      switch (tokenId) {
        case (#ICP) {
          switch (fetchedRates.icpUsdRate) {
            case (?rate) ?Balance.usdCentsToIcpE8s(usdAmountCents, rate);
            case null null;
          };
        };
        case (#ckETH or #BaseETH) {
          switch (fetchedRates.ethRate) {
            case (?(rate, decimals)) ?Balance.usdCentsToTokenAmount(usdAmountCents, rate, decimals, Balance.tokenDecimals(tokenId));
            case null null;
          };
        };
        case (#SOL) {
          switch (fetchedRates.solRate) {
            case (?(rate, decimals)) ?Balance.usdCentsToTokenAmount(usdAmountCents, rate, decimals, Balance.tokenDecimals(tokenId));
            case null null;
          };
        };
        case _ null;
      };
    };
  };

  // ---- Charge for service (with ambassador distribution) ----

  /// Charge user for a subscription/license. Tries each token in spending priority order.
  /// Distributes to treasury + ambassadors (80/15/5).
  func chargeForService(
    userId : Principal,
    usdAmountCents : Nat,
    purpose : Text,
    paymentId : Text,
  ) : async* Balance.ChargeResult {
    let settings = deps.getUserSettings(userId);
    let rates = await* fetchRates(settings.spendingPriority);

    label priorities for (tokenId in settings.spendingPriority.vals()) {
      let ?tokenAmount = usdCentsToToken(usdAmountCents, tokenId, rates) else continue priorities;

      let userBalance = try { await* treasury.getBalance(userId, tokenId) } catch (_) {
        0;
      };
      if (userBalance >= tokenAmount) {
        let chain = deps.getAmbassadorChain(userId);
        let result = await* treasury.chargeAndDistribute({
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
          case (#err(#PartiallyCompleted(record))) {
            Debug.print("chargeForService: partial distribution for paymentId=" # paymentId # " tokenId=" # debug_show tokenId # " — check distributionLog for details");
            return #ok({ tokenId; amount = tokenAmount });
          };
          case (#err(_)) {};
        };
      };
    };

    #insufficientFunds({ required = usdAmountCents });
  };

  // ---- Simple charge for top-up (no ambassador split) ----

  /// Charge user for top-up. 100% to admin, no ambassador distribution.
  /// Supports partial fill: if user can't afford targetCycles, charges for maxCycles they can afford.
  /// Returns (tokenId, amount charged, actualCycles).
  func simpleChargeForTopUp(
    userId : Principal,
    targetCycles : Nat,
    xdrPermyriadPerIcp : Nat,
    icpUsdRate : Balance.XrcRate,
  ) : async* Result.Result<{ tokenId : TreasuryTypes.TokenId; amount : Nat; actualCycles : Nat }, Text> {
    let settings = deps.getUserSettings(userId);
    let fetchedRates = await* fetchRates(settings.spendingPriority);
    let targetUsdCents = Balance.cyclesToUsdCents(targetCycles, xdrPermyriadPerIcp, icpUsdRate);

    label priorities for (tokenId in settings.spendingPriority.vals()) {
      let ?fullTokenAmount = usdCentsToToken(targetUsdCents, tokenId, fetchedRates) else continue priorities;

      let userBalance = try { await* treasury.getBalance(userId, tokenId) } catch (_) {
        0;
      };
      if (userBalance == 0) continue priorities;

      // Determine actual charge: full or partial
      // Note: treasurySimpleTransfer deducts fee, so effective amount = chargeAmount - fee
      let fee = Balance.getIcTokenFee(tokenId);
      let (chargeAmount, actualCycles) = if (userBalance >= fullTokenAmount) {
        (fullTokenAmount, targetCycles);
      } else {
        // Partial fill: charge entire balance, calculate cycles it buys
        // Account for fee: effective amount after transfer = userBalance - fee
        let effectiveBalance = if (userBalance > fee) { userBalance - fee } else {
          continue priorities;
        };
        let partialCycles = if (Balance.isStablecoin(tokenId)) {
          let partialUsdCents = effectiveBalance / 10_000; // 6 decimals → cents
          if (partialUsdCents == 0) continue priorities;
          Balance.usdCentsToCycles(partialUsdCents, xdrPermyriadPerIcp, icpUsdRate);
        } else {
          switch (tokenId) {
            case (#ICP) Balance.icpE8sToCycles(effectiveBalance, xdrPermyriadPerIcp);
            case (#ckETH or #BaseETH) {
              switch (fetchedRates.ethRate) {
                case (?(rate, decimals)) {
                  let partialUsdCents = Balance.tokenAmountToUsdCents(effectiveBalance, rate, decimals, Balance.tokenDecimals(tokenId));
                  if (partialUsdCents == 0) continue priorities;
                  Balance.usdCentsToCycles(partialUsdCents, xdrPermyriadPerIcp, icpUsdRate);
                };
                case null continue priorities;
              };
            };
            case (#SOL) {
              switch (fetchedRates.solRate) {
                case (?(rate, decimals)) {
                  let partialUsdCents = Balance.tokenAmountToUsdCents(effectiveBalance, rate, decimals, Balance.tokenDecimals(tokenId));
                  if (partialUsdCents == 0) continue priorities;
                  Balance.usdCentsToCycles(partialUsdCents, xdrPermyriadPerIcp, icpUsdRate);
                };
                case null continue priorities;
              };
            };
            case _ continue priorities;
          };
        };
        if (partialCycles == 0) continue priorities;
        (userBalance, partialCycles);
      };

      // Execute simple transfer (user → admin, no split)
      let result = await* treasury.simpleTransfer(userId, tokenId, chargeAmount);
      switch (result) {
        case (#ok(_)) return #ok({
          tokenId;
          amount = chargeAmount;
          actualCycles;
        });
        case (#err(_)) {}; // Try next token
      };
    };

    #err("Insufficient balance for top-up");
  };

  // ---- Pending refunds (persistent across upgrades) ----

  public type PendingRefund = {
    userId : Principal;
    tokenId : TreasuryTypes.TokenId;
    amount : Nat;
    reason : Text;
    createdAt : Int;
  };

  var pendingRefunds = Vector.new<PendingRefund>();

  let MAX_PENDING_REFUNDS : Nat = 1000;

  /// Attempt refund; if it fails, enqueue for admin retry.
  func safeRefund(userId : Principal, tokenId : TreasuryTypes.TokenId, amount : Nat, reason : Text) : async* () {
    switch (await* treasury.simpleRefund(userId, tokenId, amount)) {
      case (#ok()) {};
      case (#err(msg)) {
        Debug.print("Refund failed, enqueuing: user=" # Principal.toText(userId) # " amount=" # Nat.toText(amount) # " err=" # msg);
        if (Vector.size(pendingRefunds) >= MAX_PENDING_REFUNDS) {
          Debug.print("WARNING: pendingRefunds queue full (" # Nat.toText(MAX_PENDING_REFUNDS) # "), dropping refund");
          return;
        };
        Vector.add(
          pendingRefunds,
          {
            userId;
            tokenId;
            amount;
            reason = reason # " (refund error: " # msg # ")";
            createdAt = Time.now();
          },
        );
      };
    };
  };

  /// Admin: list pending refunds.
  public shared query ({ caller }) func getPendingRefunds() : async [PendingRefund] {
    admin.assertAdmin(caller);
    Vector.toArray(pendingRefunds);
  };

  /// Admin: process pending refunds manually.
  public shared ({ caller }) func processPendingRefunds() : async Nat {
    admin.assertAdmin(caller);
    var processed : Nat = 0;
    let remaining = Vector.new<PendingRefund>();

    for (refund in Vector.vals(pendingRefunds)) {
      switch (await* treasury.simpleRefund(refund.userId, refund.tokenId, refund.amount)) {
        case (#ok()) { processed += 1 };
        case (#err(_)) { Vector.add(remaining, refund) };
      };
    };

    pendingRefunds := remaining;
    processed;
  };

  // ---- Payment ID counter ----

  var nextPaymentId : Nat = 0;

  func generatePaymentId(prefix : Text, userId : Principal) : Text {
    let id = nextPaymentId;
    nextPaymentId += 1;
    prefix # "_" # Principal.toText(userId) # "_" # Nat.toText(id);
  };

  // ---- Price constants (USD cents) ----

  let LICENSE_PRICE_CENTS : Nat = 490;   // $4.90
  let PRO_MONTHLY_PRICE_CENTS : Nat = 990; // $9.90

  // ---- Direct purchase (ICPay fallback) ----

  public type PurchaseError = {
    #InsufficientFunds : { required : Nat };
    #AlreadyActive;
    #InvalidPlan : Text;
    #ChargeFailed : Text;
    #ActivationFailed : Text;
  };

  /// Purchase a subscription by charging from user's deposited balance.
  /// ICPay fallback: user deposits tokens to their derived wallet, then calls this.
  public shared ({ caller }) func purchaseSubscription(
    plan : Subscriptions.Plan,
  ) : async Result.Result<(), PurchaseError> {
    assert not Principal.isAnonymous(caller);

    // Validate plan
    let (amountCents, expiresAt) : (Nat, ?Int) = switch (plan) {
      case (#License) (LICENSE_PRICE_CENTS, null);
      case (#Pro) {
        let thirtyDays = 30 * 24 * 60 * 60 * 1_000_000_000;
        (PRO_MONTHLY_PRICE_CENTS, ?(Time.now() + thirtyDays));
      };
      case (#Free or #Trial) return #err(#InvalidPlan("Cannot purchase Free or Trial plans"));
    };

    // Check not already active
    switch (subscriptions.get(caller)) {
      case (?sub) {
        if (sub.status == #Active) return #err(#AlreadyActive);
      };
      case null {};
    };

    // Charge from balance (with ambassador distribution)
    let paymentId = generatePaymentId("purchase", caller);
    let chargeResult = await* chargeForService(caller, amountCents, debug_show plan, paymentId);

    switch (chargeResult) {
      case (#ok(charged)) {
        switch (subscriptions.activate(caller, plan, expiresAt)) {
          case (#ok()) {
            deps.notifyUser(caller, #subscriptionActivated({ plan }));
            #ok();
          };
          case (#err(e)) {
            // Charge succeeded but activation failed — refund
            await* safeRefund(caller, charged.tokenId, charged.amount, "purchaseSubscription activation failed");
            #err(#ActivationFailed(debug_show e));
          };
        };
      };
      case (#insufficientFunds(details)) {
        #err(#InsufficientFunds({ required = details.required }));
      };
      case (#err(msg)) {
        #err(#ChargeFailed(msg));
      };
    };
  };

  // ---- Auto-renew ----

  func processAutoRenewals() : async () {
    let expiring = subscriptions.getExpiring(24);

    label renewals for ((userId, sub) in expiring.vals()) {
      try {
        let settings = deps.getUserSettings(userId);
        if (not settings.autoRenew) continue renewals;

        let (amountCents, plan) : (Nat, Subscriptions.Plan) = switch (sub.plan) {
          case (#Pro) (990, #Pro);
          case _ continue renewals;
        };

        let paymentId = generatePaymentId("auto", userId);
        let result = await* chargeForService(userId, amountCents, "auto_renew", paymentId);

        switch (result) {
          case (#ok(charged)) {
            let thirtyDays = 30 * 24 * 60 * 60 * 1_000_000_000;
            let newExpiry = Time.now() + thirtyDays;
            switch (subscriptions.renew(userId, plan, ?newExpiry)) {
              case (#ok()) {
                deps.notifyUser(userId, #subscriptionRenewed({ plan; expiresAt = ?newExpiry }));
              };
              case (#err(msg)) {
                // Charge succeeded but renewal failed — refund the user
                await* safeRefund(userId, charged.tokenId, charged.amount, "renewal failed after charge: " # msg);
                deps.notifyUser(userId, #autoRenewFailed({ reason = "Charged but renewal failed, refund initiated: " # msg }));
              };
            };
          };
          case (#insufficientFunds(details)) {
            deps.notifyUser(userId, #balanceLow({ requiredAmount = details.required }));
          };
          case (#err(msg)) {
            deps.notifyUser(userId, #autoRenewFailed({ reason = msg }));
          };
        };
      } catch (e) {
        Debug.print("processAutoRenewals error for user " # Principal.toText(userId) # ": " # Error.message(e));
      };
    };

    // Grace period: downgrade subscriptions expired > 3 days
    let expiredGrace = subscriptions.getExpired();
    let threeDays = 3 * 24 * 60 * 60 * 1_000_000_000;
    for ((userId, sub) in expiredGrace.vals()) {
      switch (sub.expiresAt) {
        case (?exp) {
          if (Time.now() - exp >= threeDays) {
            ignore subscriptions.activate(userId, #Free, null);
            deps.notifyUser(userId, #subscriptionExpired);
          };
        };
        case null {};
      };
    };
  };

  public shared ({ caller }) func triggerAutoRenewals() : async () {
    admin.assertAdmin(caller);
    await processAutoRenewals();
  };

  // ---- Top-up from balance ----

  /// Top up a storage canister's cycles from user's balance.
  /// Flow: charge user (simple, no split) → ICP to CMC → cycles.
  /// Supports partial fill if user can't afford full amount.
  /// Refunds on CMC failure.
  public shared ({ caller }) func topUpFromBalance(
    canisterId : Principal,
    cyclesAmount : Nat,
  ) : async Result.Result<{ cyclesAdded : Nat }, Text> {
    assert not Principal.isAnonymous(caller);

    if (cyclesAmount == 0) return #err("Cycles amount must be greater than zero");

    if (not deps.verifyCanisterOwner(canisterId, caller)) {
      return #err("You do not own this canister");
    };

    // 1. Get rates (CMC for cycles↔ICP, XRC for ICP↔USD)
    let xdrPermyriadPerIcp = await rates.getIcpXdrRate();
    let ?icpUsdRate = await rates.getXrcRate("ICP", "USD") else return #err("Failed to fetch ICP/USD rate");

    // 2. Charge user (simple transfer, supports partial fill)
    let chargeResult = await* simpleChargeForTopUp(caller, cyclesAmount, xdrPermyriadPerIcp, icpUsdRate);
    let charged = switch (chargeResult) {
      case (#ok(info)) info;
      case (#err(msg)) return #err(msg);
    };

    // 3. Transfer ICP to CMC
    let icpE8sNeeded = Balance.cyclesToIcpE8s(charged.actualCycles, xdrPermyriadPerIcp);
    let transferResult = await deps.transferIcpToCmc(icpE8sNeeded + Balance.LEDGER_FEE, canisterId);
    let blockIndex = switch (transferResult) {
      case (#ok(idx)) idx;
      case (#err(msg)) {
        // Refund user — simple reverse transfer (100%, no ambassador complication)
        await* safeRefund(caller, charged.tokenId, charged.amount, "topUp CMC failure");
        deps.notifyUser(caller, #topUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
        return #err("ICP transfer to CMC failed: " # msg);
      };
    };

    // 4. Notify CMC to deposit cycles
    let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
    switch (topUpResult) {
      case (#ok(_cycles)) {
        deps.notifyUser(caller, #topUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
        #ok({ cyclesAdded = charged.actualCycles });
      };
      case (#err(msg)) {
        // Refund user — ICP is on CMC subaccount (can be retried with same block_index)
        await* safeRefund(caller, charged.tokenId, charged.amount, "topUp CMC failure");
        deps.notifyUser(caller, #topUpFailed({ canisterId; reason = "CMC notify failed: " # msg }));
        #err("CMC top-up notification failed: " # msg);
      };
    };
  };

  // ---- Auto top-up (triggered by storage canister) ----

  transient let autoTopUpInFlight = Set.empty<Principal>(); // canisters currently being topped up

  /// Called from onStorageLowCycles. Checks user settings and auto-tops up if enabled.
  /// Uses in-flight lock to prevent duplicate top-ups from concurrent callbacks.
  func processAutoTopUp(
    storageOwner : Principal,
    canisterId : Principal,
    currentBalance : Nat,
    severity : { #warning; #critical },
  ) : async () {
    let settings = deps.getUserSettings(storageOwner);
    if (not settings.autoTopUp) return;

    // In-flight lock: skip if top-up already in progress for this canister
    if (Set.contains(autoTopUpInFlight, Principal.compare, canisterId)) return;
    Set.add(autoTopUpInFlight, Principal.compare, canisterId);

    // Pre-checks (before async work)
    let eligible = switch (subscriptions.get(storageOwner)) {
      case (?sub) {
        switch (sub.plan) {
          case (#Pro or #License) true;
          case _ false;
        };
      };
      case null false;
    };

    if (not eligible or settings.topUpAmountCycles == 0) {
      Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
      return;
    };

    // Track charge for refund in catch block
    var pendingCharge : ?{ tokenId : TreasuryTypes.TokenId; amount : Nat } = null;

    try {
      let xdrPermyriadPerIcp = await rates.getIcpXdrRate();
      let ?icpUsdRate = await rates.getXrcRate("ICP", "USD") else {
        deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "Failed to fetch ICP/USD rate" }));
        Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
        return;
      };

      let chargeResult = await* simpleChargeForTopUp(storageOwner, settings.topUpAmountCycles, xdrPermyriadPerIcp, icpUsdRate);
      let charged = switch (chargeResult) {
        case (#ok(info)) info;
        case (#err(_)) {
          deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "Insufficient balance" }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return;
        };
      };
      pendingCharge := ?{ tokenId = charged.tokenId; amount = charged.amount };

      let icpE8sNeeded = Balance.cyclesToIcpE8s(charged.actualCycles, xdrPermyriadPerIcp);
      let transferResult = await deps.transferIcpToCmc(icpE8sNeeded + Balance.LEDGER_FEE, canisterId);
      let blockIndex = switch (transferResult) {
        case (#ok(idx)) idx;
        case (#err(msg)) {
          pendingCharge := null; // refund handled below
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp ICP transfer failure");
          deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return;
        };
      };

      let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
      switch (topUpResult) {
        case (#ok(_)) {
          pendingCharge := null; // success, no refund needed
          deps.notifyUser(storageOwner, #autoTopUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
        };
        case (#err(msg)) {
          pendingCharge := null; // refund handled below
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp CMC notify failure");
          deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "CMC notify failed: " # msg }));
        };
      };
    } catch (e) {
      // If charge was made but not yet refunded, enqueue refund
      switch (pendingCharge) {
        case (?charge) {
          Vector.add(
            pendingRefunds,
            {
              userId = storageOwner;
              tokenId = charge.tokenId;
              amount = charge.amount;
              reason = "autoTopUp trap: " # Error.message(e);
              createdAt = Time.now();
            },
          );
        };
        case null {};
      };
      Debug.print("processAutoTopUp error: " # Error.message(e));
      deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "Internal error" }));
    };

    Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
  };
};
