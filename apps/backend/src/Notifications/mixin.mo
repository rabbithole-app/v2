import Principal "mo:core/Principal";
import Time "mo:core/Time";

import Notifications "lib";

mixin() {
  let notifStore = Notifications.new();

  /// Send a notification to a user. Available to other mixins in the actor.
  func notifyUser(recipient : Principal, event : Notifications.TypedEvent) {
    Notifications.notify(notifStore, recipient, event);
  };

  public query ({ caller }) func getNotifications(since : ?Time.Time, limit : Nat) : async Notifications.NotificationsPage {
    assert not Principal.isAnonymous(caller);
    Notifications.getNotifications(notifStore, caller, since, limit);
  };

  public query ({ caller }) func getUnreadCount() : async Nat {
    assert not Principal.isAnonymous(caller);
    Notifications.getUnreadCount(notifStore, caller);
  };

  public shared ({ caller }) func markNotificationsAsRead(ids : [Nat]) : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markAsRead(notifStore, caller, ids);
  };

  public shared ({ caller }) func markAllNotificationsAsRead() : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markAllAsRead(notifStore, caller);
  };
};
