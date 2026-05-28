import Debug "mo:core/Debug";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import TreasuryTypes "mo:treasury/Types";

import BackendEvents "../BackendEvents/lib";
import CmcRecovery "lib";
import CMCTypes "../Types/CMCTypes";
import Notifications "../Notifications/lib";
import Types "../StorageDeployer/Types";

mixin (
  admin : { assertAdmin : (Principal) -> () },
  treasury : {
    simpleRefund : (Principal, TreasuryTypes.TokenId, Nat) -> async* Result.Result<TreasuryTypes.RefundReceipt, Text>;
  },
  cmc : {
    notifyTopUp : (Nat64, Principal) -> async Result.Result<Nat, CMCTypes.NotifyError>;
    /// Replay `notify_create_canister` for a stuck `#storageCreation`.
    /// Impl MUST reconstruct the original `NotifyCreateCanisterArg` from
    /// the creation record (controllers + env vars) — passing `null`
    /// settings risks a canister with wrong config if CMC hasn't yet
    /// resolved the block.
    notifyCreateCanisterForCreation : (creationId : Nat, blockIndex : Nat) -> async Result.Result<Principal, CMCTypes.NotifyError>;
  },
  creations : {
    get : (Nat) -> ?Types.StorageCreationRecord;
    mutate : (Nat, (Types.StorageCreationRecord) -> Types.StorageCreationRecord) -> ?Types.StorageCreationRecord;
  },
  deps : {
    /// Internal resume — no caller-auth, shares `creationLocks` with the
    /// public `recoverFailedStorage(#resume)`. Must be idempotent.
    resumeFailedCreationInternal : (Nat) -> async Result.Result<(), Text>;
    /// Internal refund — idempotent (Timer + admin call race).
    refundFailedCreationInternal : (Nat) -> async Result.Result<(), Text>;
    events : BackendEvents.EventSink;
    /// For `#selfTopUp` retry — the backend canister's own principal.
    selfCanisterId : Principal;
    settleIncludedFundingReservation : (Nat, CmcRecovery.IncludedFundingSettlement) -> ();
  },
) {
  let cmcStore = CmcRecovery.new();

  func emitCmcNotification(recipient : Principal, event : Notifications.NotificationPayload) {
    deps.events.emit(#notificationRequested({ recipient; payload = event; correlationId = null }));
  };

  func emitCmcAdminNotification(event : Notifications.NotificationPayload) {
    deps.events.emit(#adminNotificationRequested({ payload = event; correlationId = null }));
  };

  // ---- Internal: shared entry point for all 4 call sites ----

  /// Called by: Balance.topUpFromBalance, Balance.processAutoTopUp,
  /// Balance.selfTopUpFromTreasury, StorageDeployer orchestrator
  /// (via onCmcNotifyFailed callback). Classifies the error and either
  /// refunds (terminal) or enqueues a pending op (ambiguous).
  func handleCmcNotifyError(
    source : CmcRecovery.CmcOpSource,
    blockIndex : Nat,
    refund : ?CmcRecovery.RefundContext,
    err : CMCTypes.NotifyError,
  ) : async* CmcRecovery.CmcNotifyOutcome {
    let kind : CmcRecovery.CmcOpKind = switch (source) {
      case (#storageCreation(_)) #CreateCanister;
      case _ #TopUp;
    };

    switch (CmcRecovery.classifyNotifyError(err)) {
      case (#refund(reason)) {
        Debug.print("[cmc recovery] terminal blockIndex=" # Nat.toText(blockIndex) # " " # reason);
        switch (await* executeTerminalRefund(source, refund, reason)) {
          case (#ok(receipt)) {
            deps.settleIncludedFundingReservation(blockIndex, #refunded);
            #refunded({ reason; receipt });
          };
          case (#err(message)) {
            let id = CmcRecovery.enqueueOrUpdate(
              cmcStore,
              {
                kind;
                blockIndex;
                source;
                refund;
                lastError = reason # "; refund pending: " # message;
              },
            );
            emitCmcAdminNotification(#cmcNotifyStuck({
              id;
              canisterId = targetCanisterId(source, deps.selfCanisterId);
              blockIndex;
              reason = reason # "; refund pending: " # message;
              caller = payerOf(source, refund, deps.selfCanisterId);
            }));
            #refundPending({ id; reason = message });
          };
        };
      };
      case (#persist(reason)) {
        let id = CmcRecovery.enqueueOrUpdate(
          cmcStore,
          { kind; blockIndex; source; refund; lastError = reason },
        );
        Debug.print("[cmc recovery] ambiguous enqueue id=" # Nat.toText(id) # " blockIndex=" # Nat.toText(blockIndex) # " " # reason);
        emitCmcAdminNotification(#cmcNotifyStuck({
          id;
          canisterId = targetCanisterId(source, deps.selfCanisterId);
          blockIndex;
          reason;
          caller = payerOf(source, refund, deps.selfCanisterId);
        }));
        #pending({ id; reason });
      };
    };
  };

  /// Terminal-path refund. For `#storageCreation` — delegate to the full
  /// internal refund helper (marks license refunded + removes creation).
  /// For other sources — simple treasury refund (idempotent at CMC level,
  /// re-refund risk handled by classifier-only-once semantics).
  func executeTerminalRefund(
    source : CmcRecovery.CmcOpSource,
    refund : ?CmcRecovery.RefundContext,
    reason : Text,
  ) : async* Result.Result<?TreasuryTypes.RefundReceipt, Text> {
    switch (source) {
      case (#storageCreation({ creationId })) {
        switch (await deps.refundFailedCreationInternal(creationId)) {
          case (#ok) #ok(null);
          case (#err(msg)) {
            Debug.print("[cmc recovery] refundFailedCreationInternal(" # Nat.toText(creationId) # ") failed: " # msg);
            #err(msg);
          };
        };
      };
      case (_) {
        switch (refund) {
          case (?ctx) {
            switch (await* treasury.simpleRefund(ctx.payer, ctx.tokenId, ctx.amount)) {
              case (#ok(receipt)) #ok(?receipt);
              case (#err(msg)) {
                Debug.print("[cmc recovery] treasury.simpleRefund failed: " # msg # " (reason: " # reason # ")");
                #err(msg);
              };
            };
          };
          case null {
            // `#selfTopUp` with terminal CMC: ICP returned to treasury
            // subaccount automatically — no separate refund needed.
            #ok(null);
          };
        };
      };
    };
  };

  // ---- Public API ----

  public shared query ({ caller }) func listPendingCmcOps(
    args : { afterId : ?Nat; limit : ?Nat },
  ) : async [CmcRecovery.PendingCmcOp] {
    admin.assertAdmin(caller);
    CmcRecovery.listPending(cmcStore, args.afterId, args.limit);
  };

  public shared query ({ caller }) func getCmcRecoveryStats() : async CmcRecovery.StatsView {
    admin.assertAdmin(caller);
    CmcRecovery.statsView(cmcStore);
  };

  public shared ({ caller }) func dismissPendingCmcOp(id : Nat) : async { #ok; #notFound } {
    admin.assertAdmin(caller);
    if (CmcRecovery.removeById(cmcStore, id)) {
      CmcRecovery.incrDismissed(cmcStore);
      #ok;
    } else {
      #notFound;
    };
  };

  public shared ({ caller }) func retryPendingCmcOp(id : Nat) : async CmcRecovery.CmcOpRetryResult {
    admin.assertAdmin(caller);
    let ?op = CmcRecovery.findById(cmcStore, id) else return #notFound;
    await* retryDispatch<system>(op);
  };

  // ---- Retry dispatcher ----

  func retryDispatch<system>(op : CmcRecovery.PendingCmcOp) : async* CmcRecovery.CmcOpRetryResult {
    switch (op.source) {
      case (#userTopUp({ canisterId })) await* retryTopUp(op, canisterId, false);
      case (#autoTopUp({ canisterId })) await* retryTopUp(op, canisterId, true);
      case (#selfTopUp) await* retrySelfTopUp(op);
      case (#storageCreation({ creationId })) await* retryStorageCreation<system>(op, creationId);
    };
  };

  /// `#userTopUp` / `#autoTopUp` retry: replay notify_top_up for the
  /// existing canister. On success → remove row + emit user notification. On failure →
  /// classify: terminal → refund + remove, ambiguous → bump attempts.
  func retryTopUp(
    op : CmcRecovery.PendingCmcOp,
    canisterId : Principal,
    isAuto : Bool,
  ) : async* CmcRecovery.CmcOpRetryResult {
    let result = await cmc.notifyTopUp(Nat64.fromNat(op.blockIndex), canisterId);
    switch (result) {
      case (#ok(cycles)) {
        ignore CmcRecovery.removeById(cmcStore, op.id);
        CmcRecovery.incrResolved(cmcStore);
        deps.settleIncludedFundingReservation(op.blockIndex, #completed);
        switch (op.refund) {
          case (?ctx) {
            let event : Notifications.NotificationPayload = if (isAuto) {
              #autoTopUpCompleted({ canisterId; cyclesAmount = cycles });
            } else {
              #topUpCompleted({ canisterId; cyclesAmount = cycles });
            };
            emitCmcNotification(ctx.payer, event);
          };
          case null {};
        };
        #resolved;
      };
      case (#err(err)) {
        await* retryErrorPath(op, err);
      };
    };
  };

  /// `#selfTopUp` retry: replay notify_top_up for backend canister. On
  /// success → log + remove. On failure → classify same as user top-up,
  /// but terminal skips refund (treasury already holds the ICP).
  func retrySelfTopUp(op : CmcRecovery.PendingCmcOp) : async* CmcRecovery.CmcOpRetryResult {
    let result = await cmc.notifyTopUp(Nat64.fromNat(op.blockIndex), deps.selfCanisterId);
    switch (result) {
      case (#ok(cycles)) {
        Debug.print("[cmc recovery] selfTopUp resolved blockIndex=" # Nat.toText(op.blockIndex) # " cycles=" # Nat.toText(cycles));
        ignore CmcRecovery.removeById(cmcStore, op.id);
        CmcRecovery.incrResolved(cmcStore);
        #resolved;
      };
      case (#err(err)) {
        await* retryErrorPath(op, err);
      };
    };
  };

  /// `#storageCreation` retry: replay notify_create_canister. On success →
  /// persist canisterId + remove pending + schedule Timer(0) continuation.
  /// Guard: if creation is gone or refund already happened → #blockedByRefund.
  func retryStorageCreation<system>(
    op : CmcRecovery.PendingCmcOp,
    creationId : Nat,
  ) : async* CmcRecovery.CmcOpRetryResult {
    // Guard: refund path may have removed the creation record.
    switch (creations.get(creationId)) {
      case null {
        ignore CmcRecovery.removeById(cmcStore, op.id);
        return #blockedByRefund;
      };
      case (?_) {};
    };

    let result = await cmc.notifyCreateCanisterForCreation(creationId, op.blockIndex);
    switch (result) {
      case (#ok(canisterId)) {
        ignore creations.mutate(creationId, func(r) = { r with canisterId = ?canisterId });
        ignore CmcRecovery.removeById(cmcStore, op.id);
        CmcRecovery.incrResolved(cmcStore);
        ignore Timer.setTimer<system>(#seconds 0, func() : async () {
          ignore await deps.resumeFailedCreationInternal(creationId);
        });
        #scheduled({ canisterId });
      };
      case (#err(err)) {
        await* retryErrorPath(op, err);
      };
    };
  };

  /// Shared retry-error handler: classify and either refund-remove or
  /// update row with bumped attempts.
  func retryErrorPath(
    op : CmcRecovery.PendingCmcOp,
    err : CMCTypes.NotifyError,
  ) : async* CmcRecovery.CmcOpRetryResult {
    switch (CmcRecovery.classifyNotifyError(err)) {
      case (#refund(reason)) {
        switch (await* executeTerminalRefund(op.source, op.refund, reason)) {
          case (#ok(receipt)) {
            ignore CmcRecovery.removeById(cmcStore, op.id);
            deps.settleIncludedFundingReservation(op.blockIndex, #refunded);
            // `totalRefunded` counts compensating refund operations — `#selfTopUp`
            // has no user-facing refund (treasury auto-receives ICP back), so it
            // must not inflate the counter. Presence of `op.refund` is the
            // discriminator: #userTopUp / #autoTopUp / #storageCreation have one;
            // #selfTopUp doesn't.
            if (op.refund != null) {
              CmcRecovery.incrRefunded(cmcStore);
            };
            #refunded({ receipt });
          };
          case (#err(message)) {
            let attempts = switch (CmcRecovery.bumpAttempts(cmcStore, op.id, reason # "; refund pending: " # message)) {
              case (?n) n;
              case null op.attempts;
            };
            emitCmcAdminNotification(#cmcNotifyStuck({
              id = op.id;
              canisterId = targetCanisterId(op.source, deps.selfCanisterId);
              blockIndex = op.blockIndex;
              reason = reason # "; refund pending: " # message;
              caller = payerOf(op.source, op.refund, deps.selfCanisterId);
            }));
            #stillAmbiguous({ attempts });
          };
        };
      };
      case (#persist(reason)) {
        let attempts = switch (CmcRecovery.bumpAttempts(cmcStore, op.id, reason)) {
          case (?n) n;
          case null op.attempts;
        };
        // Re-notify admins with current context.
        emitCmcAdminNotification(#cmcNotifyStuck({
          id = op.id;
          canisterId = targetCanisterId(op.source, deps.selfCanisterId);
          blockIndex = op.blockIndex;
          reason;
          caller = payerOf(op.source, op.refund, deps.selfCanisterId);
        }));
        #stillAmbiguous({ attempts });
      };
    };
  };

  // ---- Helpers ----

  /// The canister that was the CMC target — for admin notification text.
  func targetCanisterId(source : CmcRecovery.CmcOpSource, selfId : Principal) : Principal {
    switch (source) {
      case (#userTopUp({ canisterId }) or #autoTopUp({ canisterId })) canisterId;
      case (#selfTopUp) selfId;
      case (#storageCreation(_)) selfId; // canisterId не известен до notify_create_canister
    };
  };

  /// Who paid (for admin notification text).
  func payerOf(source : CmcRecovery.CmcOpSource, refund : ?CmcRecovery.RefundContext, selfId : Principal) : Principal {
    switch (refund) {
      case (?ctx) ctx.payer;
      case null selfId;
    };
  };
};
