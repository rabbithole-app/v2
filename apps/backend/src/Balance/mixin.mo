import Cycles "mo:core/Cycles";
import Debug "mo:core/Debug";
import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Set "mo:core/Set";
import Map "mo:core/Map";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import Vector "mo:vector";

import TreasuryTypes "mo:treasury/Types";

import BackendEvents "../BackendEvents/lib";
import Balance "lib";
import CyclesReserve "CyclesReserve";
import CMCTypes "../Types/CMCTypes";
import CmcRecovery "../CmcRecovery/lib";
import Coupons "../Coupons/lib";
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
    simpleRefund : (Principal, TreasuryTypes.TokenId, Nat) -> async* Result.Result<TreasuryTypes.RefundReceipt, Text>;
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
    /// Referral-discount hooks (Coupons mixin). `takeDiscount` claims the
    /// pending discount and sets an in-flight guard; the charge outcome
    /// must settle it via commit (burn) or release (retry stays discounted).
    takeDiscount : (Principal, Coupons.DiscountKind) -> ?Nat;
    commitDiscount : (Principal, Coupons.DiscountKind) -> ();
    releaseDiscount : (Principal, Coupons.DiscountKind) -> ();
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
    cmcHandleNotifyError : (CmcRecovery.CmcOpSource, Nat, ?CmcRecovery.RefundContext, CMCTypes.NotifyError) -> async* CmcRecovery.CmcNotifyOutcome;
    // Self-topup parameters — cycles.balance watermarks for the backend itself
    selfCanisterId : Principal;
    backendCyclesThreshold : Nat;
    backendCyclesTarget : Nat;
    onSubscriptionChanged : (Principal) -> async ();
    registerIncludedFundingSettlement : ((Nat, CmcRecovery.IncludedFundingSettlement) -> ()) -> ();
  },
) {
  func emitBalanceNotification(recipient : Principal, event : Notifications.NotificationPayload) {
    deps.events.emit(#notificationRequested({ recipient; payload = event; correlationId = null }));
  };

  func emitBalanceAdminNotification(event : Notifications.NotificationPayload) {
    deps.events.emit(#adminNotificationRequested({ payload = event; correlationId = null }));
  };

  func emitStorageFundingChanged(
    storageOwner : Principal,
    canisterId : Principal,
    status : BackendEvents.StorageFundingStatus,
    currentBalance : ?Nat,
    requiredBalance : ?Nat,
  ) {
    deps.events.emit(#storageFundingChanged({
      accountOwner = storageOwner;
      canisterId;
      status;
      currentBalance;
      requiredBalance;
      correlationId = null;
    }));
  };

  func emitStorageOperationalStateChanged(
    storageOwner : Principal,
    canisterId : Principal,
    slices : [BackendEvents.StorageOperationalSlice],
    severity : ?BackendEvents.StorageOperationalSeverity,
  ) {
    deps.events.emit(#storageOperationalStateChanged({
      accountOwner = storageOwner;
      canisterId;
      slices;
      severity;
      correlationId = null;
    }));
  };

  func cmcPendingInfo(outcome : CmcRecovery.CmcNotifyOutcome) : ?{ id : Nat; reason : Text } {
    switch (outcome) {
      case (#pending({ id; reason })) ?{ id; reason };
      case (#refundPending({ id; reason })) ?{ id; reason };
      case (#refunded(_)) null;
    };
  };

  func cmcPendingReason(outcome : CmcRecovery.CmcNotifyOutcome) : ?Text {
    switch (cmcPendingInfo(outcome)) {
      case (?info) ?("CMC funding operation #" # Nat.toText(info.id) # " is pending recovery: " # info.reason);
      case null null;
    };
  };

  func cmcRefundedReason(outcome : CmcRecovery.CmcNotifyOutcome) : ?Text {
    switch (outcome) {
      case (#refunded({ reason; receipt = _ })) ?reason;
      case _ null;
    };
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
    discountKind : ?Coupons.DiscountKind,
  ) : async* Balance.ChargeResult {
    // Opportunistic self-topup before heavy outcalls (XRC + per-token balance
    // checks + ambassador distribution). Fire-and-forget.
    maybeTopUpSelf<system>();

    let settings = deps.getUserSettings(userId);

    // Referral discount applies to the USD amount before token conversion,
    // so the ambassador split downstream is computed from the paid amount.
    let claimedDiscountBps : ?Nat = switch (discountKind) {
      case (?kind) deps.takeDiscount(userId, kind);
      case null null;
    };
    let effectiveCents = switch (claimedDiscountBps) {
      case (?bps) {
        assert bps <= Coupons.MAX_DISCOUNT_BPS;
        let discounted = usdAmountCents * (10_000 - bps : Nat) / 10_000;
        assert discounted > 0;
        discounted;
      };
      case null usdAmountCents;
    };
    func settleDiscount(success : Bool) {
      let ?_ = claimedDiscountBps else return;
      let ?kind = discountKind else return;
      if (success) deps.commitDiscount(userId, kind) else deps.releaseDiscount(userId, kind);
    };

    try {
      onPhase(#fetchingRates);
      let rates = await* fetchRates(settings.spendingPriority);

      onPhase(#checkingBalances);
      label priorities for (tokenId in settings.spendingPriority.vals()) {
        let ?tokenAmount = usdCentsToToken(effectiveCents, tokenId, rates) else {
          continue priorities;
        };

        let userBalance = try { await* treasury.getBalance(userId, tokenId) } catch (_) {
          0;
        };

        if (userBalance >= tokenAmount) {
          onPhase(#charging({ tokenId; amount = tokenAmount }));
          let chain = deps.getAmbassadorChain(userId);
          // Skip ambassador split at charge when caller asked to defer AND we
          // picked an IC token (EVM/SOL keep charge-time distribution).
          let deferred = deferAmbassadorPayout and Balance.isIcToken(tokenId);
          let (l1, l2) = if (deferred) (null, null) else (chain.l1, chain.l2);
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
              settleDiscount(true);
              return #ok({ tokenId; amount = tokenAmount });
            };
            case (#err(#PartiallyCompleted(record))) {
              // Partial completion is only acceptable when the user's own
              // charge (treasury leg) went through and just an ambassador
              // leg failed. A failed treasury leg means no payment happened
              // — the paymentId is already marked processed, so retrying
              // with another token is impossible; surface the error.
              switch (Balance.treasuryLegError(record)) {
                case (?err) {
                  settleDiscount(false);
                  return #err("Charge failed: " # err);
                };
                case null {
                  settleDiscount(true);
                  return #ok({ tokenId; amount = tokenAmount });
                };
              };
            };
            case (#err(_)) {};
          };
        };
      };

      settleDiscount(false);
      #insufficientFunds({ required = effectiveCents });
    } catch (e) {
      settleDiscount(false);
      throw e;
    };
  };

  // ---- Simple charge for top-up (no ambassador split) ----

  func tokenIdText(tokenId : TreasuryTypes.TokenId) : Text {
    switch (tokenId) {
      case (#ICP) "ICP";
      case (#ckUSDC) "ckUSDC";
      case (#ckUSDT) "ckUSDT";
      case (#ckETH) "ckETH";
      case (#BaseETH) "BaseETH";
      case (#BaseUSDC) "BaseUSDC";
      case (#BaseUSDT) "BaseUSDT";
      case (#SOL) "SOL";
      case (#SolUSDC) "SolUSDC";
      case (#SolUSDT) "SolUSDT";
    };
  };

  let PAID_AUTO_TOP_UP_BALANCE_HINT : Text = "Add funds to a supported wallet balance, adjust spending priority, or top up this storage manually.";

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
    var hasPositiveBalance = false;
    var lastTransferFailure : ?Text = null;

    label priorities for (tokenId in settings.spendingPriority.vals()) {
      let ?fullTokenAmount = usdCentsToToken(targetUsdCents, tokenId, fetchedRates) else continue priorities;

      let userBalance = try { await* treasury.getBalance(userId, tokenId) } catch (_) {
        0;
      };
      if (userBalance == 0) continue priorities;
      hasPositiveBalance := true;

      // Determine actual charge: full or partial
      // Note: treasurySimpleTransfer deducts fee, so effective amount = chargeAmount - fee
      let fee = if (Balance.isIcToken(tokenId)) Balance.getIcTokenFee(tokenId) else 0;
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

      // Execute charge without ambassador split. IC tokens can use a cheap
      // single-ledger transfer; EVM/SOL use the threshold-signed charge path.
      let result = if (Balance.isIcToken(tokenId)) {
        await* treasury.simpleTransfer(userId, tokenId, chargeAmount);
      } else {
        let paymentId = generatePaymentId("storage_topup", userId);
        switch (await* treasury.chargeAndDistribute({
          paymentId;
          userId;
          tokenId;
          totalAmount = chargeAmount;
          ambassadorL1 = null;
          ambassadorL2 = null;
          metadata = ?"storage_auto_top_up";
        })) {
          case (#ok(_)) #ok(0);
          case (#err(#PartiallyCompleted(record))) #err("Charge partially completed for " # tokenIdText(tokenId) # ": " # debug_show record);
          case (#err(err)) #err("Charge failed for " # tokenIdText(tokenId) # ": " # debug_show err);
        };
      };
      switch (result) {
        case (#ok(_)) return #ok({
          tokenId;
          amount = chargeAmount;
          actualCycles;
        });
        case (#err(msg)) {
          lastTransferFailure := ?("Storage auto top-up charge failed for " # tokenIdText(tokenId) # ": " # msg);
        }; // Try next token
      };
    };

    switch (lastTransferFailure) {
      case (?message) return #err(message);
      case null {};
    };
    if (hasPositiveBalance) {
      return #err("Insufficient usable wallet balance for storage auto top-up. " # PAID_AUTO_TOP_UP_BALANCE_HINT);
    };
    #err("No usable wallet balance for storage auto top-up. " # PAID_AUTO_TOP_UP_BALANCE_HINT);
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
  transient let STORAGE_FUNDING_FAILURE_NOTIFICATION_COOLDOWN : Time.Time = 60_000_000_000; // 60 seconds
  transient let storageFundingFailureNotificationAt = Map.empty<Principal, Time.Time>();

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

  func leftPadE8s(value : Nat) : Text {
    var text = Nat.toText(value);
    while (Text.size(text) < 8) {
      text := "0" # text;
    };
    text;
  };

  func formatIcpE8s(e8s : Nat) : Text {
    let whole = e8s / Balance.E8S_PER_ICP;
    let fraction = e8s % Balance.E8S_PER_ICP;
    if (fraction == 0) {
      return Nat.toText(whole) # " ICP";
    };

    let trimmedFraction = Text.trimEnd(leftPadE8s(fraction), #char '0');
    Nat.toText(whole) # "." # trimmedFraction # " ICP";
  };

  func treasuryIcpReserveLowReason(currentBalance : Nat, required : Nat) : Text {
    "Treasury ICP reserve low: balance " #
    formatIcpE8s(currentBalance) #
    ", required debit " #
    formatIcpE8s(required) #
    ", reserve " #
    formatIcpE8s(TREASURY_ICP_RESERVE);
  };

  func shouldEmitStorageFundingFailureNotification(canisterId : Principal) : Bool {
    let now : Time.Time = Time.now();
    switch (Map.get(storageFundingFailureNotificationAt, Principal.compare, canisterId)) {
      case (?lastNotifiedAt) {
        let elapsed = if (now > lastNotifiedAt) now - lastNotifiedAt else 0;
        if (elapsed < STORAGE_FUNDING_FAILURE_NOTIFICATION_COOLDOWN) {
          return false;
        };
      };
      case null {};
    };
    Map.add(storageFundingFailureNotificationAt, Principal.compare, canisterId, now);
    true;
  };

  func emitStorageTreasuryIcpLowIfNeeded(storageOwner : Principal, canisterId : Principal, currentBalance : Nat, required : Nat) : Text {
    let reason = treasuryIcpReserveLowReason(currentBalance, required);
    if (shouldEmitStorageFundingFailureNotification(canisterId)) {
      emitBalanceAdminNotification(#treasuryIcpLow({ currentBalance; required; reserve = TREASURY_ICP_RESERVE }));
      emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason }));
    };
    reason;
  };

  func safeRefund(userId : Principal, tokenId : TreasuryTypes.TokenId, amount : Nat, reason : Text) : async* () {
    switch (await* treasury.simpleRefund(userId, tokenId, amount)) {
      case (#ok(_receipt)) {};
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
        case (#ok(_receipt)) { processed += 1 };
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
    let result = await* chargeForService(userId, LICENSE_PRICE_CENTS, "license", paymentId, onPhase, true, ?#license);
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
      case (#Free) return #err(#InvalidPlan("Cannot purchase Free plans"));
    };

    // Charge from balance (with ambassador distribution — subscription is
    // non-refundable so ambassadors receive their share at charge time).
    let paymentId = generatePaymentId("purchase", userId);
    // First-month referral discount only applies to a fresh Pro purchase —
    // the Coupons mixin burns the flag after one successful charge.
    let chargeResult = await* chargeForService(userId, amountCents, debug_show plan, paymentId, func(_) {}, false, ?#proFirstMonth);

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
      let result = await* chargeForService(userId, amountCents, "auto_renew", paymentId, func(_) {}, false, null);

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

  // ---- Cycles reserve (serve user-facing ops from backend's own balance) ----
  //
  // The backend holds a cycles reserve (manually refilled off-CMC at a better
  // rate than the CMC mint price). Top-ups and deployments draw from it via a
  // single `deposit_cycles` / `create_canister` call instead of the
  // ICP-transfer + CMC-notify round-trip; the user's ICP stays in treasury.
  // Every reserve branch is "if available, else the old CMC path" — nothing
  // requires the reserve to be funded.

  /// Runtime-tunable watermarks. Raising `opsFloor` above the balance forces
  /// all operations onto the CMC path (effectively disables the reserve).
  var cyclesReserveOpsFloor : Nat = CyclesReserve.DEFAULT_OPS_FLOOR;
  var cyclesReserveRefillWatermark : Nat = CyclesReserve.DEFAULT_REFILL_WATERMARK;

  var cyclesReserveStats = {
    var manualTopUps : Nat = 0;
    var manualTopUpCycles : Nat = 0;
    var autoTopUps : Nat = 0;
    var autoTopUpCycles : Nat = 0;
    var includedTopUps : Nat = 0;
    var includedTopUpCycles : Nat = 0;
    var deploys : Nat = 0;
    var deployCycles : Nat = 0;
    var cmcFallbacks : Nat = 0;
  };

  /// Edge-triggered flag for `#cyclesReserveLow` — same hysteresis pattern
  /// as `backendLowCyclesNotified` (see self-topup section).
  transient var reserveRefillNotified : Bool = false;

  func checkReserveRefillWatermark() {
    let current = Cycles.balance();
    if (current < cyclesReserveRefillWatermark and not reserveRefillNotified) {
      emitBalanceAdminNotification(#cyclesReserveLow({ current; watermark = cyclesReserveRefillWatermark }));
      reserveRefillNotified := true;
    } else if (current >= cyclesReserveRefillWatermark and reserveRefillNotified) {
      reserveRefillNotified := false;
    };
  };

  func serveTopUpFromReserve(canisterId : Principal, amount : Nat) : async* CyclesReserve.DepositResult {
    await* CyclesReserve.deposit(canisterId, amount, cyclesReserveOpsFloor);
  };

  func recordReserveCmcFallback() {
    cyclesReserveStats.cmcFallbacks += 1;
  };

  /// Deployment metrics recorder — wired into the StorageDeployer
  /// orchestrator callbacks from main.mo.
  func recordReserveDeploy(cycles : Nat) {
    cyclesReserveStats.deploys += 1;
    cyclesReserveStats.deployCycles += cycles;
    checkReserveRefillWatermark();
  };

  func getCyclesReserveOpsFloor() : Nat {
    cyclesReserveOpsFloor;
  };

  public type CyclesReserveStats = {
    balance : Nat;
    opsFloor : Nat;
    refillWatermark : Nat;
    manualTopUps : Nat;
    manualTopUpCycles : Nat;
    autoTopUps : Nat;
    autoTopUpCycles : Nat;
    includedTopUps : Nat;
    includedTopUpCycles : Nat;
    deploys : Nat;
    deployCycles : Nat;
    cmcFallbacks : Nat;
  };

  public query ({ caller }) func getCyclesReserveStats() : async CyclesReserveStats {
    admin.assertAdmin(caller);
    {
      balance = Cycles.balance();
      opsFloor = cyclesReserveOpsFloor;
      refillWatermark = cyclesReserveRefillWatermark;
      manualTopUps = cyclesReserveStats.manualTopUps;
      manualTopUpCycles = cyclesReserveStats.manualTopUpCycles;
      autoTopUps = cyclesReserveStats.autoTopUps;
      autoTopUpCycles = cyclesReserveStats.autoTopUpCycles;
      includedTopUps = cyclesReserveStats.includedTopUps;
      includedTopUpCycles = cyclesReserveStats.includedTopUpCycles;
      deploys = cyclesReserveStats.deploys;
      deployCycles = cyclesReserveStats.deployCycles;
      cmcFallbacks = cyclesReserveStats.cmcFallbacks;
    };
  };

  public shared ({ caller }) func setCyclesReserveConfig(config : { opsFloor : Nat; refillWatermark : Nat }) : async () {
    admin.assertAdmin(caller);
    cyclesReserveOpsFloor := config.opsFloor;
    cyclesReserveRefillWatermark := config.refillWatermark;
  };

  // ---- Top-up from balance ----

  /// Top up a storage canister's cycles from user's balance.
  /// Flow: charge user (simple, no split) → cycles reserve deposit, or
  /// ICP to CMC → cycles when the reserve can't cover it.
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

    // 3. Serve from the backend cycles reserve when it covers the amount —
    //    one deposit_cycles call, no CMC round-trip; treasury keeps the ICP.
    switch (await* serveTopUpFromReserve(canisterId, charged.actualCycles)) {
      case (#ok) {
        cyclesReserveStats.manualTopUps += 1;
        cyclesReserveStats.manualTopUpCycles += charged.actualCycles;
        checkReserveRefillWatermark();
        emitBalanceNotification(caller, #topUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
        return #ok({ cyclesAdded = charged.actualCycles });
      };
      case (#failed(msg)) {
        await* safeRefund(caller, charged.tokenId, charged.amount, "reserve cycles deposit failure");
        emitBalanceNotification(caller, #topUpFailed({ canisterId; reason = "Cycles deposit failed: " # msg }));
        return #err("Cycles deposit failed: " # msg);
      };
      case (#insufficientReserve) recordReserveCmcFallback();
    };

    // 4. Fallback: transfer ICP to CMC — unified pool, treasury subaccount.
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
    let transferResult = await deps.transferIcpToCmc(icpE8sNeeded, canisterId);
    let blockIndex = switch (transferResult) {
      case (#ok(idx)) idx;
      case (#err(msg)) {
        // Refund user — simple reverse transfer (100%, no ambassador complication)
        await* safeRefund(caller, charged.tokenId, charged.amount, "topUp CMC failure");
        emitBalanceNotification(caller, #topUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
        return #err("ICP transfer to CMC failed: " # msg);
      };
    };

    // 5. Notify CMC to deposit cycles
    let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
    switch (topUpResult) {
      case (#ok(_cycles)) {
        emitBalanceNotification(caller, #topUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
        #ok({ cyclesAdded = charged.actualCycles });
      };
      case (#err(err)) {
        let outcome = await* deps.cmcHandleNotifyError(
          #userTopUp({ canisterId }),
          blockIndex,
          ?{ payer = caller; tokenId = charged.tokenId; amount = charged.amount },
          err,
        );
        switch (cmcPendingReason(outcome)) {
          case (?reason) {
            return #err(reason);
          };
          case null {};
        };
        let reason = switch (cmcRefundedReason(outcome)) {
          case (?message) "CMC refunded top-up: " # message;
          case null "CMC top-up notification failed: " # debug_show err;
        };
        emitBalanceNotification(caller, #topUpFailed({ canisterId; reason }));
        #err(reason);
      };
    };
  };

  // ---- Auto top-up (triggered by storage canister) ----

  transient let autoTopUpInFlight = Set.empty<Principal>(); // canisters currently being topped up
  transient let proIncludedFundingInFlight = Set.empty<Principal>(); // users currently consuming included storage funding

  type StorageFundingAttempt = {
    requestedAt : Time.Time;
    message : ?Text;
  };

  type ProIncludedStorageFundingPeriod = (Time.Time, Time.Time);

  type ProIncludedStorageFundingBudget = {
    period : ProIncludedStorageFundingPeriod;
    var usedCycles : Nat;
  };

  type ProIncludedStorageFundingReservation = {
    storageOwner : Principal;
    period : ProIncludedStorageFundingPeriod;
    cycles : Nat;
  };

  public type StorageFundingStatus = {
    managedFundingEligible : Bool;
    includedCyclesLimit : Nat;
    includedCyclesUsed : Nat;
    includedCyclesRemaining : Nat;
    periodStart : ?Time.Time;
    periodEnd : ?Time.Time;
    paidAutoTopUpEnabled : Bool;
    paidTopUpAmountCycles : Nat;
    spendingPriority : [TreasuryTypes.TokenId];
  };

  let proIncludedStorageFunding = Map.empty<Principal, ProIncludedStorageFundingBudget>();
  let proIncludedStorageFundingReservations = Map.empty<Nat, ProIncludedStorageFundingReservation>();

  let PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD : Nat = 2_000_000_000_000; // 2 TC included managed funding per period
  let PRO_INCLUDED_STORAGE_TOP_UP_CYCLES : Nat = 1_000_000_000_000; // 1 TC per included managed funding top-up
  let STORAGE_FUNDING_REQUEST_COOLDOWN : Time.Time = 60_000_000_000; // 60 seconds per storage canister
  let STORAGE_FUNDING_IN_PROGRESS_ERROR : Text = "Storage funding is already in progress";
  let PRO_INCLUDED_STORAGE_FUNDING_EXHAUSTED_ERROR : Text = "Pro included storage funding is exhausted for the current period";

  transient let storageFundingAttempts = Map.empty<Principal, StorageFundingAttempt>();

  func clearStorageFundingLocks(storageOwner : Principal, canisterId : Principal) {
    Set.remove(proIncludedFundingInFlight, Principal.compare, storageOwner);
    Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
  };

  func recentStorageFundingAttemptError(canisterId : Principal) : ?Text {
    let now : Time.Time = Time.now();
    switch (Map.get(storageFundingAttempts, Principal.compare, canisterId)) {
      case (?attempt) {
        let elapsed = if (now > attempt.requestedAt) now - attempt.requestedAt else 0;
        if (elapsed < STORAGE_FUNDING_REQUEST_COOLDOWN) {
          switch (attempt.message) {
            case (?message) ?message;
            case null ?STORAGE_FUNDING_IN_PROGRESS_ERROR;
          };
        } else {
          null;
        };
      };
      case null null;
    };
  };

  func beginStorageFundingAttempt(canisterId : Principal) : ?Text {
    switch (recentStorageFundingAttemptError(canisterId)) {
      case (?message) return ?message;
      case null {};
    };
    Map.add(storageFundingAttempts, Principal.compare, canisterId, {
      requestedAt = Time.now();
      message = null;
    });
    null;
  };

  func finishStorageFundingAttempt(canisterId : Principal, message : ?Text) {
    Map.add(storageFundingAttempts, Principal.compare, canisterId, {
      requestedAt = Time.now();
      message;
    });
  };

  func shouldFallbackToPaidAutoTopUp(includedFundingError : Text) : Bool {
    includedFundingError == PRO_INCLUDED_STORAGE_FUNDING_EXHAUSTED_ERROR;
  };

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

  func activeProSubscription(storageOwner : Principal) : Result.Result<Subscriptions.Subscription, Text> {
    switch (subscriptions.get(storageOwner)) {
      case (?sub) {
        switch (sub.status, sub.plan) {
          case (#Active, #Pro) #ok(sub);
          case _ #err("Managed storage funding requires an active Pro subscription");
        };
      };
      case null #err("Managed storage funding requires an active Pro subscription");
    };
  };

  func proFundingPeriod(sub : Subscriptions.Subscription) : ProIncludedStorageFundingPeriod {
    let now = Time.now();
    let elapsed = if (now > sub.activatedAt) now - sub.activatedAt else 0;
    let periodsElapsed = elapsed / Subscriptions.THIRTY_DAYS_NS;
    let periodStart = sub.activatedAt + (periodsElapsed * Subscriptions.THIRTY_DAYS_NS);
    let defaultPeriodEnd = periodStart + Subscriptions.THIRTY_DAYS_NS;
    let periodEnd = switch (sub.expiresAt) {
      case (?expiresAt) {
        if (expiresAt < defaultPeriodEnd) expiresAt else defaultPeriodEnd;
      };
      case null defaultPeriodEnd;
    };
    (periodStart, periodEnd);
  };

  func sameProIncludedFundingPeriod(a : ProIncludedStorageFundingPeriod, b : ProIncludedStorageFundingPeriod) : Bool {
    a.0 == b.0 and a.1 == b.1;
  };

  func proIncludedBudgetFor(storageOwner : Principal, sub : Subscriptions.Subscription) : ProIncludedStorageFundingBudget {
    let period = proFundingPeriod(sub);
    switch (Map.get(proIncludedStorageFunding, Principal.compare, storageOwner)) {
      case (?budget) {
        if (sameProIncludedFundingPeriod(budget.period, period)) {
          return budget;
        };
      };
      case null {};
    };
    let budget : ProIncludedStorageFundingBudget = {
      period;
      var usedCycles = 0;
    };
    Map.add(proIncludedStorageFunding, Principal.compare, storageOwner, budget);
    budget;
  };

  func proIncludedBudgetUsedFor(storageOwner : Principal, period : ProIncludedStorageFundingPeriod) : Nat {
    switch (Map.get(proIncludedStorageFunding, Principal.compare, storageOwner)) {
      case (?budget) {
        if (sameProIncludedFundingPeriod(budget.period, period)) {
          budget.usedCycles;
        } else {
          0;
        };
      };
      case null 0;
    };
  };

  func releaseProIncludedBudget(budget : ProIncludedStorageFundingBudget, cycles : Nat) {
    if (cycles >= budget.usedCycles) {
      budget.usedCycles := 0;
    } else {
      budget.usedCycles -= cycles;
    };
  };

  func reserveProIncludedFunding(
    blockIndex : Nat,
    storageOwner : Principal,
    budget : ProIncludedStorageFundingBudget,
    cycles : Nat,
  ) {
    budget.usedCycles += cycles;
    Map.add(proIncludedStorageFundingReservations, Nat.compare, blockIndex, {
      storageOwner;
      period = budget.period;
      cycles;
    });
  };

  func settleProIncludedFundingReservation(blockIndex : Nat, settlement : CmcRecovery.IncludedFundingSettlement) {
    switch (Map.get(proIncludedStorageFundingReservations, Nat.compare, blockIndex)) {
      case null {};
      case (?reservation) {
        Map.remove(proIncludedStorageFundingReservations, Nat.compare, blockIndex);
        switch (settlement) {
          case (#completed) {};
          case (#refunded) {
            switch (Map.get(proIncludedStorageFunding, Principal.compare, reservation.storageOwner)) {
              case (?budget) {
                if (sameProIncludedFundingPeriod(budget.period, reservation.period)) {
                  releaseProIncludedBudget(budget, reservation.cycles);
                };
              };
              case null {};
            };
          };
        };
      };
    };
  };

  deps.registerIncludedFundingSettlement(settleProIncludedFundingReservation);

  func storageFundingStatusFor(storageOwner : Principal) : StorageFundingStatus {
    let settings = deps.getUserSettings(storageOwner);
    let paidAutoTopUpEnabled = settings.autoTopUp and settings.topUpAmountCycles > 0;

    switch (subscriptions.get(storageOwner)) {
      case (?sub) {
        switch (sub.status, sub.plan) {
          case (#Active, #Pro) {
            let period = proFundingPeriod(sub);
            let usedCycles = proIncludedBudgetUsedFor(storageOwner, period);
            let remainingCycles = if (usedCycles >= PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD) {
              0;
            } else {
              PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD - usedCycles;
            };
            {
              managedFundingEligible = true;
              includedCyclesLimit = PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD;
              includedCyclesUsed = usedCycles;
              includedCyclesRemaining = remainingCycles;
              periodStart = ?period.0;
              periodEnd = ?period.1;
              paidAutoTopUpEnabled;
              paidTopUpAmountCycles = settings.topUpAmountCycles;
              spendingPriority = settings.spendingPriority;
            };
          };
          case _ {
            {
              managedFundingEligible = false;
              includedCyclesLimit = PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD;
              includedCyclesUsed = 0;
              includedCyclesRemaining = 0;
              periodStart = null;
              periodEnd = null;
              paidAutoTopUpEnabled;
              paidTopUpAmountCycles = settings.topUpAmountCycles;
              spendingPriority = settings.spendingPriority;
            };
          };
        };
      };
      case null {
        {
          managedFundingEligible = false;
          includedCyclesLimit = PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD;
          includedCyclesUsed = 0;
          includedCyclesRemaining = 0;
          periodStart = null;
          periodEnd = null;
          paidAutoTopUpEnabled;
          paidTopUpAmountCycles = settings.topUpAmountCycles;
          spendingPriority = settings.spendingPriority;
        };
      };
    };
  };

  public query ({ caller }) func getStorageFundingStatus() : async StorageFundingStatus {
    assert not Principal.isAnonymous(caller);
    storageFundingStatusFor(caller);
  };

  func runProIncludedStorageFunding<system>(
    storageOwner : Principal,
    canisterId : Principal,
    requestedCycles : ?Nat,
  ) : async Result.Result<{ cyclesAdded : Nat }, Text> {
    maybeTopUpSelf<system>();

    let sub = switch (activeProSubscription(storageOwner)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let budget = proIncludedBudgetFor(storageOwner, sub);
    if (budget.usedCycles >= PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD) {
      return #err(PRO_INCLUDED_STORAGE_FUNDING_EXHAUSTED_ERROR);
    };

    let requiredCycles = switch (requestedCycles) {
      case (?cycles) cycles;
      case null PRO_INCLUDED_STORAGE_TOP_UP_CYCLES;
    };
    if (requiredCycles == 0) return #ok({ cyclesAdded = 0 });

    let remainingBudget = Nat.sub(PRO_INCLUDED_STORAGE_CYCLES_PER_PERIOD, budget.usedCycles);
    let cyclesToBuy = Nat.min(remainingBudget, PRO_INCLUDED_STORAGE_TOP_UP_CYCLES);
    if (cyclesToBuy == 0) return #err(PRO_INCLUDED_STORAGE_FUNDING_EXHAUSTED_ERROR);

    if (Set.contains(autoTopUpInFlight, Principal.compare, canisterId)) return #err(STORAGE_FUNDING_IN_PROGRESS_ERROR);
    if (Set.contains(proIncludedFundingInFlight, Principal.compare, storageOwner)) return #err(STORAGE_FUNDING_IN_PROGRESS_ERROR);
    switch (beginStorageFundingAttempt(canisterId)) {
      case (?message) return #err(message);
      case null {};
    };
    Set.add(autoTopUpInFlight, Principal.compare, canisterId);
    Set.add(proIncludedFundingInFlight, Principal.compare, storageOwner);
    emitStorageFundingChanged(storageOwner, canisterId, #inFlight, null, null);
    emitStorageOperationalStateChanged(storageOwner, canisterId, [#funding], ?#info);

    try {
      // Reserve path first — no rate fetch needed, budget settles
      // immediately (no blockIndex reservation).
      switch (await* serveTopUpFromReserve(canisterId, cyclesToBuy)) {
        case (#ok) {
          budget.usedCycles += cyclesToBuy;
          cyclesReserveStats.includedTopUps += 1;
          cyclesReserveStats.includedTopUpCycles += cyclesToBuy;
          checkReserveRefillWatermark();
          emitBalanceNotification(storageOwner, #autoTopUpCompleted({ canisterId; cyclesAmount = cyclesToBuy }));
          emitStorageFundingChanged(storageOwner, canisterId, #completed({ cyclesAdded = cyclesToBuy }), null, null);
          emitStorageOperationalStateChanged(storageOwner, canisterId, [#cycles, #funding], ?#info);
          finishStorageFundingAttempt(canisterId, null);
          clearStorageFundingLocks(storageOwner, canisterId);
          return #ok({ cyclesAdded = cyclesToBuy });
        };
        case (#failed(msg)) {
          let reason = "Cycles deposit failed: " # msg;
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          clearStorageFundingLocks(storageOwner, canisterId);
          return #err(reason);
        };
        case (#insufficientReserve) recordReserveCmcFallback();
      };

      let xdrPermyriadPerIcp = await rates.getIcpXdrRate();
      let icpE8sNeeded = Balance.cyclesToIcpE8s(cyclesToBuy, xdrPermyriadPerIcp);
      let cmcDebit = icpE8sNeeded + Balance.LEDGER_FEE;
      switch (await* guardTreasuryIcpReserve(cmcDebit)) {
        case (?currentBalance) {
          let reason = emitStorageTreasuryIcpLowIfNeeded(storageOwner, canisterId, currentBalance, cmcDebit);
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          clearStorageFundingLocks(storageOwner, canisterId);
          return #err(reason);
        };
        case null {};
      };

      let transferResult = await deps.transferIcpToCmc(icpE8sNeeded, canisterId);
      let blockIndex = switch (transferResult) {
        case (#ok(idx)) idx;
        case (#err(msg)) {
          let reason = "ICP transfer failed: " # msg;
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          clearStorageFundingLocks(storageOwner, canisterId);
          return #err(reason);
        };
      };
      reserveProIncludedFunding(blockIndex, storageOwner, budget, cyclesToBuy);

      let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
      switch (topUpResult) {
        case (#ok(_)) {
          settleProIncludedFundingReservation(blockIndex, #completed);
          emitBalanceNotification(storageOwner, #autoTopUpCompleted({ canisterId; cyclesAmount = cyclesToBuy }));
          emitStorageFundingChanged(storageOwner, canisterId, #completed({ cyclesAdded = cyclesToBuy }), null, null);
          emitStorageOperationalStateChanged(storageOwner, canisterId, [#cycles, #funding], ?#info);
          finishStorageFundingAttempt(canisterId, null);
          clearStorageFundingLocks(storageOwner, canisterId);
          return #ok({ cyclesAdded = cyclesToBuy });
        };
        case (#err(err)) {
          let outcome = await* deps.cmcHandleNotifyError(#autoTopUp({ canisterId }), blockIndex, null, err);
          switch (cmcPendingInfo(outcome)) {
            case (?info) emitStorageFundingChanged(storageOwner, canisterId, #pendingCmc({ recoveryId = info.id; reason = info.reason }), null, null);
            case null {};
          };
          switch (cmcPendingReason(outcome)) {
            case (?reason) {
              finishStorageFundingAttempt(canisterId, ?reason);
              clearStorageFundingLocks(storageOwner, canisterId);
              return #err(reason);
          };
          case null {};
        };
          let reason = switch (cmcRefundedReason(outcome)) {
            case (?message) "CMC refunded included storage funding: " # message;
            case null "CMC notify failed: " # debug_show err;
          };
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          clearStorageFundingLocks(storageOwner, canisterId);
          return #err(reason);
        };
      };
    } catch (_) {
      emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "Internal error" }));
      emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason = "Internal error" }), null, null);
      finishStorageFundingAttempt(canisterId, ?"Internal error");
      clearStorageFundingLocks(storageOwner, canisterId);
      return #err("Internal error");
    };
  };

  /// Checks user settings and auto-tops up if enabled.
  /// Uses in-flight lock to prevent duplicate top-ups from concurrent callbacks.
  func runAutoTopUp<system>(
    storageOwner : Principal,
    canisterId : Principal,
    requestedCycles : ?Nat,
  ) : async Result.Result<{ cyclesAdded : Nat }, Text> {
    // Heavy path — multiple HTTPS outcalls (rate) + CMC + ledger transfers.
    // Opportunistic self-topup keeps the backend itself solvent.
    maybeTopUpSelf<system>();

    let settings = switch (getAutoTopUpSettings(storageOwner)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let cyclesToBuy = switch (requestedCycles) {
      case (?cycles) {
        if (cycles > settings.topUpAmountCycles) cycles else settings.topUpAmountCycles;
      };
      case _ settings.topUpAmountCycles;
    };

    // In-flight lock: skip if top-up already in progress for this canister
    if (Set.contains(autoTopUpInFlight, Principal.compare, canisterId)) return #err("Auto top-up is already in progress");
    switch (beginStorageFundingAttempt(canisterId)) {
      case (?message) return #err(message);
      case null {};
    };
    Set.add(autoTopUpInFlight, Principal.compare, canisterId);
    emitStorageFundingChanged(storageOwner, canisterId, #inFlight, null, null);
    emitStorageOperationalStateChanged(storageOwner, canisterId, [#funding], ?#info);

    // Track charge for refund in catch block
    var pendingCharge : ?{ tokenId : TreasuryTypes.TokenId; amount : Nat } = null;

    try {
      let xdrPermyriadPerIcp = await rates.getIcpXdrRate();
      let ?icpUsdRate = await rates.getXrcRate("ICP", "USD") else {
        let reason = "Failed to fetch ICP/USD rate";
        emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason }));
        emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
        finishStorageFundingAttempt(canisterId, ?reason);
        Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
        return #err(reason);
      };

      let chargeResult = await* simpleChargeForTopUp(storageOwner, cyclesToBuy, xdrPermyriadPerIcp, icpUsdRate);
      let charged = switch (chargeResult) {
        case (#ok(info)) info;
        case (#err(message)) {
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = message }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason = message }), null, null);
          finishStorageFundingAttempt(canisterId, ?message);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err(message);
        };
      };
      pendingCharge := ?{ tokenId = charged.tokenId; amount = charged.amount };

      // Reserve path — one deposit_cycles call, treasury keeps the ICP.
      switch (await* serveTopUpFromReserve(canisterId, charged.actualCycles)) {
        case (#ok) {
          pendingCharge := null;
          cyclesReserveStats.autoTopUps += 1;
          cyclesReserveStats.autoTopUpCycles += charged.actualCycles;
          checkReserveRefillWatermark();
          emitBalanceNotification(storageOwner, #autoTopUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
          emitStorageFundingChanged(storageOwner, canisterId, #completed({ cyclesAdded = charged.actualCycles }), null, null);
          emitStorageOperationalStateChanged(storageOwner, canisterId, [#cycles, #funding], ?#info);
          finishStorageFundingAttempt(canisterId, null);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #ok({ cyclesAdded = charged.actualCycles });
        };
        case (#failed(msg)) {
          pendingCharge := null; // refund handled here
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp reserve deposit failure");
          let reason = "Cycles deposit failed: " # msg;
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err(reason);
        };
        case (#insufficientReserve) recordReserveCmcFallback();
      };

      let icpE8sNeeded = Balance.cyclesToIcpE8s(charged.actualCycles, xdrPermyriadPerIcp);
      let cmcDebit = icpE8sNeeded + Balance.LEDGER_FEE;
      // Unified pool reserve guard — refund immediately if treasury can't
      // cover without depleting the refund/payout buffer.
      switch (await* guardTreasuryIcpReserve(cmcDebit)) {
        case (?currentBalance) {
          pendingCharge := null;
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp: treasury ICP reserve low");
          let reason = emitStorageTreasuryIcpLowIfNeeded(storageOwner, canisterId, currentBalance, cmcDebit);
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err(reason);
        };
        case null {};
      };
      let transferResult = await deps.transferIcpToCmc(icpE8sNeeded, canisterId);
      let blockIndex = switch (transferResult) {
        case (#ok(idx)) idx;
        case (#err(msg)) {
          pendingCharge := null; // refund handled below
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp ICP transfer failure");
          let reason = "ICP transfer failed: " # msg;
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason = "ICP transfer failed: " # msg }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err(reason);
        };
      };

      let topUpResult = await deps.notifyTopUp(Nat64.fromNat(blockIndex), canisterId);
      switch (topUpResult) {
        case (#ok(_)) {
          pendingCharge := null; // success, no refund needed
          emitBalanceNotification(storageOwner, #autoTopUpCompleted({ canisterId; cyclesAmount = charged.actualCycles }));
          emitStorageFundingChanged(storageOwner, canisterId, #completed({ cyclesAdded = charged.actualCycles }), null, null);
          emitStorageOperationalStateChanged(storageOwner, canisterId, [#cycles, #funding], ?#info);
          finishStorageFundingAttempt(canisterId, null);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #ok({ cyclesAdded = charged.actualCycles });
        };
        case (#err(err)) {
          pendingCharge := null; // cmcHandleNotifyError takes over (may refund, or enqueue pending op)
          let outcome = await* deps.cmcHandleNotifyError(
            #autoTopUp({ canisterId }),
            blockIndex,
            ?{ payer = storageOwner; tokenId = charged.tokenId; amount = charged.amount },
            err,
          );
          switch (cmcPendingInfo(outcome)) {
            case (?info) emitStorageFundingChanged(storageOwner, canisterId, #pendingCmc({ recoveryId = info.id; reason = info.reason }), null, null);
            case null {};
          };
          switch (cmcPendingReason(outcome)) {
            case (?reason) {
              finishStorageFundingAttempt(canisterId, ?reason);
              Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
              return #err(reason);
            };
            case null {};
          };
          let reason = switch (cmcRefundedReason(outcome)) {
            case (?message) "CMC refunded auto top-up: " # message;
            case null "CMC notify failed: " # debug_show err;
          };
          emitBalanceNotification(storageOwner, #autoTopUpFailed({ canisterId; reason }));
          emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason }), null, null);
          finishStorageFundingAttempt(canisterId, ?reason);
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return #err(reason);
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
      emitStorageFundingChanged(storageOwner, canisterId, #failed({ reason = "Internal error" }), null, null);
      finishStorageFundingAttempt(canisterId, ?"Internal error");
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
    let operationalSeverity : BackendEvents.StorageOperationalSeverity = switch (severity) {
      case (#warning) #warning;
      case (#critical) #critical;
    };
    emitStorageOperationalStateChanged(storageOwner, canisterId, [#cycles], ?operationalSeverity);
    switch (await runProIncludedStorageFunding<system>(storageOwner, canisterId, null)) {
      case (#ok _) {};
      case (#err(message)) {
        if (message == STORAGE_FUNDING_IN_PROGRESS_ERROR) return;
        if (not shouldFallbackToPaidAutoTopUp(message)) return;
        ignore await runAutoTopUp<system>(storageOwner, canisterId, null);
      };
    };
  };

  func ensureAutoTopUpForStorageOperation<system>(
    storageOwner : Principal,
    canisterId : Principal,
    currentBalance : Nat,
    requiredBalance : Nat,
  ) : async Result.Result<{ cyclesAdded : Nat }, Text> {
    let requestedCycles = if (requiredBalance > currentBalance) {
      ?Nat.sub(requiredBalance, currentBalance);
    } else {
      null;
    };
    emitStorageFundingChanged(storageOwner, canisterId, #requested, ?currentBalance, ?requiredBalance);
    emitStorageOperationalStateChanged(storageOwner, canisterId, [#cycles, #funding], ?#warning);
    switch (await runProIncludedStorageFunding<system>(storageOwner, canisterId, requestedCycles)) {
      case (#ok(info)) #ok(info);
      case (#err(includedFundingError)) {
        if (includedFundingError == STORAGE_FUNDING_IN_PROGRESS_ERROR) {
          return #err(includedFundingError);
        };
        if (not shouldFallbackToPaidAutoTopUp(includedFundingError)) {
          return #err(includedFundingError);
        };
        let settings = deps.getUserSettings(storageOwner);
        if (settings.autoTopUp and settings.topUpAmountCycles > 0) {
          await runAutoTopUp<system>(storageOwner, canisterId, requestedCycles);
        } else {
          #err(includedFundingError);
        };
      };
    };
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
    checkReserveRefillWatermark();
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

    // Guard includes ledger fee; actual transferred amount is what CMC accepts.
    // Unified pool — treasury subaccount is source for all CMC top-ups
    // (user, auto, and backend self-topup).
    //
    // NOTE: no `guardTreasuryIcpReserve` check here. Backend survival is
    // priority — if cycles drop below threshold and self-topup can't fire,
    // the whole system freezes (including refunds). Accepting risk of
    // draining the refund reserve in this specific flow.
    let transferResult = await deps.transferIcpToCmc(
      icpE8sNeeded,
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
        ignore await* deps.cmcHandleNotifyError(#selfTopUp, blockIndex, null, err);
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
