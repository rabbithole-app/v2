import Array "mo:core/Array";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Time "mo:core/Time";

import Vector "mo:vector";

import TreasuryTypes "mo:treasury/Types";

import CMCTypes "../Types/CMCTypes";

module {
  public type CmcOpKind = { #TopUp; #CreateCanister };

  public type CmcOpSource = {
    #userTopUp : { canisterId : Principal };
    #autoTopUp : { canisterId : Principal };
    #selfTopUp;
    #storageCreation : { creationId : Nat };
  };

  /// Refund context for terminal-fail path. `null` for `#selfTopUp` — CMC
  /// returns ICP to the originating subaccount (treasury) automatically, no
  /// separate refund call needed.
  public type RefundContext = {
    payer : Principal;
    tokenId : TreasuryTypes.TokenId;
    amount : Nat;
  };

  public type PendingCmcOp = {
    id : Nat;
    kind : CmcOpKind;
    blockIndex : Nat;
    source : CmcOpSource;
    refund : ?RefundContext;
    lastError : Text;
    attempts : Nat;
    lastAttemptAt : ?Time.Time;
    createdAt : Time.Time;
  };

  /// Returned by `retryPendingCmcOp`. Rich variant so admin UI can react
  /// without parsing Text.
  public type CmcOpRetryResult = {
    #resolved;
    #refunded : { receipt : ?TreasuryTypes.RefundReceipt };
    #stillAmbiguous : { attempts : Nat };
    #scheduled : { canisterId : Principal };
    #notFound;
    #blockedByRefund;
  };

  public type CmcNotifyOutcome = {
    #refunded : { reason : Text; receipt : ?TreasuryTypes.RefundReceipt };
    #pending : { id : Nat; reason : Text };
    #refundPending : { id : Nat; reason : Text };
  };

  public type IncludedFundingSettlement = {
    #completed;
    #refunded;
  };

  /// Classifier output for a CMC `NotifyError`. Pure — side effects happen
  /// in the mixin. `#refund` means terminal (safe to refund / already
  /// refunded upstream). `#persist` means ambiguous (enqueue pending op).
  public type NotifyErrorAction = {
    #refund : Text;
    #persist : Text;
  };

  /// Mutable counters for admin observability. Kept as `var` fields so
  /// increments don't copy the record. A read-only snapshot is exposed via
  /// `StatsView` for public API responses.
  public type Stats = {
    var totalCreated : Nat;
    var totalResolved : Nat;
    var totalRefunded : Nat;
    var totalDismissed : Nat;
  };

  public type StatsView = {
    totalCreated : Nat;
    totalResolved : Nat;
    totalRefunded : Nat;
    totalDismissed : Nat;
  };

  public type Store = {
    ops : Vector.Vector<PendingCmcOp>;
    var nextId : Nat;
    stats : Stats;
  };

  public func new() : Store {
    {
      ops = Vector.new<PendingCmcOp>();
      var nextId = 0;
      stats = {
        var totalCreated = 0;
        var totalResolved = 0;
        var totalRefunded = 0;
        var totalDismissed = 0;
      };
    };
  };

  public func statsView(store : Store) : StatsView {
    {
      totalCreated = store.stats.totalCreated;
      totalResolved = store.stats.totalResolved;
      totalRefunded = store.stats.totalRefunded;
      totalDismissed = store.stats.totalDismissed;
    };
  };

  public func incrCreated(store : Store) { store.stats.totalCreated += 1 };
  public func incrResolved(store : Store) { store.stats.totalResolved += 1 };
  public func incrRefunded(store : Store) { store.stats.totalRefunded += 1 };
  public func incrDismissed(store : Store) { store.stats.totalDismissed += 1 };

  // ---- Dedup helpers ----

  /// Find existing op by blockIndex. CMC block index is globally unique —
  /// same index implies the same underlying CMC operation.
  func findByBlockIndex(store : Store, blockIndex : Nat) : ?(Nat, PendingCmcOp) {
    var i : Nat = 0;
    let size = Vector.size(store.ops);
    while (i < size) {
      let op = Vector.get(store.ops, i);
      if (op.blockIndex == blockIndex) return ?(i, op);
      i += 1;
    };
    null;
  };

  /// Enqueue or dedup-update by blockIndex. Returns op id. Stats: new row
  /// bumps totalCreated; dedup update bumps attempts only.
  public func enqueueOrUpdate(
    store : Store,
    args : {
      kind : CmcOpKind;
      blockIndex : Nat;
      source : CmcOpSource;
      refund : ?RefundContext;
      lastError : Text;
    },
  ) : Nat {
    switch (findByBlockIndex(store, args.blockIndex)) {
      case (?(idx, existing)) {
        let updated : PendingCmcOp = {
          existing with
          attempts = existing.attempts + 1;
          lastAttemptAt = ?Time.now();
          lastError = args.lastError;
        };
        Vector.put(store.ops, idx, updated);
        existing.id;
      };
      case null {
        let id = store.nextId;
        store.nextId += 1;
        let op : PendingCmcOp = {
          id;
          kind = args.kind;
          blockIndex = args.blockIndex;
          source = args.source;
          refund = args.refund;
          lastError = args.lastError;
          attempts = 1;
          lastAttemptAt = null;
          createdAt = Time.now();
        };
        Vector.add(store.ops, op);
        incrCreated(store);
        id;
      };
    };
  };

  public func findById(store : Store, id : Nat) : ?PendingCmcOp {
    var i : Nat = 0;
    let size = Vector.size(store.ops);
    while (i < size) {
      let op = Vector.get(store.ops, i);
      if (op.id == id) return ?op;
      i += 1;
    };
    null;
  };

  /// Update `attempts` / `lastError` / `lastAttemptAt` on an existing row
  /// after a retry that kept it ambiguous. Returns the new attempts count,
  /// or `null` if the row disappeared.
  public func bumpAttempts(store : Store, id : Nat, lastError : Text) : ?Nat {
    var i : Nat = 0;
    let size = Vector.size(store.ops);
    while (i < size) {
      let op = Vector.get(store.ops, i);
      if (op.id == id) {
        let attempts = op.attempts + 1;
        let updated : PendingCmcOp = {
          op with
          attempts;
          lastAttemptAt = ?Time.now();
          lastError;
        };
        Vector.put(store.ops, i, updated);
        return ?attempts;
      };
      i += 1;
    };
    null;
  };

  /// Remove op by id. Returns true if removed, false if id not found.
  /// Stats NOT updated — caller decides which counter (Resolved / Refunded
  /// / Dismissed) to increment based on the removal reason.
  public func removeById(store : Store, id : Nat) : Bool {
    var i : Nat = 0;
    let size = Vector.size(store.ops);
    while (i < size) {
      if (Vector.get(store.ops, i).id == id) {
        let last = size - 1 : Nat;
        if (i < last) {
          Vector.put(store.ops, i, Vector.get(store.ops, last));
        };
        ignore Vector.removeLast(store.ops);
        return true;
      };
      i += 1;
    };
    false;
  };

  /// Cursor pagination by id ASC. `afterId = null` → from the start.
  /// `limit = null` → default 100. Max 500 per page to stay under 2MB.
  public func listPending(
    store : Store,
    afterId : ?Nat,
    limit : ?Nat,
  ) : [PendingCmcOp] {
    let cap = switch (limit) { case (?n) if (n > 500) 500 else n; case null 100 };
    if (cap == 0) return [];
    let afterIdVal = Option.get(afterId, 0);
    let needsAfter = Option.isSome(afterId);

    // First pass — collect matching ops into a local Vector sorted by id ASC.
    // O(n log n) via copy + sort; n is bounded by queue size (~hundreds max).
    let all = Vector.toArray(store.ops);
    let filtered = Array.filter<PendingCmcOp>(
      all,
      func(op) = if (needsAfter) op.id > afterIdVal else true,
    );
    let sorted = Array.sort<PendingCmcOp>(filtered, func(a, b) = if (a.id < b.id) #less else if (a.id > b.id) #greater else #equal);
    if (sorted.size() <= cap) sorted else Array.sliceToArray<PendingCmcOp>(sorted, 0, cap);
  };

  // ---- Classifier ----

  /// Pure classifier for CMC NotifyError.
  /// - `#Refunded` → terminal safe refund (CMC returned ICP to origin)
  /// - `#Processing` / `#TransactionTooOld` / `#InvalidTransaction` / `#Other`
  ///   → needs recovery/manual reconciliation, enqueue
  public func classifyNotifyError(err : CMCTypes.NotifyError) : NotifyErrorAction {
    switch (err) {
      case (#Refunded({ reason; block_index = _ })) #refund("CMC #Refunded: " # reason);
      case (#Processing) #persist("CMC #Processing — retry once state is final");
      case (#TransactionTooOld(_)) #persist("CMC #TransactionTooOld — manual reconciliation required");
      case (#InvalidTransaction(msg)) #persist("CMC #InvalidTransaction — manual reconciliation required: " # msg);
      case (#Other({ error_message; error_code })) {
        #persist("CMC #Other(" # debug_show error_code # "): " # error_message);
      };
    };
  };
};
