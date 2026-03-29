import Time "mo:core/Time";

import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import MemoryRegion "mo:memory-region/MemoryRegion";
import CertifiedAssets "mo:certified-assets/Stable";

import V1 "../V1/Types";

module {
  /* ---------------------- Subscription & Cycle Types ---------------------- */

  public type Plan = {
    #Free;
    #Trial;
    #License;
    #Pro;
  };

  public type SubscriptionStatus = {
    #active : { plan : Plan };
    #trial : { remainingBytes : Nat };
    #expired;
    #free;
    #invalidWasm;
    #unknownCanister;
  };

  public type SubscriptionCache = {
    status : SubscriptionStatus;
    checkedAt : Time.Time;
  };

  public type CycleAlertLevel = {
    #warning;
    #critical;
  };

  /* ------------------------------- StableStore ------------------------------ */

  public type StableStore = {
    /* === All V1 fields (unchanged) === */
    canisterId : Principal;
    region : MemoryRegion.MemoryRegion;
    fs : V1.FileSystemStore;
    upload : V1.UploadStore;
    staging : Map.Map<V1.NodeKey, V1.StagingEntry>;
    certs : CertifiedAssets.StableStore;
    vetKdKeyId : ManagementCanister.VetKdKeyid;
    domainSeparatorBytes : Blob;
    var streamingCallback : ?V1.StreamingCallback;

    /* === New V2 fields === */
    var backendId : ?Principal;
    var subscriptionCache : ?SubscriptionCache;
    var encryptedBytesUsed : Nat;
    var unreportedTrialBytes : Nat;
    var cachedModuleHash : ?Blob;
    var lastCycleAlertAt : Time.Time;
    var lastCycleAlertLevel : ?CycleAlertLevel;
    var cachedIdleBurnPerDay : ?Nat;
  };
};
