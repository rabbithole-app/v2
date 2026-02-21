import Array "mo:core/Array";
import Int "mo:core/Int";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Vector "mo:vector";

import Account "Account";
import Const "Const";
import LedgerTypes "LedgerTypes";
import Migrations "Migrations/lib";
import V1Types "Migrations/V1/Types";
import Types "Types";

module Treasury {
  public type StableStore = Migrations.VersionedStableStore;

  // ---- Init / Upgrade / FromVersion ----

  public func initStableStore(args : Types.InitArgs) : StableStore {
    #v1({
      processedPayments = Set.empty<Text>();
      distributions = Vector.new<Types.DistributionRecord>();
      var nextDistributionId = 0;
      admin = args.admin;
    });
  };

  public func upgradeStableStore(store : StableStore) : StableStore {
    Migrations.upgrade(store);
  };

  public type Treasury = {
    store : V1Types.StableStore;
    canisterId : Principal;
  };

  public func fromVersion(versionedStore : StableStore, canisterId : Principal) : Treasury {
    let store = Migrations.getCurrentState(versionedStore);
    { store; canisterId };
  };

  // ---- Ledger resolution ----

  func getLedgerCanisterId(tokenId : Types.TokenId) : Text {
    switch (tokenId) {
      case (#ICP) Const.ICP_LEDGER;
      case (#ckUSDC) Const.CKUSDC_LEDGER;
      case (#ckUSDT) Const.CKUSDT_LEDGER;
      case (#ckETH) Const.CKETH_LEDGER;
    };
  };

  func getFee(tokenId : Types.TokenId) : Nat {
    switch (tokenId) {
      case (#ICP) Const.ICP_FEE;
      case (#ckUSDC) Const.CKUSDC_FEE;
      case (#ckUSDT) Const.CKUSDT_FEE;
      case (#ckETH) Const.CKETH_FEE;
    };
  };

  func getMinWithdraw(tokenId : Types.TokenId) : Nat {
    switch (tokenId) {
      case (#ICP) Const.MIN_WITHDRAW_ICP;
      case (#ckUSDC) Const.MIN_WITHDRAW_CKUSDC;
      case (#ckUSDT) Const.MIN_WITHDRAW_CKUSDT;
      case (#ckETH) Const.MIN_WITHDRAW_CKETH;
    };
  };

  func getLedger(tokenId : Types.TokenId) : LedgerTypes.Self {
    actor (getLedgerCanisterId(tokenId)) : LedgerTypes.Self;
  };

  // ---- Distribution ----

  /// Distribute a payment to treasury + ambassadors.
  /// All inter-canister calls are inlined to avoid nested self-calls.
  public func distributePayment(
    treasury : Treasury,
    caller : Principal,
    args : Types.DistributePaymentArgs,
  ) : async Types.DistributePaymentResult {
    // Auth check
    if (not Principal.equal(caller, treasury.store.admin)) {
      return #err(#Unauthorized);
    };

    // Idempotency check
    if (Set.contains(treasury.store.processedPayments, Text.compare, args.paymentId)) {
      return #err(#AlreadyProcessed);
    };

    if (args.amount == 0) {
      return #err(#InvalidAmount);
    };

    // Calculate split
    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.amount, args.ambassadorL1, args.ambassadorL2);

    let ledger = getLedger(args.tokenId);
    let fee = getFee(args.tokenId);
    let now = Time.now();

    var transfers = Vector.new<Types.TransferRecord>();

    // Each recipient pays the transfer fee from their share.
    // Transfer net amount = share - fee. The ledger charges fee on top,
    // so total deducted from default account = (share - fee) + fee = share.

    // Transfer treasury share (share - fee)
    let treasurySubaccount = Account.principalToSubaccount(treasury.store.admin);
    let treasuryNet = if (treasuryAmount > fee) { treasuryAmount - fee } else { 0 };
    let treasuryResult = await ledger.icrc1_transfer({
      to = { owner = treasury.canisterId; subaccount = ?treasurySubaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = null;
      created_at_time = ?Nat64.fromNat(Int.abs(now));
      amount = treasuryNet;
    });
    Vector.add(
      transfers,
      makeTransferRecord(treasury.store.admin, ?treasurySubaccount, treasuryNet, args.tokenId, treasuryResult),
    );

    // Transfer L1 ambassador share (share - fee)
    switch (args.ambassadorL1) {
      case (?l1) {
        if (l1Amount > fee) {
          let l1Net = l1Amount - fee;
          let l1Subaccount = Account.principalToSubaccount(l1);
          let l1Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l1Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = null;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 1);
            amount = l1Net;
          });
          Vector.add(
            transfers,
            makeTransferRecord(l1, ?l1Subaccount, l1Net, args.tokenId, l1Result),
          );
        };
      };
      case null {};
    };

    // Transfer L2 ambassador share (share - fee)
    switch (args.ambassadorL2) {
      case (?l2) {
        if (l2Amount > fee) {
          let l2Net = l2Amount - fee;
          let l2Subaccount = Account.principalToSubaccount(l2);
          let l2Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l2Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = null;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 2);
            amount = l2Net;
          });
          Vector.add(
            transfers,
            makeTransferRecord(l2, ?l2Subaccount, l2Net, args.tokenId, l2Result),
          );
        };
      };
      case null {};
    };

    // Check if any transfer failed
    let transfersArray = Vector.toArray(transfers);
    for (t in transfersArray.vals()) {
      switch (t.error) {
        case (?err) {
          return #err(#TransferFailed({ recipient = Principal.toText(t.recipient); error = err }));
        };
        case null {};
      };
    };

    // Record in audit log
    let record : Types.DistributionRecord = {
      id = treasury.store.nextDistributionId;
      paymentId = args.paymentId;
      payer = args.payer;
      tokenId = args.tokenId;
      totalAmount = args.amount;
      treasuryAmount;
      l1Amount;
      l2Amount;
      ambassadorL1 = args.ambassadorL1;
      ambassadorL2 = args.ambassadorL2;
      timestamp = now;
      transfers = transfersArray;
    };
    Vector.add(treasury.store.distributions, record);
    treasury.store.nextDistributionId += 1;

    // Mark as processed
    Set.add(treasury.store.processedPayments, Text.compare, args.paymentId);

    #ok(record);
  };

  // ---- Withdraw ----

  /// Withdraw funds from user's subaccount to an external ICRC account.
  public func withdraw(
    treasury : Treasury,
    caller : Principal,
    args : Types.WithdrawArgs,
  ) : async Types.WithdrawResult {
    let ledger = getLedger(args.tokenId);
    let fee = getFee(args.tokenId);
    let minAmount = getMinWithdraw(args.tokenId);

    if (args.amount < minAmount) {
      return #err(#BelowMinimum({ minimum = minAmount }));
    };

    // Check balance
    let callerSubaccount = Account.principalToSubaccount(caller);
    let balance = await ledger.icrc1_balance_of({
      owner = treasury.canisterId;
      subaccount = ?callerSubaccount;
    });

    if (balance < args.amount + fee) {
      return #err(#InsufficientBalance({ available = balance }));
    };

    // Execute transfer
    let result = await ledger.icrc1_transfer({
      to = { owner = args.to.owner; subaccount = args.to.subaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = ?callerSubaccount;
      created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
      amount = args.amount;
    });

    switch (result) {
      case (#Ok(blockIndex)) #ok(blockIndex);
      case (#Err(err)) #err(#TransferFailed(debug_show (err)));
    };
  };

  // ---- Balance queries ----

  /// Get balance for a specific token.
  public func getBalance(
    treasury : Treasury,
    caller : Principal,
    tokenId : Types.TokenId,
  ) : async Nat {
    let ledger = getLedger(tokenId);
    let subaccount = Account.principalToSubaccount(caller);
    await ledger.icrc1_balance_of({
      owner = treasury.canisterId;
      subaccount = ?subaccount;
    });
  };

  /// Get balances across all supported tokens.
  public func getBalances(
    treasury : Treasury,
    caller : Principal,
  ) : async [Types.BalanceEntry] {
    let subaccount = Account.principalToSubaccount(caller);
    let tokens : [Types.TokenId] = [#ICP, #ckUSDC, #ckUSDT, #ckETH];
    var results = Vector.new<Types.BalanceEntry>();

    for (tokenId in tokens.vals()) {
      let ledger = getLedger(tokenId);
      let balance = await ledger.icrc1_balance_of({
        owner = treasury.canisterId;
        subaccount = ?subaccount;
      });
      Vector.add(results, { tokenId; balance });
    };

    Vector.toArray(results);
  };

  // ---- Admin queries ----

  /// Get distribution log with pagination.
  public func getDistributionLog(
    treasury : Treasury,
    opts : Types.DistributionLogOptions,
  ) : [Types.DistributionRecord] {
    let total = Vector.size(treasury.store.distributions);
    if (opts.offset >= total) return [];

    let end = if (opts.offset + opts.limit > total) { total } else { opts.offset + opts.limit };
    let size = end - opts.offset;

    Array.tabulate<Types.DistributionRecord>(
      size,
      func(i : Nat) : Types.DistributionRecord {
        Vector.get(treasury.store.distributions, opts.offset + i);
      },
    );
  };

  /// Get distributions for a specific user.
  public func getUserDistributions(
    treasury : Treasury,
    user : Principal,
  ) : [Types.DistributionRecord] {
    let total = Vector.size(treasury.store.distributions);
    var results = Vector.new<Types.DistributionRecord>();
    var i = 0;

    while (i < total) {
      let record = Vector.get(treasury.store.distributions, i);
      if (
        Principal.equal(record.payer, user) or
        (switch (record.ambassadorL1) { case (?l1) Principal.equal(l1, user); case null false }) or
        (switch (record.ambassadorL2) { case (?l2) Principal.equal(l2, user); case null false })
      ) {
        Vector.add(results, record);
      };
      i += 1;
    };

    Vector.toArray(results);
  };

  /// Get treasury operations account balances.
  public func getTreasuryBalances(treasury : Treasury) : async [Types.BalanceEntry] {
    await getBalances(treasury, treasury.store.admin);
  };

  // ---- Helpers ----

  func calculateSplit(
    amount : Nat,
    l1 : ?Principal,
    l2 : ?Principal,
  ) : (Nat, Nat, Nat) {
    switch (l1, l2) {
      case (?_, ?_) {
        let l1Amount = amount * Const.L1_BPS / Const.BPS_BASE;
        let l2Amount = amount * Const.L2_BPS / Const.BPS_BASE;
        let treasuryAmount = amount - l1Amount - l2Amount;
        (treasuryAmount, l1Amount, l2Amount);
      };
      case (?_, null) {
        let l1Amount = amount * Const.L1_BPS / Const.BPS_BASE;
        let treasuryAmount = amount - l1Amount;
        (treasuryAmount, l1Amount, 0);
      };
      case _ (amount, 0, 0);
    };
  };

  func makeTransferRecord(
    recipient : Principal,
    subaccount : ?Blob,
    amount : Nat,
    tokenId : Types.TokenId,
    result : LedgerTypes.Icrc1TransferResult,
  ) : Types.TransferRecord {
    switch (result) {
      case (#Ok(blockIndex)) {
        { recipient; subaccount; amount; tokenId; blockIndex = ?blockIndex; error = null };
      };
      case (#Err(err)) {
        { recipient; subaccount; amount; tokenId; blockIndex = null; error = ?(debug_show (err)) };
      };
    };
  };
};
