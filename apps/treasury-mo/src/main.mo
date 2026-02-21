import Principal "mo:core/Principal";
import Debug "mo:base/Debug";

import Treasury "";
import Types "Types";

shared ({ caller = installer }) persistent actor class TreasuryCanister(initArgs : Types.InitArgs) = this {
  transient let canisterId = Principal.fromActor(this);

  var versionedStore = Treasury.initStableStore(initArgs);
  versionedStore := Treasury.upgradeStableStore(versionedStore);
  transient let treasury = Treasury.fromVersion(versionedStore, canisterId);

  // ---- Admin methods ----

  /// Distribute a payment among treasury and ambassadors.
  /// Only callable by the admin (Backend canister).
  public shared ({ caller }) func distributePayment(args : Types.DistributePaymentArgs) : async Types.DistributePaymentResult {
    await Treasury.distributePayment(treasury, caller, args);
  };

  /// Get distribution audit log with pagination. Admin only.
  public query ({ caller }) func getDistributionLog(opts : Types.DistributionLogOptions) : async [Types.DistributionRecord] {
    assertAdmin(caller);
    Treasury.getDistributionLog(treasury, opts);
  };

  /// Get distributions related to a specific user. Admin only.
  public query ({ caller }) func getUserDistributions(user : Principal) : async [Types.DistributionRecord] {
    assertAdmin(caller);
    Treasury.getUserDistributions(treasury, user);
  };

  /// Get treasury operations account balances. Admin only.
  public shared ({ caller }) func getTreasuryBalances() : async [Types.BalanceEntry] {
    assertAdmin(caller);
    await Treasury.getTreasuryBalances(treasury);
  };

  // ---- User methods ----

  /// Withdraw funds from caller's subaccount to an external ICRC account.
  public shared ({ caller }) func withdraw(args : Types.WithdrawArgs) : async Types.WithdrawResult {
    await Treasury.withdraw(treasury, caller, args);
  };

  /// Get caller's balance for a specific token.
  public shared ({ caller }) func getBalance(tokenId : Types.TokenId) : async Nat {
    await Treasury.getBalance(treasury, caller, tokenId);
  };

  /// Get caller's balances across all supported tokens.
  public shared ({ caller }) func getBalances() : async [Types.BalanceEntry] {
    await Treasury.getBalances(treasury, caller);
  };

  // ---- Helpers ----

  func assertAdmin(caller : Principal) {
    if (not Principal.equal(caller, treasury.store.admin)) {
      Debug.trap("Unauthorized: caller is not admin");
    };
  };
};
