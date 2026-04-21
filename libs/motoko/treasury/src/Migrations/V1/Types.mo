import Map "mo:core/Map";
import Set "mo:core/Set";
import Vector "mo:vector";

import Types "../../Types";

module {
  /// V1: treasury funds live at a fixed `TREASURY_SUBACCOUNT` (see Const.mo).
  /// Access control is enforced by the parent canister — treasury library does
  /// not track an admin principal internally.
  public type StableStore = {
    processedPayments : Set.Set<Text>;
    distributions : Vector.Vector<Types.DistributionRecord>;
    var nextDistributionId : Nat;
    thresholdKeyName : Types.ThresholdKeyName;
    chains : [Types.ChainConfig];
    distributionConfig : Types.DistributionConfig;
    walletCache : Map.Map<Principal, WalletAddresses>;
  };

  public type WalletAddresses = {
    icSubaccount : Blob;
    evmAddress : ?Text;
    solAddress : ?Text;
  };
};
