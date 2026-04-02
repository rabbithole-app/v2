import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Treasury "mo:treasury";
import TreasuryTypes "mo:treasury/Types";
import Account "mo:treasury/common/Account";
import V1Types "mo:treasury/Migrations/V1/Types";

import Types "../Types/lib";

mixin(
  config : {
    canisterId : Principal;
    admin : Principal;
    evmConfig : ?Types.EvmConfig;
    solConfig : ?Types.SolConfig;
  },
  assertAdmin : (Principal) -> (),
) {
  // Convert backend config types to treasury config types
  let treasuryEvmConfig : ?TreasuryTypes.EvmConfig = switch (config.evmConfig) {
    case (?cfg) ?{
      chainId = cfg.chainId;
      ecdsaKeyName = cfg.ecdsaKeyName;
      evmRpcCanisterId = cfg.evmRpcCanisterId;
      usdcContract = cfg.usdcContract;
      usdtContract = cfg.usdtContract;
      rpcUrls = cfg.rpcUrls;
    };
    case null null;
  };

  let treasurySolConfig : ?TreasuryTypes.SolConfig = switch (config.solConfig) {
    case (?cfg) ?{
      schnorrKeyName = cfg.schnorrKeyName;
      solRpcCanisterId = cfg.solRpcCanisterId;
      usdcMint = cfg.usdcMint;
      usdtMint = cfg.usdtMint;
      rpcUrl = cfg.rpcUrl;
    };
    case null null;
  };

  // Treasury stable store — persistent across upgrades
  var treasuryStableStore = Treasury.initStableStore({
    admin = config.admin;
    evmConfig = treasuryEvmConfig;
    solConfig = treasurySolConfig;
    distributionConfig = null; // uses defaults (80/15/5)
  });
  treasuryStableStore := Treasury.upgradeStableStore(treasuryStableStore);

  // Transient treasury instance — reconstructed on upgrade
  transient let treasury = Treasury.fromVersion(treasuryStableStore, config.canisterId);

  // ---- Internal functions for sibling mixins ----

  func treasuryDistributePayment(args : TreasuryTypes.DistributePaymentArgs) : async* TreasuryTypes.DistributePaymentResult {
    await* Treasury.distributePayment(treasury, config.admin, args);
  };

  func treasuryChargeAndDistribute(args : TreasuryTypes.ChargeAndDistributeArgs) : async* TreasuryTypes.ChargeAndDistributeResult {
    await* Treasury.chargeAndDistribute(treasury, config.admin, args);
  };

  func treasuryGetUserBalances(userId : Principal) : async* [TreasuryTypes.BalanceEntry] {
    await* Treasury.getUserBalances(treasury, config.admin, userId);
  };

  func treasuryGetBalance(userId : Principal, tokenId : TreasuryTypes.TokenId) : async* Nat {
    await* Treasury.getBalance(treasury, userId, tokenId);
  };

  func treasurySimpleTransfer(userId : Principal, tokenId : TreasuryTypes.TokenId, amount : Nat) : async* Result.Result<Nat, Text> {
    await* Treasury.simpleTransfer(treasury, config.admin, userId, tokenId, amount);
  };

  func treasurySimpleRefund(userId : Principal, tokenId : TreasuryTypes.TokenId, amount : Nat) : async* Result.Result<(), Text> {
    await* Treasury.simpleRefund(treasury, config.admin, userId, tokenId, amount);
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

  // Admin queries
  public shared ({ caller }) func getTreasuryBalances() : async [TreasuryTypes.BalanceEntry] {
    assertAdmin(caller);
    await* Treasury.getTreasuryBalances(treasury);
  };

  public query ({ caller }) func getDistributionLog(opts : TreasuryTypes.DistributionLogOptions) : async [TreasuryTypes.DistributionRecord] {
    assertAdmin(caller);
    Treasury.getDistributionLog(treasury, opts);
  };
};
