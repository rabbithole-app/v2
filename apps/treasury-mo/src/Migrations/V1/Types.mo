import Map "mo:core/Map";
import Set "mo:core/Set";
import Vector "mo:vector";

import Types "../../Types";

module {
  public type StableStore = {
    processedPayments : Set.Set<Text>;
    distributions : Vector.Vector<Types.DistributionRecord>;
    var nextDistributionId : Nat;
    admin : Principal;
    evmConfig : ?Types.EvmConfig;
    solConfig : ?Types.SolConfig;
    distributionConfig : Types.DistributionConfig;
    walletCache : Map.Map<Principal, WalletAddresses>;
  };

  public type WalletAddresses = {
    icSubaccount : Blob;
    evmAddress : ?Text;
    solAddress : ?Text;
  };
};
