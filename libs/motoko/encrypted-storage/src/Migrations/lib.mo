import V1Types "V1/Types";

module Migrations {
  public type VersionedStableStore = {
    #v1 : V1Types.StableStore;
  };

  public type UpgradeOptions = {
    backendId : ?Principal;
  };

  type CurrentStableStore = V1Types.StableStore;

  public func upgrade(versions : VersionedStableStore, options : UpgradeOptions) : VersionedStableStore {
    switch (versions) {
      case (#v1(store)) {
        switch (options.backendId) {
          case (?id) store.backendId := ?id;
          case null {};
        };
        #v1(store);
      };
    };
  };

  public func getCurrentState(versions : VersionedStableStore) : CurrentStableStore {
    switch (versions) {
      case (#v1(store)) store;
    };
  };
};
