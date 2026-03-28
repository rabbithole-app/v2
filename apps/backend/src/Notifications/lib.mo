import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Time "mo:core/Time";

import Vector "mo:vector";

module {
  public type TypedEvent = {
    #subscriptionActivated : { plan : { #Free; #Trial; #License; #Pro } };
    #subscriptionExpired;
    #trialStarted : { limitBytes : Nat };
    #lowCycles : {
      canisterId : Principal;
      remaining : Nat;
      estimatedDaysLeft : Nat;
      severity : { #warning; #critical };
    };
    #updateAvailable : { canisterId : Principal; releaseTag : Text };
  };

  public type StoredNotification = {
    id : Nat;
    event : TypedEvent;
    read : Bool;
    createdAt : Time.Time;
  };

  let MAX_INBOX_SIZE : Nat = 500;

  public type Inbox = {
    items : Vector.Vector<StoredNotification>;
    var unreadCount : Nat;
  };

  public type Store = {
    inboxes : Map.Map<Principal, Inbox>;
    var nextId : Nat;
  };

  public type NotificationsPage = {
    data : [StoredNotification];
    unreadCount : Nat;
  };

  public func new() : Store {
    {
      inboxes = Map.empty<Principal, Inbox>();
      var nextId = 0;
    };
  };

  func getOrCreateInbox(store : Store, principal : Principal) : Inbox {
    switch (Map.get(store.inboxes, Principal.compare, principal)) {
      case (?inbox) inbox;
      case null {
        let inbox : Inbox = {
          items = Vector.new<StoredNotification>();
          var unreadCount = 0;
        };
        Map.add(store.inboxes, Principal.compare, principal, inbox);
        inbox;
      };
    };
  };

  /// Find notification index by id (linear scan — inbox capped at MAX_INBOX_SIZE)
  func idToIndex(inbox : Inbox, id : Nat) : ?Nat {
    var i : Nat = 0;
    let size = Vector.size(inbox.items);
    while (i < size) {
      if (Vector.get(inbox.items, i).id == id) return ?i;
      i += 1;
    };
    null;
  };

  public func notify(store : Store, recipient : Principal, event : TypedEvent) {
    let inbox = getOrCreateInbox(store, recipient);

    Vector.add(inbox.items, {
      id = store.nextId;
      event;
      read = false;
      createdAt = Time.now();
    });
    store.nextId += 1;
    inbox.unreadCount += 1;

    // Trim: remove oldest read, or oldest overall as hard cap
    if (Vector.size(inbox.items) > MAX_INBOX_SIZE) {
      // Find oldest read
      var dropIdx : ?Nat = null;
      var i : Nat = 0;
      while (i < Vector.size(inbox.items)) {
        let n = Vector.get(inbox.items, i);
        if (n.read) { dropIdx := ?i; i := Vector.size(inbox.items) } // found, stop
        else { i += 1 };
      };
      // Hard cap: drop index 0 if no read found
      let idx = switch dropIdx { case (?v) v; case null 0 };
      let dropped = Vector.get(inbox.items, idx);
      if (not dropped.read) { inbox.unreadCount -= 1 };
      // Shift remaining by rebuilding (Vector has no removeAt)
      let newItems = Vector.new<StoredNotification>();
      var j : Nat = 0;
      while (j < Vector.size(inbox.items)) {
        if (j != idx) Vector.add(newItems, Vector.get(inbox.items, j));
        j += 1;
      };
      // Swap contents: clear old, copy new
      while (Vector.size(inbox.items) > 0) { ignore Vector.removeLast(inbox.items) };
      for (item in Vector.vals(newItems)) { Vector.add(inbox.items, item) };
    };
  };

  public func getNotifications(store : Store, caller : Principal, since : ?Time.Time, limit : Nat) : NotificationsPage {
    let ?inbox = Map.get(store.inboxes, Principal.compare, caller) else return { data = []; unreadCount = 0 };

    let size = Vector.size(inbox.items);
    let results = Vector.new<StoredNotification>();
    var collected : Nat = 0;

    // Iterate newest-first (end of vector = most recent)
    var i = size;
    while (i > 0 and collected < limit) {
      i -= 1;
      let notif = Vector.get(inbox.items, i);
      switch since {
        case (?s) {
          if (notif.createdAt <= s) { i := 0 } // older — stop
          else { Vector.add(results, notif); collected += 1 };
        };
        case null { Vector.add(results, notif); collected += 1 };
      };
    };

    { data = Vector.toArray(results); unreadCount = inbox.unreadCount };
  };

  public func getUnreadCount(store : Store, caller : Principal) : Nat {
    let ?inbox = Map.get(store.inboxes, Principal.compare, caller) else return 0;
    inbox.unreadCount;
  };

  public func markAsRead(store : Store, caller : Principal, ids : [Nat]) {
    let ?inbox = Map.get(store.inboxes, Principal.compare, caller) else return;

    for (id in ids.vals()) {
      switch (idToIndex(inbox, id)) {
        case (?idx) {
          let notif = Vector.get(inbox.items, idx);
          if (not notif.read) {
            Vector.put(inbox.items, idx, { notif with read = true });
            inbox.unreadCount -= 1;
          };
        };
        case null {};
      };
    };
  };

  public func markAllAsRead(store : Store, caller : Principal) {
    let ?inbox = Map.get(store.inboxes, Principal.compare, caller) else return;
    if (inbox.unreadCount == 0) return;

    var i : Nat = 0;
    let size = Vector.size(inbox.items);
    while (i < size) {
      let notif = Vector.get(inbox.items, i);
      if (not notif.read) {
        Vector.put(inbox.items, i, { notif with read = true });
      };
      i += 1;
    };
    inbox.unreadCount := 0;
  };
};
