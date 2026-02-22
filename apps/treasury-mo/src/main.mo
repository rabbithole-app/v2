import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

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
    await* Treasury.distributePayment(treasury, caller, args);
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
    await* Treasury.getTreasuryBalances(treasury);
  };

  // ---- User methods ----

  /// Withdraw funds from caller's subaccount to an external ICRC account.
  public shared ({ caller }) func withdraw(args : Types.WithdrawArgs) : async Types.WithdrawResult {
    await* Treasury.withdraw(treasury, caller, args);
  };

  /// Get caller's balance for a specific token.
  public shared ({ caller }) func getBalance(tokenId : Types.TokenId) : async Nat {
    await* Treasury.getBalance(treasury, caller, tokenId);
  };

  /// Get caller's balances across all supported tokens.
  public shared ({ caller }) func getBalances() : async [Types.BalanceEntry] {
    await* Treasury.getBalances(treasury, caller);
  };

  /// Get caller's EVM address (derived via threshold ECDSA, cached).
  public shared ({ caller }) func getEvmAddress() : async ?Text {
    await* Treasury.getOrDeriveEvmAddress(treasury, caller);
  };

  /// Get the treasury canister's own EVM signing address.
  /// This is the address used to sign ERC-20 transfers in distributePayment.
  public shared func getTreasurySigningAddress() : async ?Text {
    await* Treasury.getTreasurySigningAddress(treasury);
  };

  /// Verify on-chain status of EVM transfers for a distribution.
  /// Admin only. Checks eth_getTransactionReceipt for each transfer with a txHash.
  public shared ({ caller }) func verifyDistribution(paymentId : Text) : async Types.VerifyDistributionResult {
    await* Treasury.verifyDistribution(treasury, caller, paymentId);
  };

  // ---- Helpers ----

  func assertAdmin(caller : Principal) {
    if (not Principal.equal(caller, treasury.store.admin)) {
      Runtime.trap("Unauthorized: caller is not admin");
    };
  };
};
