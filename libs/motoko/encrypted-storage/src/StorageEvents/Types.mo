import Time "mo:core/Time";
import Principal "mo:core/Principal";

import Map "mo:map/Map";

import AccessTypes "../Access/Types";

module {
  public type StorageEvent = {
    #access : AccessTypes.StorageAccessEvent;
  };

  public type StoredStorageEvent = {
    id : Nat;
    timestamp : Time.Time;
    correlationId : ?Text;
    visibleTo : [Principal];
    event : StorageEvent;
  };

  public type Store = {
    var nextEventId : Nat;
    events : Map.Map<Nat, StoredStorageEvent>;
  };

  public type ReadState = {
    readCursors : Map.Map<Principal, Nat>;
  };
};
