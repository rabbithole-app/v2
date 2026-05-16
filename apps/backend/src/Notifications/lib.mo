import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Time "mo:core/Time";

import Vector "mo:vector";

import Types "Types";

module {
  public type NotificationPayload = Types.NotificationPayload;
  public type NotificationSeverity = Types.NotificationSeverity;
  public type NotificationSource = Types.NotificationSource;
  public type SourceEventRef = Types.SourceEventRef;
  public type StoredNotification = Types.StoredNotification;
  public type Inbox = Types.Inbox;
  public type Store = Types.Store;
  public type NotificationsPage = Types.NotificationsPage;
  public type ListNotificationsArgs = Types.ListNotificationsArgs;

  let MAX_INBOX_SIZE : Nat = 500;
  let READ_NOTIFICATION_RETENTION_NS : Int = 2_592_000_000_000_000; // 30 days

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

  func replaceItems(inbox : Inbox, items : Vector.Vector<StoredNotification>) {
    while (Vector.size(inbox.items) > 0) {
      ignore Vector.removeLast(inbox.items);
    };
    for (item in Vector.vals(items)) {
      Vector.add(inbox.items, item);
    };
  };

  func cleanupReadByAge(inbox : Inbox, now : Time.Time) {
    let retained = Vector.new<StoredNotification>();
    var changed = false;

    for (notif in Vector.vals(inbox.items)) {
      let expiredRead = notif.read and now - notif.createdAt > READ_NOTIFICATION_RETENTION_NS;
      if (expiredRead) {
        changed := true;
      } else {
        Vector.add(retained, notif);
      };
    };

    if (changed) {
      replaceItems(inbox, retained);
    };
  };

  public func enqueue(store : Store, delivery : Types.Delivery) {
    let inbox = getOrCreateInbox(store, delivery.recipient);

    let now = Time.now();
    let id = store.nextId;

    Vector.add(
      inbox.items,
      {
        id;
        payload = delivery.payload;
        read = false;
        createdAt = now;
        correlationId = delivery.correlationId;
        source = delivery.source;
        sourceEvent = delivery.sourceEvent;
        severity = delivery.severity;
      },
    );
    store.nextId += 1;
    inbox.unreadCount += 1;
    cleanupReadByAge(inbox, now);

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
      replaceItems(inbox, newItems);
    };
  };

  public func listNotifications(store : Store, caller : Principal, args : ListNotificationsArgs) : NotificationsPage {
    let ?inbox = Map.get(store.inboxes, Principal.compare, caller) else return {
      data = [];
      unreadCount = 0;
    };

    let maxItems = if (args.limit == 0 or args.limit > 100) 100 else args.limit;
    let results = Vector.new<StoredNotification>();
    var eventIndex = Vector.size(inbox.items);

    while (eventIndex > 0 and Vector.size(results) < maxItems) {
      eventIndex -= 1;
      let notif = Vector.get(inbox.items, eventIndex);
      let isAfter = switch (args.afterId) {
        case (?id) notif.id > id;
        case null true;
      };
      if (isAfter and (not args.unreadOnly or not notif.read)) {
        Vector.add(results, notif);
      };
    };

    { data = Vector.toArray(results); unreadCount = inbox.unreadCount };
  };

  public func markReadUpTo(store : Store, caller : Principal, upToId : Nat) {
    let ?inbox = Map.get(store.inboxes, Principal.compare, caller) else return;

    var i : Nat = 0;
    let size = Vector.size(inbox.items);
    while (i < size) {
      let notif = Vector.get(inbox.items, i);
      if (notif.id <= upToId and not notif.read) {
        Vector.put(inbox.items, i, { notif with read = true });
        inbox.unreadCount -= 1;
      };
      i += 1;
    };
  };

  public func getUnreadNotificationCount(store : Store, caller : Principal) : Nat {
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
