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

import Balance "lib";
import CMCTypes "../Types/CMCTypes";
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
    notifyUser : (Principal, Notifications.TypedEvent) -> ();
    notifyAdmins : (Notifications.TypedEvent) -> ();
    verifyCanisterOwner : (Principal, Principal) -> Bool;
    /// Transfer ICP from the treasury subaccount to CMC for a target
    /// canister. Unified pool: user top-ups, auto top-ups, and backend
    /// self-topup all go through this. Caller must check treasury ICP
    /// balance has sufficient reserve (see `guardTreasuryIcpReserve`).
    transferIcpToCmc : (Nat, Principal) -> async Result.Result<Nat, Text>;
    /// Notify CMC of an ICP-for-cycles deposit. Returns `NotifyError` directly
    /// (not a flat Text) so caller can classify by variant. See
    /// `handleCmcNotifyError` for the branches.
    notifyTopUp : (Nat64, Principal) -> async Result.Result<Nat, CMCTypes.NotifyError>;
    // Self-topup parameters — cycles.balance watermarks for the backend itself
    selfCanisterId : Principal;
    backendCyclesThreshold : Nat;
    backendCyclesTarget : Nat;
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

  /// Classify a CMC `notify_top_up` error:
  /// - `#Refunded`: CMC returned the ICP to treasury; refund user in `tokenId`.
  /// - `#InvalidTransaction`: malformed transfer, safe to refund.
  /// - `#Processing` / `#TransactionTooOld` / `#Other`: ambiguous — cycles
  ///   may or may not have been minted. Stay `#pending` and notify admin
  ///   to verify before calling `retryCmcNotify`.
  ///
  /// `context` describes the flow (`"topUp"`, `"autoTopUp"`) — surfaced in
  /// admin notifications and user-facing messages.
  func handleCmcNotifyError(
    ctx : {
      caller : Principal;
      canisterId : Principal;
      tokenId : TreasuryTypes.TokenId;
      chargedAmount : Nat;
      blockIndex : Nat;
      context : Text;
    },
    err : CMCTypes.NotifyError,
  ) : async* () {
    switch (err) {
      case (#Refunded({ block_index = _; reason })) {
        // CMC sent ICP back to treasury (same subaccount it came from).
        // Refund the user in their `tokenId` from treasury.
        Debug.print("[cmc notify] #Refunded for " # Principal.toText(ctx.canisterId) # " block=" # Nat.toText(ctx.blockIndex) # " (reason: " # reason # ")");
        await* safeRefund(ctx.caller, ctx.tokenId, ctx.chargedAmount, ctx.context # " #Refunded: " # reason);
      };
      case (#Processing) {
        // CMC still working. ICP is NOT refundable yet — might become cycles.
        // Admin retries via retryCmcNotify once state is clear.
        Debug.print("[cmc notify] #Processing for " # Principal.toText(ctx.canisterId) # " block=" # Nat.toText(ctx.blockIndex) # " — NOT refunding");
        deps.notifyAdmins(#cmcNotifyStuck({
          canisterId = ctx.canisterId;
          blockIndex = ctx.blockIndex;
          reason = "CMC #Processing — retry once state is final";
          caller = ctx.caller;
        }));
      };
      case (#TransactionTooOld(_)) {
        // notify was submitted too late; CMC may or may not have credited cycles.
        // Unsafe to refund — admin must verify canister balance before any recovery.
        Debug.print("[cmc notify] #TransactionTooOld for " # Principal.toText(ctx.canisterId) # " block=" # Nat.toText(ctx.blockIndex) # " — NOT refunding");
        deps.notifyAdmins(#cmcNotifyStuck({
          canisterId = ctx.canisterId;
          blockIndex = ctx.blockIndex;
          reason = "CMC #TransactionTooOld — check canister cycles before retry";
          caller = ctx.caller;
        }));
      };
      case (#InvalidTransaction(msg)) {
        // Terminal failure — ICP transfer is malformed from CMC's view,
        // cycles cannot be minted from this block. Safe to refund from
        // treasury (no double-credit risk).
        await* safeRefund(ctx.caller, ctx.tokenId, ctx.chargedAmount, ctx.context # " #InvalidTransaction: " # msg);
      };
      case (#Other({ error_message; error_code })) {
        // Ambiguous: CMC may or may not have minted cycles from this block.
        // Auto-refunding is unsafe — if cycles DID arrive, user gets both
        // cycles and refund (double credit from treasury). Stay `#pending`,
        // escalate to admin with block + error details so they can verify
        // the canister's actual cycles balance before deciding.
        Debug.print(
          "[cmc notify] #Other code=" # Nat64.toText(error_code) # " for " # Principal.toText(ctx.canisterId)
          # " block=" # Nat.toText(ctx.blockIndex) # " — NOT refunding: " # error_message,
        );
        deps.notifyAdmins(#cmcNotifyStuck({
          canisterId = ctx.canisterId;
          blockIndex = ctx.blockIndex;
          reason = "CMC #Other(" # Nat64.toText(error_code) # "): " # error_message # " — verify canister cycles before retry/refund";
          caller = ctx.caller;
        }));
      };
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
              case (#Created or #Reactivated) deps.notifyUser(userId, #subscriptionActivated({ plan }));
              case (#Renewed) deps.notifyUser(userId, #subscriptionRenewed({ plan; expiresAt = ?result.expiresAt }));
            };
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
                case (#Renewed) deps.notifyUser(userId, #subscriptionRenewed({ plan; expiresAt = ?grantResult.expiresAt }));
                case (#Created or #Reactivated) deps.notifyUser(userId, #subscriptionActivated({ plan }));
              };
            };
            case (#err(msg)) {
              // Charge succeeded but grant failed — refund the user
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
            deps.notifyUser(userId, #subscriptionExpired);
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
        deps.notifyAdmins(#treasuryIcpLow({ currentBalance; required = cmcDebit; reserve = TREASURY_ICP_RESERVE }));
        deps.notifyUser(caller, #topUpFailed({ canisterId; reason = "Service temporarily unavailable — try later" }));
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
      case (#err(err)) {
        // Classify by CMC NotifyError variant: refund only for terminal failures,
        // stay #pending + notify admin for retriable states, forward ICP for
        // #Refunded. See `handleCmcNotifyError`.
        await* handleCmcNotifyError(
          {
            caller;
            canisterId;
            tokenId = charged.tokenId;
            chargedAmount = charged.amount;
            blockIndex;
            context = "topUpFromBalance";
          },
          err,
        );
        deps.notifyUser(caller, #topUpFailed({ canisterId; reason = "CMC notify failed: " # debug_show err }));
        #err("CMC top-up notification failed: " # debug_show err);
      };
    };
  };

  // ---- Auto top-up (triggered by storage canister) ----

  transient let autoTopUpInFlight = Set.empty<Principal>(); // canisters currently being topped up

  /// Called from onStorageLowCycles. Checks user settings and auto-tops up if enabled.
  /// Uses in-flight lock to prevent duplicate top-ups from concurrent callbacks.
  func processAutoTopUp<system>(
    storageOwner : Principal,
    canisterId : Principal,
    currentBalance : Nat,
    severity : { #warning; #critical },
  ) : async () {
    // Heavy path — multiple HTTPS outcalls (rate) + CMC + ledger transfers.
    // Opportunistic self-topup keeps the backend itself solvent.
    maybeTopUpSelf<system>();

    let settings = deps.getUserSettings(storageOwner);
    if (not settings.autoTopUp) return;

    // In-flight lock: skip if top-up already in progress for this canister
    if (Set.contains(autoTopUpInFlight, Principal.compare, canisterId)) return;
    Set.add(autoTopUpInFlight, Principal.compare, canisterId);

    // Pre-checks (before async work)
    let eligible = switch (subscriptions.get(storageOwner)) {
      case (?sub) {
        switch (sub.plan) {
          case (#Pro or #Trial) true;
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
      let cmcDebit = icpE8sNeeded + Balance.LEDGER_FEE;
      // Unified pool reserve guard — refund immediately if treasury can't
      // cover without depleting the refund/payout buffer.
      switch (await* guardTreasuryIcpReserve(cmcDebit)) {
        case (?currentBalance) {
          pendingCharge := null;
          await* safeRefund(storageOwner, charged.tokenId, charged.amount, "autoTopUp: treasury ICP reserve low");
          deps.notifyAdmins(#treasuryIcpLow({ currentBalance; required = cmcDebit; reserve = TREASURY_ICP_RESERVE }));
          deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "Service temporarily unavailable" }));
          Set.remove(autoTopUpInFlight, Principal.compare, canisterId);
          return;
        };
        case null {};
      };
      let transferResult = await deps.transferIcpToCmc(cmcDebit, canisterId);
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
        case (#err(err)) {
          pendingCharge := null; // handleCmcNotifyError takes over (may refund, or leave pending)
          await* handleCmcNotifyError(
            {
              caller = storageOwner;
              canisterId;
              tokenId = charged.tokenId;
              chargedAmount = charged.amount;
              blockIndex;
              context = "processAutoTopUp";
            },
            err,
          );
          deps.notifyUser(storageOwner, #autoTopUpFailed({ canisterId; reason = "CMC notify failed: " # debug_show err }));
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
      deps.notifyAdmins(#backendLowCycles({
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
      deps.notifyAdmins(#backendSelfTopUpFailed({ reason }));
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
        deps.notifyAdmins(#backendSelfTopUpFailed({ reason }));
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
        // Money left the treasury but cycles didn't arrive — admin intervention
        // needed. This shouldn't happen in practice (CMC is idempotent) but
        // we log and notify for visibility.
        let reason = "CMC notify_top_up failed (ICP already debited, block " # Nat.toText(blockIndex) # "): " # debug_show err;
        Debug.print("[selfTopUp] " # reason);
        deps.notifyAdmins(#backendSelfTopUpFailed({ reason }));
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

  /// Admin-only retry of a stuck CMC `notify_top_up`. Used when the
  /// original top-up landed in `#Processing` / `#TransactionTooOld` /
  /// `#Other` and the admin has verified actual state (via canister
  /// cycles balance, ICP ledger, CMC subaccount). Takes the same
  /// parameters the original call captured in the #cmcNotifyStuck
  /// admin notification.
  ///
  /// On #ok — cycles were credited to the canister by CMC; we notify
  /// the original caller. No token refund (treasury already burned).
  /// On #err — classify again; the admin will see a fresh notification
  /// or a refund.
  public shared ({ caller }) func retryCmcNotify(
    args : {
      blockIndex : Nat;
      canisterId : Principal;
      originalCaller : Principal;
      tokenId : TreasuryTypes.TokenId;
      chargedAmount : Nat;
    },
  ) : async Result.Result<Nat, Text> {
    admin.assertAdmin(caller);
    let topUpResult = await deps.notifyTopUp(Nat64.fromNat(args.blockIndex), args.canisterId);
    switch (topUpResult) {
      case (#ok(cycles)) {
        deps.notifyUser(args.originalCaller, #topUpCompleted({ canisterId = args.canisterId; cyclesAmount = cycles }));
        #ok(cycles);
      };
      case (#err(err)) {
        await* handleCmcNotifyError(
          {
            caller = args.originalCaller;
            canisterId = args.canisterId;
            tokenId = args.tokenId;
            chargedAmount = args.chargedAmount;
            blockIndex = args.blockIndex;
            context = "retryCmcNotify";
          },
          err,
        );
        #err("retry CMC notify failed: " # debug_show err);
      };
    };
  };
};
