import Cycles "mo:core/Cycles";
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
import Timer "mo:core/Timer";

import Vector "mo:vector";

import TreasuryTypes "mo:treasury/Types";

import BackendEvents "../BackendEvents/lib";
import Balance "lib";
import CMCTypes "../Types/CMCTypes";
import CmcRecovery "../CmcRecovery/lib";
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
    grantPaidPeriod : (Principal, Subscriptions.Plan, Time.Time) -> Result.Result<Subscriptions.PaidPeriodResult, Text>;
  },
  treasury : {
    chargeAndDistribute : (TreasuryTypes.ChargeAndDistributeArgs) -> async* TreasuryTypes.ChargeAndDistributeResult;
    getBalance : (Principal, TreasuryTypes.TokenId) -> async* Nat;
    simpleTransfer : (Principal, TreasuryTypes.TokenId, Nat) -> async* Result.Result<Nat, Text>;
    simpleRefund : (Principal, TreasuryTypes.TokenId, Nat) -> async* Result.Result<(), Text>;
    /// Treasury ICP balance — used for reserve guards before CMC top-ups.
    getIcpBalance : () -> async* Nat;
  },
  rates : {
    getIcpXdrRate : () -> async Nat;
    getXrcRate : (Text, Text) -> async ?(Nat64, Nat32);
  },
  deps : {
    getUserSettings : (Principal) -> Settings.UserSettings;
    getAmbassadorChain : (Principal) -> Users.AmbassadorChain;
    events : BackendEvents.EventSink;
    verifyCanisterOwner : (Principal, Principal) -> Bool;
    /// Transfer ICP from the treasury subaccount to CMC for a target
    /// canister. Unified pool: user top-ups, auto top-ups, and backend
    /// self-topup all go through this. Caller must check treasury ICP
    /// balance has sufficient reserve (see `guardTreasuryIcpReserve`).
    transferIcpToCmc : (Nat, Principal) -> async Result.Result<Nat, Text>;
    /// Notify CMC of an ICP-for-cycles deposit. Returns `NotifyError` directly
    /// (not a flat Text) so caller can classify by variant — delegated to
    /// `cmcHandleNotifyError` below.
    notifyTopUp : (Nat64, Principal) -> async Result.Result<Nat, CMCTypes.NotifyError>;
    /// Single entry point for all CMC `NotifyError` handling (classify +
    /// refund OR enqueue pending op + admin notify). Wired from CmcRecovery
    /// mixin's internal `handleCmcNotifyError`.
    cmcHandleNotifyError : (CmcRecovery.CmcOpSource, Nat, ?CmcRecovery.RefundContext, CMCTypes.NotifyError) -> async* ();
    // Self-topup parameters — cycles.balance watermarks for the backend itself
    selfCanisterId : Principal;
    backendCyclesThreshold : Nat;
    backendCyclesTarget : Nat;
    onSubscriptionChanged : (Principal) -> async ();
  },
) {
  func emitBalanceNotification(recipient : Principal, event : Notifications.NotificationPayload) {
    deps.events.emit(#notificationRequested({ recipient; payload = event; correlationId = null }));
  };

  func emitBalanceAdminNotification(event : Notifications.NotificationPayload) {
    deps.events.emit(#adminNotificationRequested({ payload = event; correlationId = null }));
  };

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

  /// Charge user in priority-token order. Distributes 85/15/0 to
  /// treasury / L1 / L2. `onPhase` observes sub-steps.
  ///
  /// `deferAmbassadorPayout`: with true on IC tokens, charge goes 100% to
  /// treasury — ambassadors paid later via `distributeAmbassadorShare`.
  /// No-op for EVM/SOL (charge-time distribution).
  func chargeForService<system>(
    userId : Principal,
    usdAmountCents : Nat,
    purpose : Text,
    paymentId : Text,
    onPhase : (Balance.ChargePhase) -> (),
    deferAmbassadorPayout : Bool,
  ) : async* Balance.ChargeResult {
    // Opportunistic self-topup before heavy outcalls (XRC + per-token balance
    // checks + ambassador distribution). Fire-and-forget.
    maybeTopUpSelf<system>();

    let logPrefix = "[charge " # paymentId # "] ";
    Debug.print(logPrefix # "start user=" # Principal.toText(userId) # " usdCents=" # Nat.toText(usdAmountCents) # " purpose=" # purpose);

    let settings = deps.getUserSettings(userId);
    Debug.print(logPrefix # "spendingPriority=" # debug_show settings.spendingPriority);

    onPhase(#fetchingRates);
    let rates = await* fetchRates(settings.spendingPriority);
    Debug.print(logPrefix # "rates icp=" # debug_show rates.icpUsdRate # " eth=" # debug_show rates.ethRate # " sol=" # debug_show rates.solRate);

    onPhase(#checkingBalances);
    label priorities for (tokenId in settings.spendingPriority.vals()) {
      let ?tokenAmount = usdCentsToToken(usdAmountCents, tokenId, rates) else {
        Debug.print(logPrefix # "skip " # debug_show tokenId # ": no rate (usdCentsToToken=null)");
        continue priorities;
      };

      let userBalance = try { await* treasury.getBalance(userId, tokenId) } catch (e) {
        Debug.print(logPrefix # "getBalance trap for " # debug_show tokenId # ": " # Error.message(e));
        0;
      };
      Debug.print(logPrefix # debug_show tokenId # " balance=" # Nat.toText(userBalance) # " required=" # Nat.toText(tokenAmount));

      if (userBalance >= tokenAmount) {
        onPhase(#charging({ tokenId; amount = tokenAmount }));
        let chain = deps.getAmbassadorChain(userId);
        // Skip ambassador split at charge when caller asked to defer AND we
        // picked an IC token (EVM/SOL keep charge-time distribution).
        let deferred = deferAmbassadorPayout and Balance.isIcToken(tokenId);
        let (l1, l2) = if (deferred) (null, null) else (chain.l1, chain.l2);
        Debug.print(logPrefix # "attempting chargeAndDistribute with " # debug_show tokenId # " amount=" # Nat.toText(tokenAmount) # " deferred=" # debug_show deferred);
        let result = await* treasury.chargeAndDistribute({
          paymentId;
          userId;
          tokenId;
          totalAmount = tokenAmount;
          ambassadorL1 = l1;
          ambassadorL2 = l2;
          metadata = ?purpose;
        });
        switch (result) {
          case (#ok(_)) {
            Debug.print(logPrefix # "SUCCESS charged " # debug_show tokenId # " amount=" # Nat.toText(tokenAmount));
            return #ok({ tokenId; amount = tokenAmount });
          };
          case (#err(#PartiallyCompleted(record))) {
            Debug.print(logPrefix # "partial distribution tokenId=" # debug_show tokenId # " — check distributionLog");
            return #ok({ tokenId; amount = tokenAmount });
          };
          case (#err(e)) {
            Debug.print(logPrefix # "chargeAndDistribute err for " # debug_show tokenId # ": " # debug_show e);
          };
        };
      } else {
        Debug.print(logPrefix # "insufficient " # debug_show tokenId # ": have " # Nat.toText(userBalance) # " < need " # Nat.toText(tokenAmount));
      };
    };

    Debug.print(logPrefix # "INSUFFICIENT_FUNDS — no token in priority had enough balance");
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

  /// Minimum ICP balance kept on treasury subaccount after any CMC top-up
  /// debit — buffer for pending refunds, ambassador payouts, and stuck
  /// CMC notifications that also draw from treasury. Tune via upgrade.
  ///
  /// TODO: replace static constant with dynamic sum of actual pending
  /// refund/payout obligations via ZenDB queries.
  transient let TREASURY_ICP_RESERVE : Nat = 10 * 100_000_000; // 10 ICP

  /// Check that debiting `required` e8s from treasury ICP won't put the
  /// balance below `TREASURY_ICP_RESERVE`. Returns `?currentBalance` if
  /// the reserve would be violated (caller should reject + notify admin),
  /// `null` if OK to proceed.
  func guardTreasuryIcpReserve(required : Nat) : async* ?Nat {
    let balance = await* treasury.getIcpBalance();
    if (balance < required + TREASURY_ICP_RESERVE) {
      ?balance;
    } else {
      null;
    };
  };

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

  // ---- Auto-renew in-flight lock ----

  transient let renewalsInFlight = Set.empty<Principal>();

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

  /// Charge for a license from user's deposited balance.
  /// Returns the charged token, amount, and paymentId, or an error.
  /// `onPhase` is forwarded to chargeForService so the caller can observe
  /// `#fetchingRates` → `#checkingBalances` → `#charging` transitions.
  func chargeForLicense<system>(
    userId : Principal,
    onPhase : (Balance.ChargePhase) -> (),
  ) : async* Balance.ChargeResultWithId {
    let paymentId = generatePaymentId("license", userId);
    // License is refundable while the storage canister isn't created yet —
    // defer ambassador payout until finalizeCompletion flips status to
    // #Completed (see StorageDeployer orchestrator).
    let result = await* chargeForService(userId, LICENSE_PRICE_CENTS, "license", paymentId, onPhase, true);
    switch (result) {
      case (#ok(charged)) #ok({ tokenId = charged.tokenId; amount = charged.amount; paymentId });
      case (#insufficientFunds(details)) #insufficientFunds(details);
      case (#err(msg)) #err(msg);
    };
  };

  /// Internal: purchase a subscription for a given userId.
  /// Repeat-purchase safe: Active Pro → extends by 30d from current expiresAt.
  func purchaseSubscriptionInternal(
    userId : Principal,
    plan : Subscriptions.Plan,
  ) : async* Result.Result<(), PurchaseError> {
    // Validate plan — only paid plans allowed
    let amountCents = switch (plan) {
      case (#Pro) PRO_MONTHLY_PRICE_CENTS;
      case (#Free or #Trial) return #err(#InvalidPlan("Cannot purchase Free or Trial plans"));
    };

    // Charge from balance (with ambassador distribution — subscription is
    // non-refundable so ambassadors receive their share at charge time).
    let paymentId = generatePaymentId("purchase", userId);
    let chargeResult = await* chargeForService(userId, amountCents, debug_show plan, paymentId, func(_) {}, false);

    switch (chargeResult) {
      case (#ok(charged)) {
        switch (subscriptions.grantPaidPeriod(userId, plan, Subscriptions.THIRTY_DAYS_NS)) {
          case (#ok(result)) {
            switch (result.action) {
              case (#Created or #Reactivated) emitBalanceNotification(userId, #subscriptionActivated({ plan }));
              case (#Renewed) emitBalanceNotification(userId, #subscriptionRenewed({ plan; expiresAt = ?result.expiresAt }));
            };
            await deps.onSubscriptionChanged(userId);
            #ok();
          };
          case (#err(e)) {
            // Charge succeeded but grant failed — refund
            await* safeRefund(userId, charged.tokenId, charged.amount, "purchaseSubscription grantPaidPeriod failed");
            #err(#ActivationFailed(e));
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

  /// Purchase a subscription by charging from user's deposited balance.
  /// ICPay fallback: user deposits tokens to their derived wallet, then calls this.
  public shared ({ caller }) func purchaseSubscription(
    plan : Subscriptions.Plan,
  ) : async Result.Result<(), PurchaseError> {
    assert not Principal.isAnonymous(caller);
    await* purchaseSubscriptionInternal(caller, plan);
  };

  // ---- Auto-renew ----

  /// Process a single user's auto-renewal. Runs in its own timer message
  /// to stay within the per-message instruction limit (important for EVM/SOL RPC calls).
  func processOneRenewal(userId : Principal, plan : Subscriptions.Plan, amountCents : Nat) : async () {
    try {
      let paymentId = generatePaymentId("auto", userId);
      // Auto-renew is non-refundable — distribute ambassadors at charge time.
      let result = await* chargeForService(userId, amountCents, "auto_renew", paymentId, func(_) {}, false);

      switch (result) {
        case (#ok(charged)) {
          switch (subscriptions.grantPaidPeriod(userId, plan, Subscriptions.THIRTY_DAYS_NS)) {
            case (#ok(grantResult)) {
              switch (grantResult.action) {
                case (#Renewed) emitBalanceNotification(userId, #subscriptionRenewed({ plan; expiresAt = ?grantResult.expiresAt }));
                case (#Created or #Reactivated) emitBalanceNotification(userId, #subscriptionActivated({ plan }));
              };
              await deps.onSubscriptionChanged(userId);
            };
            case (#err(msg)) {
              // Charge succeeded but grant failed — refund the user
              await* safeRefund(userId, charged.tokenId, charged.amount, "renewal failed after charge: " # msg);
              emitBalanceNotification(userId, #autoRenewFailed({ reason = "Charged but renewal failed, refund initiated: " # msg }));
            };
          };
        };
        case (#insufficientFunds(details)) {
          emitBalanceNotification(userId, #balanceLow({ requiredAmount = details.required }));
        };
        case (#err(msg)) {
          emitBalanceNotification(userId, #autoRenewFailed({ reason = msg }));
        };
      };
    } catch (e) {
      Debug.print("processOneRenewal error for user " # Principal.toText(userId) # ": " # Error.message(e));
    };
  };

  /// Schedule per-user renewal timers + handle grace period downgrades.
  /// Each renewal runs in a separate message to avoid exceeding instruction limits
  /// when routing through EVM RPC or Solana RPC.
  func processAutoRenewals<system>() {
    let expiring = subscriptions.getExpiring(24);

    for ((userId, sub) in expiring.vals()) {
      if (Set.contains(renewalsInFlight, Principal.compare, userId)) continue;

      let settings = deps.getUserSettings(userId);
      if (not settings.autoRenew) continue;

      let (amountCents, plan) : (Nat, Subscriptions.Plan) = switch (sub.plan) {
        case (#Pro) (990, #Pro);
        case _ continue;
      };

      Set.add(renewalsInFlight, Principal.compare, userId);

      ignore Timer.setTimer<system>(#seconds 0, func() : async () {
        await processOneRenewal(userId, plan, amountCents);
        ignore Set.delete(renewalsInFlight, Principal.compare, userId);
      });
    };

    // Grace period: downgrade subscriptions expired > 3 days
    let expiredGrace = subscriptions.getExpired();
    let threeDays = 3 * 24 * 60 * 60 * 1_000_000_000;
    for ((userId, sub) in expiredGrace.vals()) {
      switch (sub.expiresAt) {
        case (?exp) {
          if (Time.now() - exp >= threeDays) {
            ignore subscriptions.activate(userId, #Free, null);
            emitBalanceNotification(userId, #subscriptionExpired);
          };
        };
        case null {};
      };
    };
  };

  public shared ({ caller }) func triggerAutoRenewals() : async () {
    admin.assertAdmin(caller);
    processAutoRenewals<system>();
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

    // 3. Transfer ICP to CMC — unified pool, treasury subaccount.
    //    Guard against depleting treasury below reserve (refunds/payouts).
    let icpE8sNeeded = Balance.cyclesToIcpE8s(charged.actualCycles, xdrPermyriadPerIcp);
    let cmcDebit = icpE8sNeeded + Balance.LEDGER_FEE;
    switch (await* guardTreasuryIcpReserve(cmcDebit)) {
      case (?currentBalance) {
        // Refund user immediately — treasury can't cover the top-up safely.
        await* safeRefund(caller, charged.tokenId, charged.amount, "treasury ICP reserve low");
        emitBalanceAdminNotification(#treasuryIcpLow({ currentBalance; required = cmcDebit; reserve = TREASURY_ICP_RESERVE }));
        emitBalanceNotification(caller, #topUpFailed({ canisterId; reason = "Service temporarily unavailable — try later" }));
        return #err("Treasury ICP reserve low — refunded, try later");
      };
      case null {};
    };
    let transferResult = await deps.transferIcpToCmc(cmcDebit, canisterId);
    let blockIndex = switch (transferResult) {
      case (#ok(idx)) idx;
      case (#err(msg)) {
        // Refund user — simple reverse transfer (100%, no ambassador complication)
        await* safeRefund(caller, charged.tokenId, charged.amount, "topUp CMC failure");
        emitBalanceNotification(caller, #topUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
        return #err("ICP transfer to CMC failed: " # msg);
      };
    };

    // 4. Notify CMC to deposit cycles
    let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
    switch (topUpResult) {
      case (#ok(_cycles)) {
        emitBalanceNotification(caller, #topUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
        #ok({ cyclesAdded = charged.actualCycles });
      };
      case (#err(err)) {
        await* deps.cmcHandleNotifyError(
          #userTopUp({ canisterId }),
          blockIndex,
          ?{ payer = caller; tokenId = charged.tokenId; amount = charged.amount },
          err,
        );
        emitBalanceNotification(caller, #topUpFailed({ canisterId; reason = "CMC notify failed: " # debug_show err }));
        #err("CMC top-up notification failed: " # debug_show err);
      };
    };
  };

  // ---- Auto top-up (triggered by storage canister) ----

  transient let autoTopUpInFlight = Set.empty<Principal>(); // canisters currently being topped up

  func getAutoTopUpSettings(storageOwner : Principal) : Result.Result<Settings.UserSettings, Text> {
    let settings = deps.getUserSettings(storageOwner);
    if (not settings.autoTopUp) return #err("Auto top-up is disabled");
    if (settings.topUpAmountCycles == 0) return #err("Auto top-up amount is not configured");

    switch (subscriptions.get(storageOwner)) {
      case (?sub) {
        switch (sub.status, sub.plan) {
          case (#Active, #Pro) #ok(settings);
          case _ #err("Auto top-up requires an active Pro subscription");
        };
      };
      case null #err("Auto top-up requires an active Pro subscription");
    };
  };

  /// Checks user settings and auto-tops up if enabled.
  /// Uses in-flight lock to prevent duplicate top-ups from concurrent callbacks.
  func runAutoTopUp<system>(
    storageOwner : Principal,
    canisterId : Principal,
  ) : async Result.Result<{ cyclesAdded : Nat }, Text> {
    // Heavy path — multiple HTTPS outcalls (rate) + CMC + ledger transfers.
    // Opportunistic self-topup keeps the backend itself solvent.
    maybeTopUpSelf<system>();

    let settings = switch (getAutoTopUpSettings(storageOwner)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    // In-flight lock: skip if top-up already in progress for this canister
    if (Set.contains(autoTopUpInFlight, Principal.compare, canisterId)) return #err("Auto top-up is already in progress");
    Set.add(autoTopUpInFlight, Principal.compare, canisterId);

    // Track charge for refund in catch block
    var pendingCharge : ?{ tokenId : TreasuryTypes.TokenId; amount : Nat } = null;

    try {
      let xdrPermyriadPerIcp = await rates.getIcpXdrRate();
      let ?icpUsdRate = await rates.getXrcRate("ICP", "USD") else {
        emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "Failed to fetch ICP/USD rate" }));
        Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
        return #err("Failed to fetch ICP/USD rate");
      };

      let chargeResult = await* simpleChargeForTopUp(storageOwner, settings.topUpAmountCycles, xdrPermyriadPerIcp, icpUsdRate);
      let charged = switch (chargeResult) {
        case (#ok(info)) info;
        case (#err(_)) {
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "Insufficient balance" }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err("Insufficient balance");
        };
      };
      pendingCharge := ?{ tokenId = charged.tokenId; amount = charged.amount };

      let icpE8sNeeded = Balance.cyclesToIcpE8s(charged.actualCycles, xdrPermyriadPerIcp);
      let cmcDebit = icpE8sNeeded + Balance.LEDGER_FEE;
      // Unified pool reserve guard — refund immediately if treasury can't
      // cover without depleting the refund/payout buffer.
      switch (await* guardTreasuryIcpReserve(cmcDebit)) {
        case (?currentBalance) {
          pendingCharge := null;
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp: treasury ICP reserve low");
          emitBalanceAdminNotification(#treasuryIcpLow({ currentBalance; required = cmcDebit; reserve = TREASURY_ICP_RESERVE }));
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "Service temporarily unavailable" }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err("Service temporarily unavailable");
        };
        case null {};
      };
      let transferResult = await deps.transferIcpToCmc(cmcDebit, canisterId);
      let blockIndex = switch (transferResult) {
        case (#ok(idx)) idx;
        case (#err(msg)) {
          pendingCharge := null; // refund handled below
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp ICP transfer failure");
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err("ICP transfer failed: " # msg);
        };
      };

      let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
      switch (topUpResult) {
        case (#ok(_)) {
          pendingCharge := null; // success, no refund needed
          emitBalanceNotification(storageOwner, #autoTopUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #ok({ cyclesAdded = charged.actualCycles });
        };
        case (#err(err)) {
          pendingCharge := null; // cmcHandleNotifyError takes over (may refund, or enqueue pending op)
          await* deps.cmcHandleNotifyError(
            #autoTopUp({ canisterId }),
            blockIndex,
            ?{ payer = storageOwner; tokenId = charged.tokenId; amount = charged.amount },
            err,
          );
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "CMC notify failed: " # debug_show err }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err("CMC notify failed: " # debug_show err);
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
      emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "Internal error" }));
      Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
      return #err("Internal error");
    };

    Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
    #err("Internal error");
  };

  /// Called from onStorageLowCycles. Low-cycle callbacks are notifications;
  /// storage operation preflight uses the result-returning helper below.
  func processAutoTopUp<system>(
    storageOwner : Principal,
    canisterId : Principal,
    currentBalance : Nat,
    severity : { #warning; #critical },
  ) : async () {
    ignore currentBalance;
    ignore severity;
    ignore await runAutoTopUp<system>(storageOwner, canisterId);
  };

  func ensureAutoTopUpForStorageOperation<system>(
    storageOwner : Principal,
    canisterId : Principal,
    currentBalance : Nat,
    requiredBalance : Nat,
  ) : async Result.Result<{ cyclesAdded : Nat }, Text> {
    let settings = switch (getAutoTopUpSettings(storageOwner)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    if (currentBalance + settings.topUpAmountCycles < requiredBalance) {
      return #err(
        "Auto top-up amount is too low for this upload. Required balance: " #
        Nat.toText(requiredBalance) #
        " cycles, current balance: " #
        Nat.toText(currentBalance) #
        " cycles"
      );
    };

    await runAutoTopUp<system>(storageOwner, canisterId);
  };

  // ---- Backend self-topup (from treasury ICP) ----

  /// Idempotency flag so hot-path triggers don't spawn duplicate self-topups
  /// while one is already in flight. Transient — resets on upgrade.
  transient var selfTopUpInFlight : Bool = false;

  /// Edge-triggered flag for `#backendLowCycles` admin notifications. Set the
  /// first time cycles drop below the threshold; cleared when cycles recover
  /// to ≥ target. Without this guard every heavy update path would spam the
  /// admin inbox until the topup lands.
  transient var backendLowCyclesNotified : Bool = false;

  /// Non-blocking check: if backend cycle balance is below threshold AND no
  /// top-up is already in flight, schedule `selfTopUpFromTreasury` via a
  /// 0-second timer (fire-and-forget). Callers invoke this from heavy update
  /// paths — it returns immediately and never affects the caller's flow.
  func maybeTopUpSelf<system>() {
    let current = Cycles.balance();

    // Edge detection for admin notifications. Fires once on downward crossing
    // of the threshold, once on upward crossing of the target. The gap
    // (threshold < target) acts as hysteresis so we don't flap around a
    // single watermark.
    if (current < deps.backendCyclesThreshold and not backendLowCyclesNotified) {
      emitBalanceAdminNotification(#backendLowCycles({
        current;
        threshold = deps.backendCyclesThreshold;
      }));
      backendLowCyclesNotified := true;
    } else if (current >= deps.backendCyclesTarget and backendLowCyclesNotified) {
      backendLowCyclesNotified := false;
    };

    if (selfTopUpInFlight) return;
    if (current >= deps.backendCyclesThreshold) return;
    ignore Timer.setTimer<system>(#seconds 0, selfTopUpFromTreasury);
  };

  /// Buy cycles for the backend itself using treasury ICP:
  ///   1. Fetch ICP/XDR rate from CMC
  ///   2. Compute ICP needed to raise `Cycles.balance()` up to target
  ///   3. Transfer ICP from TREASURY_SUBACCOUNT → CMC subaccount(backend)
  ///   4. Call CMC `notify_top_up` — cycles deposit lands on backend
  /// Failures (treasury empty, CMC error) are logged; caller never blocks.
  func selfTopUpFromTreasury() : async () {
    if (selfTopUpInFlight) return;
    selfTopUpInFlight := true;

    // Single reset path: the flag is cleared once at the very end of the
    // message, regardless of how the body exited. Every early exit inside
    // `runSelfTopUp` is `return`, so control flow always reaches the
    // `selfTopUpInFlight := false` line. Traps inside the try block are
    // caught and logged — they also fall through to the reset.
    //
    // Traps AFTER the last await would roll state back to that await commit
    // point, leaving `selfTopUpInFlight = true` stuck. The body takes care
    // never to have trap-prone code after the last await (only `Debug.print`
    // and the unconditional reset, both non-trapping).
    try {
      await* runSelfTopUp();
    } catch (e) {
      let reason = "trap: " # Error.message(e);
      Debug.print("[selfTopUp] " # reason);
      emitBalanceAdminNotification(#backendSelfTopUpFailed({ reason }));
    };
    selfTopUpInFlight := false;
  };

  /// Inner body extracted so `selfTopUpFromTreasury` has exactly one reset
  /// path. All early exits are plain `return` — the wrapper's final line
  /// clears the in-flight flag. Failure paths notify admins via
  /// `#backendSelfTopUpFailed` with a short, admin-readable reason.
  func runSelfTopUp() : async* () {
    let current = Cycles.balance();
    if (current >= deps.backendCyclesTarget) return;
    let needed = deps.backendCyclesTarget - current : Nat;

    let xdrPermyriadPerIcp = await rates.getIcpXdrRate();
    let icpE8sNeeded = Balance.cyclesToIcpE8s(needed, xdrPermyriadPerIcp);
    if (icpE8sNeeded == 0) return;

    // Include ledger fee — actual transferred amount is what CMC will accept.
    // Unified pool — treasury subaccount is source for all CMC top-ups
    // (user, auto, and backend self-topup).
    //
    // NOTE: no `guardTreasuryIcpReserve` check here. Backend survival is
    // priority — if cycles drop below threshold and self-topup can't fire,
    // the whole system freezes (including refunds). Accepting risk of
    // draining the refund reserve in this specific flow.
    let transferResult = await deps.transferIcpToCmc(
      icpE8sNeeded + Balance.LEDGER_FEE,
      deps.selfCanisterId,
    );
    let blockIndex = switch (transferResult) {
      case (#ok idx) idx;
      case (#err msg) {
        let reason = "treasury→CMC transfer failed: " # msg;
        Debug.print("[selfTopUp] " # reason);
        emitBalanceAdminNotification(#backendSelfTopUpFailed({ reason }));
        return;
      };
    };

    switch (await deps.notifyTopUp(Nat64.fromNat(blockIndex), deps.selfCanisterId)) {
      case (#ok cycles) {
        Debug.print("[selfTopUp] ok deposited=" # Nat.toText(cycles) # " cycles");
        // Back above target → clear the flag so a future dip re-notifies.
        if (Cycles.balance() >= deps.backendCyclesTarget) {
          backendLowCyclesNotified := false;
        };
      };
      case (#err err) {
        // `null` refund: treasury auto-receives ICP on CMC `#Refunded`.
        Debug.print("[selfTopUp] CMC notify failed block=" # Nat.toText(blockIndex) # ": " # debug_show err);
        await* deps.cmcHandleNotifyError(#selfTopUp, blockIndex, null, err);
      };
    };
  };

  /// Admin trigger — force an immediate top-up check. Useful for runbook
  /// recovery after draining tests, or to manually refill ahead of a spike.
  public shared ({ caller }) func triggerSelfTopUp() : async () {
    admin.assertAdmin(caller);
    await selfTopUpFromTreasury();
  };

  public query ({ caller }) func getBackendCyclesBalance() : async Nat {
    admin.assertAdmin(caller);
    Cycles.balance();
  };
};
