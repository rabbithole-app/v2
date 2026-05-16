import Principal "mo:core/Principal";

import BackendEvents "../BackendEvents/lib";
import Notifications "lib";
import NotificationRouter "Router";

mixin (deps : { listAdmins : () -> [Principal] }) {
  let notifStore = Notifications.new();

  func consumeBackendEvent(backendEvent : BackendEvents.BackendEvent) {
    for (delivery in NotificationRouter.route(backendEvent, deps).vals()) {
      Notifications.enqueue(notifStore, delivery);
    };
  };

  public query ({ caller }) func listNotifications(args : Notifications.ListNotificationsArgs) : async Notifications.NotificationsPage {
    assert not Principal.isAnonymous(caller);
    Notifications.listNotifications(notifStore, caller, args);
  };

  public query ({ caller }) func getUnreadNotificationCount() : async Nat {
    assert not Principal.isAnonymous(caller);
    Notifications.getUnreadNotificationCount(notifStore, caller);
  };

  public shared ({ caller }) func markNotificationsRead(ids : [Nat]) : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markAsRead(notifStore, caller, ids);
  };

  public shared ({ caller }) func markNotificationsReadUpTo(upToId : Nat) : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markReadUpTo(notifStore, caller, upToId);
  };

  public shared ({ caller }) func markAllNotificationsRead() : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markAllAsRead(notifStore, caller);
  };
};
