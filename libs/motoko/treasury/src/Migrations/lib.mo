import V1Types "V1/Types";

module Migrations {
  public type VersionedStableStore = {
    #v1 : V1Types.StableStore;
  };

  type CurrentStableStore = V1Types.StableStore;

  public func upgrade(versions : VersionedStableStore) : VersionedStableStore {
    switch (versions) {
      case (#v1(store)) #v1(store);
    };
  };

  public func getCurrentState(versions : VersionedStableStore) : CurrentStableStore {
    switch (versions) {
      case (#v1(store)) store;
    };
  };
};
