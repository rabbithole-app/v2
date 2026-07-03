import Principal "mo:core/Principal";

import V1Types "V1/Types";
import V2Types "V2/Types";
import ExternalStorage "../ExternalStorage/lib";

module Migrations {
  public type VersionedStableStore = {
    #v1 : V1Types.StableStore;
    #v2 : V2Types.StableStore;
  };

  public type UpgradeOptions = {
    accountOwner : Principal;
    backendId : ?Principal;
  };

  public type CurrentStableStore = V2Types.StableStore;

  func applyOptions(store : V2Types.StableStore, options : UpgradeOptions) {
    switch (options.backendId) {
      case (?id) store.backendId := ?id;
      case null {};
    };
  };

  func fromV1(store : V1Types.StableStore) : V2Types.StableStore {
    {
      canisterId = store.canisterId;
      region = store.region;
      fs = store.fs;
      upload = store.upload;
      staging = store.staging;
      certs = store.certs;
      vetKdKeyId = store.vetKdKeyId;
      domainSeparatorBytes = store.domainSeparatorBytes;
      var streamingCallback = store.streamingCallback;

      var backendId = store.backendId;
      var subscriptionCache = store.subscriptionCache;
      var storedBytesUsed = store.storedBytesUsed;
      var cachedModuleHash = store.cachedModuleHash;
      var lastCycleAlertAt = store.lastCycleAlertAt;
      var lastCycleAlertLevel = store.lastCycleAlertLevel;
      var cachedIdleBurnPerDay = store.cachedIdleBurnPerDay;

      storageBackendType = store.storageBackendType;
      var objectStorageWritePolicy = #CaffeineManaged;

      access = store.access;
      storageEvents = store.storageEvents;
      storageEventReadState = store.storageEventReadState;

      externalStorage = ExternalStorage.new();
    };
  };

  public func upgrade(versions : VersionedStableStore, options : UpgradeOptions) : VersionedStableStore {
    switch (versions) {
      case (#v1(store)) {
        let upgraded = fromV1(store);
        applyOptions(upgraded, options);
        #v2(upgraded);
      };
      case (#v2(store)) {
        applyOptions(store, options);
        #v2(store);
      };
    };
  };

  public func getCurrentState(versions : VersionedStableStore) : CurrentStableStore {
    switch (versions) {
      case (#v1(store)) fromV1(store);
      case (#v2(store)) store;
    };
  };
};
