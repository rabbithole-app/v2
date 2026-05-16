import Time "mo:core/Time";
import Principal "mo:core/Principal";

import Map "mo:map/Map";
import Vector "mo:vector";

import Types "Types";

module StorageEvents {
  let { nhash; phash } = Map;

  public type Store = Types.Store;
  public type ReadState = Types.ReadState;
  public type StorageEvent = Types.StorageEvent;
  public type StoredStorageEvent = Types.StoredStorageEvent;

  public func new() : Store = {
    var nextEventId = 0;
    events = Map.new<Nat, StoredStorageEvent>();
  };

  public func newReadState() : ReadState = {
    readCursors = Map.new<Principal, Nat>();
  };

  public func emit(store : Store, correlationId : ?Text, visibleTo : [Principal], event : StorageEvent) : StoredStorageEvent {
    let stored : StoredStorageEvent = {
      id = store.nextEventId;
      timestamp = Time.now();
      correlationId;
      visibleTo;
      event;
    };
    store.nextEventId += 1;
    ignore Map.put(store.events, nhash, stored.id, stored);
    stored;
  };

  public func list(store : Store, afterId : ?Nat, limit : Nat) : [StoredStorageEvent] {
    let maxItems = if (limit == 0 or limit > 100) 100 else limit;
    let result = Vector.new<StoredStorageEvent>();
    var eventId = switch (afterId) {
      case (?id) id + 1;
      case null 0;
    };

    while (eventId < store.nextEventId and Vector.size(result) < maxItems) {
      switch (Map.get(store.events, nhash, eventId)) {
        case (?event) Vector.add(result, event);
        case null {};
      };
      eventId += 1;
    };

    Vector.toArray(result);
  };

  public func listVisible(store : Store, caller : Principal, canSeeAll : Bool, afterId : ?Nat, limit : Nat) : [StoredStorageEvent] {
    let maxItems = if (limit == 0 or limit > 100) 100 else limit;
    let result = Vector.new<StoredStorageEvent>();
    var eventId = switch (afterId) {
      case (?id) id + 1;
      case null 0;
    };

    while (eventId < store.nextEventId and Vector.size(result) < maxItems) {
      switch (Map.get(store.events, nhash, eventId)) {
        case (?event) {
          if (canSeeAll or canPrincipalSeeEvent(caller, event.visibleTo)) {
            Vector.add(result, event);
          };
        };
        case null {};
      };
      eventId += 1;
    };

    Vector.toArray(result);
  };

  public func listLatestVisible(store : Store, caller : Principal, canSeeAll : Bool, limit : Nat) : [StoredStorageEvent] {
    let maxItems = if (limit == 0 or limit > 100) 100 else limit;
    let result = Vector.new<StoredStorageEvent>();
    var eventId = store.nextEventId;

    while (eventId > 0 and Vector.size(result) < maxItems) {
      eventId -= 1;
      switch (Map.get(store.events, nhash, eventId)) {
        case (?event) {
          if (canSeeAll or canPrincipalSeeEvent(caller, event.visibleTo)) {
            Vector.add(result, event);
          };
        };
        case null {};
      };
    };

    Vector.toArray(result);
  };

  public func getUnreadCount(store : Store, readState : ReadState, caller : Principal, canSeeAll : Bool) : Nat {
    let lastRead = Map.get(readState.readCursors, phash, caller);
    var count : Nat = 0;
    var eventId : Nat = switch (lastRead) {
      case (?id) id + 1;
      case null 0;
    };

    while (eventId < store.nextEventId) {
      switch (Map.get(store.events, nhash, eventId)) {
        case (?event) {
          if (canSeeAll or canPrincipalSeeEvent(caller, event.visibleTo)) {
            count += 1;
          };
        };
        case null {};
      };
      eventId += 1;
    };
    count;
  };

  public func markRead(readState : ReadState, store : Store, caller : Principal, upToEventId : Nat) {
    if (store.nextEventId == 0) return;
    let latestEventId = store.nextEventId - 1;
    let boundedEventId = if (upToEventId > latestEventId) latestEventId else upToEventId;

    switch (Map.get(readState.readCursors, phash, caller)) {
      case (?current) {
        if (boundedEventId > current) {
          ignore Map.put(readState.readCursors, phash, caller, boundedEventId);
        };
      };
      case null {
        ignore Map.put(readState.readCursors, phash, caller, boundedEventId);
      };
    };
  };

  public func markAllVisibleRead(readState : ReadState, store : Store, caller : Principal, canSeeAll : Bool) {
    switch (latestVisibleEventId(store, caller, canSeeAll)) {
      case (?eventId) markRead(readState, store, caller, eventId);
      case null {};
    };
  };

  func latestVisibleEventId(store : Store, caller : Principal, canSeeAll : Bool) : ?Nat {
    var eventId = store.nextEventId;
    while (eventId > 0) {
      eventId -= 1;
      switch (Map.get(store.events, nhash, eventId)) {
        case (?event) {
          if (canSeeAll or canPrincipalSeeEvent(caller, event.visibleTo)) {
            return ?eventId;
          };
        };
        case null {};
      };
    };
    null;
  };

  func canPrincipalSeeEvent(caller : Principal, visibleTo : [Principal]) : Bool {
    for (principal in visibleTo.vals()) {
      if (Principal.equal(caller, principal)) return true;
    };
    false;
  };
};
