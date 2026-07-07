import Principal "mo:core/Principal";

import BackendEvents "../BackendEvents/lib";
import Notifications "lib";
import NotificationRouter "Router";

// `notifStore` is declared in main.mo and passed in via deps: migration
// expressions can only target stable fields declared directly on the actor,
// not fields introduced by a mixin.
mixin (deps : { listAdmins : () -> [Principal]; notifStore : Notifications.Store }) {
  func consumeBackendEvent(backendEvent : BackendEvents.BackendEvent) {
    for (delivery in NotificationRouter.route(backendEvent, deps).vals()) {
      Notifications.enqueue(deps.notifStore, delivery);
    };
  };

  public query ({ caller }) func listNotifications(args : Notifications.ListNotificationsArgs) : async Notifications.NotificationsPage {
    assert not Principal.isAnonymous(caller);
    Notifications.listNotifications(deps.notifStore, caller, args);
  };

  public query ({ caller }) func getUnreadNotificationCount() : async Nat {
    assert not Principal.isAnonymous(caller);
    Notifications.getUnreadNotificationCount(deps.notifStore, caller);
  };

  public shared ({ caller }) func markNotificationsRead(ids : [Nat]) : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markAsRead(deps.notifStore, caller, ids);
  };

  public shared ({ caller }) func markNotificationsReadUpTo(upToId : Nat) : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markReadUpTo(deps.notifStore, caller, upToId);
  };

  public shared ({ caller }) func markAllNotificationsRead() : async () {
    assert not Principal.isAnonymous(caller);
    Notifications.markAllAsRead(deps.notifStore, caller);
  };
};
