import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

import Treasury "";
import Types "Types";

/// Standalone Treasury canister. The `installer` (deployer principal) is the
/// sole admin — access control to privileged methods is enforced at this
/// actor's boundary. Treasury library itself trusts its caller (this canister).
///
/// Primary use-case is Rabbithole backend that embeds Treasury as a mixin
/// (see apps/backend/src/Treasury/mixin.mo); this standalone canister is
/// retained for isolated testing and hypothetical standalone deployments.
shared ({ caller = installer }) persistent actor class TreasuryCanister(initArgs : Types.InitArgs) = this {
  transient let canisterId = Principal.fromActor(this);

  // Admin lives in this actor, NOT in the treasury store. Single-installer model;
  // for multi-admin / rotation use the backend mixin which plugs in AdminManager.
  let admin : Principal = installer;

  var versionedStore = Treasury.initStableStore(initArgs);
  versionedStore := Treasury.upgradeStableStore(versionedStore, { chains = null });
  transient let treasury = Treasury.fromVersion(versionedStore, canisterId);

  // ---- Admin methods ----

  public shared ({ caller }) func distributePayment(args : Types.DistributePaymentArgs) : async Types.DistributePaymentResult {
    assertAdmin(caller);
    await* Treasury.distributePayment(treasury, args);
  };

  public query ({ caller }) func getDistributionLog(opts : Types.DistributionLogOptions) : async [Types.DistributionRecord] {
    assertAdmin(caller);
    Treasury.getDistributionLog(treasury, opts);
  };

  public query ({ caller }) func getUserDistributions(user : Principal) : async [Types.DistributionRecord] {
    assertAdmin(caller);
    Treasury.getUserDistributions(treasury, user);
  };

  public shared ({ caller }) func getTreasuryBalances() : async [Types.BalanceEntry] {
    assertAdmin(caller);
    await* Treasury.getTreasuryBalances(treasury);
  };

  public shared ({ caller }) func withdrawFromTreasury(args : Types.WithdrawArgs) : async Types.WithdrawResult {
    assertAdmin(caller);
    await* Treasury.withdrawFromTreasury(treasury, args);
  };

  public shared ({ caller }) func chargeAndDistribute(args : Types.ChargeAndDistributeArgs) : async Types.ChargeAndDistributeResult {
    assertAdmin(caller);
    await* Treasury.chargeAndDistribute(treasury, args);
  };

  public shared ({ caller }) func getUserBalances(userId : Principal) : async [Types.BalanceEntry] {
    assertAdmin(caller);
    await* Treasury.getUserBalances(treasury, userId);
  };

  public shared ({ caller }) func verifyDistribution(paymentId : Text) : async Types.VerifyDistributionResult {
    assertAdmin(caller);
    await* Treasury.verifyDistribution(treasury, paymentId);
  };

  // ---- User methods ----

  public shared ({ caller }) func withdraw(args : Types.WithdrawArgs) : async Types.WithdrawResult {
    await* Treasury.withdraw(treasury, caller, args);
  };

  public shared ({ caller }) func getBalance(tokenId : Types.TokenId) : async Nat {
    await* Treasury.getBalance(treasury, caller, tokenId);
  };

  public shared ({ caller }) func getBalances() : async [Types.BalanceEntry] {
    await* Treasury.getBalances(treasury, caller);
  };

  public shared ({ caller }) func getEvmAddress() : async ?Text {
    await* Treasury.getOrDeriveEvmAddress(treasury, caller);
  };

  public shared func getTreasurySigningAddress() : async ?Text {
    await* Treasury.getTreasurySigningAddress(treasury);
  };

  public shared ({ caller }) func getSolAddress() : async ?Text {
    await* Treasury.getOrDeriveSolAddress(treasury, caller);
  };

  public shared func getTreasurySolSigningAddress() : async ?Text {
    await* Treasury.getTreasurySolSigningAddress(treasury);
  };

  // ---- Helpers ----

  func assertAdmin(caller : Principal) {
    if (not Principal.equal(caller, admin)) {
      Runtime.trap("Unauthorized: caller is not admin");
    };
  };
};
