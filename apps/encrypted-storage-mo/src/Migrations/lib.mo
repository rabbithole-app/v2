import Runtime "mo:core/Runtime";

import V1Types "V1/Types";
import V2Types "V2/Types";

module Migrations {
  public type VersionedStableStore = {
    #v1 : V1Types.StableStore;
    #v2 : V2Types.StableStore;
  };

  public type UpgradeOptions = {
    backendId : ?Principal;
  };

  type CurrentStableStore = V2Types.StableStore;

  func migrateV1toV2(v1 : V1Types.StableStore) : V2Types.StableStore {
    {
      // Carry over all V1 fields
      canisterId = v1.canisterId;
      region = v1.region;
      fs = v1.fs;
      upload = v1.upload;
      staging = v1.staging;
      certs = v1.certs;
      vetKdKeyId = v1.vetKdKeyId;
      domainSeparatorBytes = v1.domainSeparatorBytes;
      var streamingCallback = v1.streamingCallback;

      // New V2 fields with defaults
      var backendId = null;
      var subscriptionCache = null;
      var encryptedBytesUsed = 0;
      var unreportedTrialBytes = 0;
      var cachedModuleHash = null;
      var lastCycleAlertAt = 0;
      var lastCycleAlertLevel = null;
      var cachedIdleBurnPerDay = null;
    };
  };

  public func upgrade(versions : VersionedStableStore, options : UpgradeOptions) : VersionedStableStore {
    let migrated = switch (versions) {
      case (#v2(store)) #v2(store);
      case (#v1(store)) #v2(migrateV1toV2(store));
    };

    // Apply upgrade options to current store
    switch (migrated) {
      case (#v2(store)) {
        switch (options.backendId) {
          case (?id) store.backendId := ?id;
          case null {};
        };
      };
      case _ {};
    };

    migrated;
  };

  public func getCurrentState(versions : VersionedStableStore) : CurrentStableStore {
    switch (versions) {
      case (#v2(store)) store;
      case (#v1(_)) Runtime.trap("Unexpected v1 state after upgrade");
    };
  };
};
