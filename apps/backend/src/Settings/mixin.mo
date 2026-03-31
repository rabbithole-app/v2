import Debug "mo:base/Debug";
import Option "mo:core/Option";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

import Settings "lib";

mixin() {
  let userSettings : Map.Map<Principal, Settings.UserSettings> = Map.empty();

  /// Get settings for a user. Returns defaults if not customized.
  /// Available to sibling mixins.
  func getUserSettings(userId : Principal) : Settings.UserSettings {
    Option.get(Map.get(userSettings, Principal.compare, userId), Settings.DEFAULT);
  };

  public shared ({ caller }) func updateSettings(settings : Settings.UserSettings) : async () {
    assert not Principal.isAnonymous(caller);
    if (not Settings.validateSpendingPriority(settings.spendingPriority)) {
      Debug.trap("Invalid spending priority: must be non-empty, max 9 items, no duplicates");
    };
    Map.add(userSettings, Principal.compare, caller, settings);
  };

  public query ({ caller }) func getSettings() : async Settings.UserSettings {
    assert not Principal.isAnonymous(caller);
    getUserSettings(caller);
  };
};
