import V1Types "V1/Types";
import Types "../Types";

module Migrations {
  public type VersionedStableStore = {
    #v1 : V1Types.StableStore;
  };

  public type UpgradeOptions = {
    chains : ?[Types.ChainConfig];
  };

  type CurrentStableStore = V1Types.StableStore;

  public func upgrade(versions : VersionedStableStore, options : UpgradeOptions) : VersionedStableStore {
    switch (versions) {
      case (#v1(store)) #v1(applyV1Options(store, options));
    };
  };

  func applyV1Options(store : V1Types.StableStore, options : UpgradeOptions) : V1Types.StableStore {
    switch (options.chains) {
      case null store;
      case (?chains) {
        {
          processedPayments = store.processedPayments;
          distributions = store.distributions;
          var nextDistributionId = store.nextDistributionId;
          thresholdKeyName = store.thresholdKeyName;
          chains;
          distributionConfig = store.distributionConfig;
          walletCache = store.walletCache;
        };
      };
    };
  };

  public func getCurrentState(versions : VersionedStableStore) : CurrentStableStore {
    switch (versions) {
      case (#v1(store)) store;
    };
  };
};
