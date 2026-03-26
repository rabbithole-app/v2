import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Set "mo:core/Set";

mixin(installer : Principal) {
  let admins = Set.empty<Principal>();
  Set.add(admins, Principal.compare, installer);

  /// Check if caller is an admin, trap if not. Available to other mixins.
  func assertAdmin(caller : Principal) {
    assert Set.contains(admins, Principal.compare, caller);
  };

  public shared ({ caller }) func addAdmin(target : Principal) : async () {
    assertAdmin(caller);
    if (Set.contains(admins, Principal.compare, target)) {
      throw Error.reject("already admin");
    };
    Set.add(admins, Principal.compare, target);
  };

  public shared ({ caller }) func removeAdmin(target : Principal) : async () {
    assertAdmin(caller);
    if (Principal.equal(caller, target)) {
      throw Error.reject("cannot remove self");
    };
    ignore Set.delete(admins, Principal.compare, target);
  };

  public query func listAdmins() : async [Principal] {
    Set.toArray(admins);
  };

  public query func isAdmin(principal : Principal) : async Bool {
    Set.contains(admins, Principal.compare, principal);
  };
};
