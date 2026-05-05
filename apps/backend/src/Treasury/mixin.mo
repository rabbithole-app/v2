import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Treasury "mo:treasury";
import TreasuryConst "mo:treasury/Const";
import TreasuryTypes "mo:treasury/Types";
import Account "mo:treasury/common/Account";
import Types "../Types/lib";

mixin(
  config : {
    canisterId : Principal;
    thresholdKeyName : Types.ThresholdKeyName;
    chains : [Types.ChainConfig];
  },
  admin : { assertAdmin : (Principal) -> () },
) {
  // Treasury stable store — persistent across upgrades.
  // Treasury funds now live at a fixed subaccount (Const.TREASURY_SUBACCOUNT
  // in the treasury library) instead of being keyed by an admin principal.
  var treasuryStableStore = Treasury.initStableStore({
    thresholdKeyName = config.thresholdKeyName;
    chains = config.chains;
    distributionConfig = null; // uses defaults (85/15/0)
  });
  treasuryStableStore := Treasury.upgradeStableStore(treasuryStableStore);

  // Transient treasury instance — reconstructed on upgrade
  transient let treasury = Treasury.fromVersion(treasuryStableStore, config.canisterId);

  // ---- Internal functions for sibling mixins ----

  func treasuryDistributePayment(args : TreasuryTypes.DistributePaymentArgs) : async* TreasuryTypes.DistributePaymentResult {
    await* Treasury.distributePayment(treasury, args);
  };

  func treasuryChargeAndDistribute(args : TreasuryTypes.ChargeAndDistributeArgs) : async* TreasuryTypes.ChargeAndDistributeResult {
    await* Treasury.chargeAndDistribute(treasury, args);
  };

  func treasuryGetUserBalances(userId : Principal) : async* [TreasuryTypes.BalanceEntry] {
    await* Treasury.getUserBalances(treasury, userId);
  };

  func treasuryGetBalance(userId : Principal, tokenId : TreasuryTypes.TokenId) : async* Nat {
    await* Treasury.getBalance(treasury, userId, tokenId);
  };

  func treasurySimpleTransfer(userId : Principal, tokenId : TreasuryTypes.TokenId, amount : Nat) : async* Result.Result<Nat, Text> {
    await* Treasury.simpleTransfer(treasury, userId, tokenId, amount);
  };

  func treasurySimpleRefund(userId : Principal, tokenId : TreasuryTypes.TokenId, amount : Nat) : async* Result.Result<(), Text> {
    await* Treasury.simpleRefund(treasury, userId, tokenId, amount);
  };

  /// Treasury ICP balance — used by Balance mixin to guard the minimum
  /// reserve before CMC top-up transfers (unified pool: treasury funds
  /// both user top-ups and backend self-topup).
  func treasuryGetIcpBalance() : async* Nat {
    await* Treasury.getTreasuryIcpBalance(treasury);
  };

  func treasuryDistributeAmbassadorShare(
    args : TreasuryTypes.DistributeAmbassadorShareArgs,
  ) : async* TreasuryTypes.DistributeAmbassadorShareResult {
    await* Treasury.distributeAmbassadorShare(treasury, args);
  };

  // ---- Public API ----

  public query ({ caller }) func getMyWalletAddresses() : async {
    icSubaccount : Blob;
    evmAddress : ?Text;
    solAddress : ?Text;
  } {
    assert not Principal.isAnonymous(caller);
    let subaccount = Account.principalToSubaccount(caller);
    let walletCache = treasury.store.walletCache;
    let cached = switch (Map.get(walletCache, Principal.compare, caller)) {
      case (?w) w;
      case null {
        { icSubaccount = subaccount; evmAddress = null; solAddress = null };
      };
    };
    {
      icSubaccount = subaccount;
      evmAddress = cached.evmAddress;
      solAddress = cached.solAddress;
    };
  };

  public shared ({ caller }) func withdraw(args : TreasuryTypes.WithdrawArgs) : async TreasuryTypes.WithdrawResult {
    assert not Principal.isAnonymous(caller);
    await* Treasury.withdraw(treasury, caller, args);
  };

  public shared ({ caller }) func getEvmAddress() : async ?Text {
    assert not Principal.isAnonymous(caller);
    await* Treasury.getOrDeriveEvmAddress(treasury, caller);
  };

  public shared ({ caller }) func getSolAddress() : async ?Text {
    assert not Principal.isAnonymous(caller);
    await* Treasury.getOrDeriveSolAddress(treasury, caller);
  };

  // ---- Admin API ----

  public shared ({ caller }) func getTreasuryBalances() : async [TreasuryTypes.BalanceEntry] {
    admin.assertAdmin(caller);
    await* Treasury.getTreasuryBalances(treasury);
  };

  public shared ({ caller }) func getTreasuryWalletAddresses() : async {
    icSubaccount : Blob;
    evmAddress : ?Text;
    solAddress : ?Text;
  } {
    admin.assertAdmin(caller);
    let evmAddress = await* Treasury.getTreasurySigningAddress(treasury);
    let solAddress = await* Treasury.getTreasurySolSigningAddress(treasury);
    {
      icSubaccount = TreasuryConst.treasurySubaccount();
      evmAddress;
      solAddress;
    };
  };

  /// Withdraw from the app treasury pool. Supports IC tokens only for now;
  /// EVM/SOL treasury withdrawals require the dedicated threshold-sign flow.
  public shared ({ caller }) func withdrawFromTreasury(args : TreasuryTypes.WithdrawArgs) : async TreasuryTypes.WithdrawResult {
    admin.assertAdmin(caller);
    await* Treasury.withdrawFromTreasury(treasury, args);
  };

  public query ({ caller }) func getDistributionLog(opts : TreasuryTypes.DistributionLogOptions) : async [TreasuryTypes.DistributionRecord] {
    admin.assertAdmin(caller);
    Treasury.getDistributionLog(treasury, opts);
  };
};
