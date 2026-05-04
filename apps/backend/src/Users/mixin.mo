import Debug "mo:core/Debug";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";

import Users "lib";
import ZenDB "mo:zendb";

mixin (
  installer : Principal,
  db : ZenDB.Database,
  deps : {
    getProfileById : (Principal) -> ?{
      id : Principal;
      username : Text;
      displayName : ?Text;
      avatarUrl : ?Text;
      referralCode : ?Text;
      createdAt : Int;
      updatedAt : Int;
    };
    resolveReferralCode : (Text) -> ?Principal;
  },
) {
  transient let users = Users.Users(db);

  // Bootstrap: the deployer principal (installer) becomes the first admin.
  // Creating a User record here guarantees `isAdmin(installer)` is true before
  // anyone else registers. Safe to call on every startup — `users.create` is
  // rejected by the ZenDB unique-on-id constraint if the record already exists.
  if (not users.exists(installer)) {
    switch (users.create(installer, null, #admin)) {
      case (#ok _) {};
      case (#err msg) Debug.print("Failed to bootstrap installer admin: " # msg);
    };
  };

  // ---- Admin guard (provided to sibling mixins as a callback) ----

  /// Non-trapping admin check, usable from both update and query contexts.
  /// Returns false for non-admins and unknown principals.
  func isAdminPrincipal(principal : Principal) : Bool {
    users.isAdmin(principal);
  };

  /// Trap if caller is not an admin (#admin role). Consumed by other mixins
  /// and by main.mo as a callback — so callers don't need to care about the
  /// underlying storage mechanism (Set vs role field).
  func assertAdmin(caller : Principal) {
    assert users.isAdmin(caller);
  };

  // ---- Ambassador chain (for payment distribution) ----

  func getAmbassadorChain(principal : Principal) : Users.AmbassadorChain {
    users.getAmbassadorChain(principal);
  };

  // ---- Registration ----

  public shared ({ caller }) func ensureUser(authProvider : ?Text) : async () {
    assert not Principal.isAnonymous(caller);
    switch (users.upsertFromIdentity(caller, authProvider, true)) {
      case (#ok _) {};
      case (#err msg) Debug.print("Failed to ensure user: " # msg);
    };
  };

  public shared ({ caller }) func applyReferralCode(referralCode : Text) : async Users.ApplyReferralCodeResult {
    assert not Principal.isAnonymous(caller);
    let ?inviter = deps.resolveReferralCode(referralCode) else return #referralCodeNotFound;
    users.applyReferralCode(caller, inviter);
  };

  func upsertFromVerifiedAttributes(principal : Principal, attrs : Users.VerifiedIdentityAttributes) : Result.Result<(), Text> {
    users.upsertFromVerifiedAttributes(principal, attrs);
  };

  // ---- Internal helpers for other mixins ----

  func hasUsedTrial(principal : Principal) : Bool {
    users.hasUsedTrial(principal);
  };

  func markTrialUsed(principal : Principal) {
    users.markTrialUsed(principal);
  };

  func userExists(principal : Principal) : Bool {
    users.exists(principal);
  };

  func getPublicProfileSummary(principal : Principal) : ?Users.PublicProfileSummary {
    switch (deps.getProfileById(principal)) {
      case (?profile) ?{
        username = profile.username;
        displayName = profile.displayName;
        avatarUrl = profile.avatarUrl;
      };
      case null null;
    };
  };

  // ---- Public queries ----

  public query ({ caller }) func getUser() : async ?Users.User {
    assert not Principal.isAnonymous(caller);
    users.get(caller);
  };

  public query ({ caller }) func getAmbassadorChainQuery() : async Users.AmbassadorChain {
    assert not Principal.isAnonymous(caller);
    users.getAmbassadorChain(caller);
  };

  /// Anyone can check if a principal is an admin (used by frontends to show/hide UI).
  public query func isAdmin(principal : Principal) : async Bool {
    users.isAdmin(principal);
  };

  /// Public user lookup for sharing and access management.
  /// Privacy contract:
  /// - partial username/displayName matches only return users with profiles;
  /// - exact email matches confirm an existing account without exposing email;
  /// - exact principal matches return profile or bare principal records;
  /// - result count and partial search length are capped in Users.searchDirectory.
  public query func searchUserDirectory(search : Text, limit : Nat) : async [Users.UserDirectoryItem] {
    users.searchDirectory(search, limit, getPublicProfileSummary);
  };

  // ---- Admin API ----

  /// Change a user's role. Admin-only.
  /// Admin promotion may bootstrap an unknown principal as #admin so a current
  /// admin can recover/add another admin by principal. Non-admin roles require
  /// an existing user record.
  /// Cannot self-demote from #admin (prevents accidentally locking out all admins
  /// when only one exists — admin must promote someone else first, then be demoted).
  public shared ({ caller }) func setUserRole(target : Principal, role : Users.Role) : async () {
    assertAdmin(caller);
    if (Principal.equal(caller, target) and role != #admin) {
      throw Error.reject("cannot self-demote from admin");
    };
    if (not users.setRole(target, role)) {
      switch (role) {
        case (#admin) {
          switch (users.create(target, null, #admin)) {
            case (#ok _) {};
            case (#err msg) throw Error.reject(msg);
          };
        };
        case _ throw Error.reject("user not found");
      };
    };
  };

  /// List principals with a specific role. Admin-only.
  /// Use `listUsersByRole(#admin)` to enumerate admins.
  public query ({ caller }) func listUsersByRole(role : Users.Role) : async [Principal] {
    assertAdmin(caller);
    users.listByRole(role);
  };

  public query ({ caller }) func adminListUsers(options : Users.AdminUserListOptions) : async Users.AdminUsersPage {
    assertAdmin(caller);
    users.list(options, getPublicProfileSummary);
  };
};
