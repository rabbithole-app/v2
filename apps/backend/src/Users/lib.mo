import Array "mo:core/Array";
import Int "mo:core/Int";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Order "mo:core/Order";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

import Types "../Types/lib";

module {
  public type Role = {
    #user;
    #admin;
    #moderator;
  };

  public type User = {
    id : Principal;
    email : ?Text;
    name : ?Text;
    verifiedEmail : ?Bool;
    authProvider : ?Text;
    lastLoginAt : ?Time.Time;
    profileSyncedAt : ?Time.Time;
    inviter : ?Principal;
    referralAppliedAt : ?Time.Time;
    role : Role;
    trialUsed : Bool;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type PublicProfileSummary = {
    username : Text;
    displayName : ?Text;
    avatarUrl : ?Text;
  };

  public type TimeRangeFilter = {
    min : ?Time.Time;
    max : ?Time.Time;
  };

  public type AdminUserListOptions = {
    filter : {
      id : ?[Principal];
      inviter : ?[Principal];
      role : ?Role;
      trialUsed : ?Bool;
      verifiedEmail : ?Bool;
      authProvider : ?Text;
      search : ?Text;
      createdAt : ?TimeRangeFilter;
      updatedAt : ?TimeRangeFilter;
      lastLoginAt : ?TimeRangeFilter;
      profileSyncedAt : ?TimeRangeFilter;
      referralAppliedAt : ?TimeRangeFilter;
    };

    sort : [(Text, ZenDB.Types.SortDirection)];

    pagination : {
      limit : Nat;
      offset : Nat;
    };

    count : Bool;
  };

  public type AdminUserListItem = {
    id : Principal;
    email : ?Text;
    name : ?Text;
    verifiedEmail : ?Bool;
    authProvider : ?Text;
    lastLoginAt : ?Time.Time;
    profileSyncedAt : ?Time.Time;
    inviter : ?Principal;
    referralAppliedAt : ?Time.Time;
    role : Role;
    trialUsed : Bool;
    createdAt : Time.Time;
    updatedAt : Time.Time;
    profile : ?PublicProfileSummary;
  };

  public type AdminUsersPage = {
    data : [AdminUserListItem];
    total : ?Nat;
  };

  public type UserDirectoryMatch = {
    #profile;
    #emailExact;
    #principalExact;
  };

  public type UserDirectoryItem = {
    id : Principal;
    match : UserDirectoryMatch;
    profile : ?PublicProfileSummary;
  };

  public type VerifiedIdentityAttributes = Types.VerifiedIdentityAttributes;

  let USER_DIRECTORY_LIMIT_CAP : Nat = 20;
  let USER_DIRECTORY_MIN_PROFILE_SEARCH_LENGTH : Nat = 2;

  public type ApplyReferralCodeResult = {
    #ok;
    #alreadyApplied;
    #userNotFound;
    #referralCodeNotFound;
    #selfReferral;
    #storageError : Text;
  };

  public type AmbassadorChain = {
    l1 : ?Principal;
    l2 : ?Principal;
  };

  public func roleToText(r : Role) : Text {
    switch (r) {
      case (#user) "user";
      case (#admin) "admin";
      case (#moderator) "moderator";
    };
  };

  func containsIgnoreCase(value : Text, needle : Text) : Bool {
    Text.contains(Text.toLower(value), #text(Text.toLower(needle)));
  };

  func equalsIgnoreCase(value : Text, expected : Text) : Bool {
    Text.toLower(value) == Text.toLower(expected);
  };

  func roleRank(role : Role) : Nat {
    switch (role) {
      case (#admin) 0;
      case (#moderator) 1;
      case (#user) 2;
    };
  };

  func compareRole(a : Role, b : Role) : Order.Order {
    Nat.compare(roleRank(a), roleRank(b));
  };

  func compareOptionalTime(a : ?Time.Time, b : ?Time.Time) : Order.Order {
    switch (a, b) {
      case (?left, ?right) Int.compare(left, right);
      case (?_, null) #greater;
      case (null, ?_) #less;
      case (null, null) #equal;
    };
  };

  let UserSchema : ZenDB.Types.Schema = #Record([
    ("id", #Principal),
    ("email", #Option(#Text)),
    ("name", #Option(#Text)),
    ("verifiedEmail", #Option(#Bool)),
    ("authProvider", #Option(#Text)),
    ("lastLoginAt", #Option(#Int)),
    ("profileSyncedAt", #Option(#Int)),
    ("inviter", #Option(#Principal)),
    ("referralAppliedAt", #Option(#Int)),
    ("role", #Variant([("user", #Null), ("admin", #Null), ("moderator", #Null)])),
    ("trialUsed", #Bool),
    ("createdAt", #Int),
    ("updatedAt", #Int),
  ]);

  let candifyUsers : ZenDB.Types.Candify<User> = {
    from_blob = func(blob : Blob) : ?User = from_candid (blob);
    to_blob = func(c : User) : Blob = to_candid (c);
  };

  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["id"]),
  ];

  public class Users(db : ZenDB.Database) {
    let #ok(usersCollection) = db.createCollection<User>("users", UserSchema, candifyUsers, ?{ schema_constraints = schemaConstraints }) else Runtime.unreachable();

    public func create(principal : Principal, inviter : ?Principal, role : Role) : ZenDB.Types.Result<ZenDB.Types.DocumentId, Text> {
      let now = Time.now();
      let user : User = {
        id = principal;
        email = null;
        name = null;
        verifiedEmail = null;
        authProvider = null;
        lastLoginAt = null;
        profileSyncedAt = null;
        inviter;
        referralAppliedAt = null;
        role;
        trialUsed = false;
        createdAt = now;
        updatedAt = now;
      };
      usersCollection.insert(user);
    };

    public func upsertFromIdentity(principal : Principal, authProvider : ?Text, isNewAuthEvent : Bool) : ZenDB.Types.Result<(), Text> {
      let now = Time.now();
      switch (findDocument(principal)) {
        case (?(docId, user)) {
          let updated = {
            user with
            authProvider = switch authProvider {
              case (?provider) ?provider;
              case null user.authProvider;
            };
            lastLoginAt = if (isNewAuthEvent) ?now else user.lastLoginAt;
            updatedAt = now;
          };
          switch (usersCollection.replace(docId, updated)) {
            case (#ok _) #ok(());
            case (#err msg) #err(msg);
          };
        };
        case null {
          let user : User = {
            id = principal;
            email = null;
            name = null;
            verifiedEmail = null;
            authProvider;
            lastLoginAt = if (isNewAuthEvent) ?now else null;
            profileSyncedAt = null;
            inviter = null;
            referralAppliedAt = null;
            role = #user;
            trialUsed = false;
            createdAt = now;
            updatedAt = now;
          };
          switch (usersCollection.insert(user)) {
            case (#ok _) #ok(());
            case (#err msg) #err(msg);
          };
        };
      };
    };

    public func upsertFromVerifiedAttributes(principal : Principal, attrs : VerifiedIdentityAttributes) : ZenDB.Types.Result<(), Text> {
      let now = Time.now();
      switch (findDocument(principal)) {
        case (?(docId, user)) {
          let updated = {
            user with
            email = attrs.email;
            name = attrs.name;
            verifiedEmail = attrs.verifiedEmail;
            authProvider = attrs.authProvider;
            lastLoginAt = ?now;
            profileSyncedAt = ?now;
            updatedAt = now;
          };
          switch (usersCollection.replace(docId, updated)) {
            case (#ok _) #ok(());
            case (#err msg) #err(msg);
          };
        };
        case null {
          let user : User = {
            id = principal;
            email = attrs.email;
            name = attrs.name;
            verifiedEmail = attrs.verifiedEmail;
            authProvider = attrs.authProvider;
            lastLoginAt = ?now;
            profileSyncedAt = ?now;
            inviter = null;
            referralAppliedAt = null;
            role = #user;
            trialUsed = false;
            createdAt = now;
            updatedAt = now;
          };
          switch (usersCollection.insert(user)) {
            case (#ok _) #ok(());
            case (#err msg) #err(msg);
          };
        };
      };
    };

    public func applyReferralCode(principal : Principal, inviter : Principal) : ApplyReferralCodeResult {
      if (Principal.equal(principal, inviter)) return #selfReferral;

      let ?(docId, user) = findDocument(principal) else return #userNotFound;
      switch (user.inviter) {
        case (?_) return #alreadyApplied;
        case null {};
      };

      let now = Time.now();
      let updated = {
        user with
        inviter = ?inviter;
        referralAppliedAt = ?now;
        updatedAt = now;
      };
      switch (usersCollection.replace(docId, updated)) {
        case (#ok _) #ok;
        case (#err msg) #storageError(msg);
      };
    };

    public func hasUsedTrial(principal : Principal) : Bool {
      let ?user = get(principal) else return false;
      user.trialUsed;
    };

    public func markTrialUsed(principal : Principal) {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Principal(principal))).Limit(1);
      let #ok({ documents }) = usersCollection.search(q) else return;
      if (documents.size() == 0) return;
      let (docId, user, _) = documents[0];
      ignore usersCollection.replace(docId, { user with trialUsed = true; updatedAt = Time.now() });
    };

    /// Update a user's role. Returns false if user doesn't exist.
    public func setRole(principal : Principal, role : Role) : Bool {
      let ?(docId, user) = findDocument(principal) else return false;
      ignore usersCollection.replace(docId, { user with role; updatedAt = Time.now() });
      true;
    };

    public func get(caller : Principal) : ?User {
      switch (findDocument(caller)) {
        case (?(_, user)) ?user;
        case null null;
      };
    };

    func matchesIdFilter(user : User, ids : ?[Principal]) : Bool {
      switch (ids) {
        case null true;
        case (?values) {
          Array.find<Principal>(values, func(id) = Principal.equal(id, user.id)) != null;
        };
      };
    };

    func matchesInviterFilter(user : User, ids : ?[Principal]) : Bool {
      switch (ids, user.inviter) {
        case (null, _) true;
        case (?values, ?inviter) {
          Array.find<Principal>(values, func(id) = Principal.equal(id, inviter)) != null;
        };
        case (?_, null) false;
      };
    };

    func matchesOptionalBoolFilter(value : ?Bool, filter : ?Bool) : Bool {
      switch (filter) {
        case null true;
        case (?true) value == ?true;
        case (?false) value != ?true;
      };
    };

    func matchesOptionalTextFilter(value : ?Text, filter : ?Text) : Bool {
      switch (filter) {
        case null true;
        case (?expected) value == ?expected;
      };
    };

    func matchesTimeFilter(value : Time.Time, filter : ?TimeRangeFilter) : Bool {
      switch (filter) {
        case null true;
        case (?{ min; max }) {
          let minOk = switch (min) {
            case (?minValue) value >= minValue;
            case null true;
          };
          let maxOk = switch (max) {
            case (?maxValue) value <= maxValue;
            case null true;
          };
          minOk and maxOk;
        };
      };
    };

    func matchesOptionalTimeFilter(value : ?Time.Time, filter : ?TimeRangeFilter) : Bool {
      switch (filter) {
        case null true;
        case (?range) {
          switch (value) {
            case (?time) matchesTimeFilter(time, ?range);
            case null false;
          };
        };
      };
    };

    func matchesAdminSearch(user : User, profile : ?PublicProfileSummary, search : ?Text) : Bool {
      switch (search) {
        case null true;
        case (?"") true;
        case (?value) {
          containsIgnoreCase(Principal.toText(user.id), value) or (switch (user.name) { case (?name) containsIgnoreCase(name, value); case null false }) or (switch (user.email) { case (?email) containsIgnoreCase(email, value); case null false }) or (
            switch (profile) {
              case (?p) {
                containsIgnoreCase(p.username, value) or (switch (p.displayName) { case (?displayName) containsIgnoreCase(displayName, value); case null false });
              };
              case null false;
            }
          );
        };
      };
    };

    func toAdminUserListItem(user : User, profile : ?PublicProfileSummary) : AdminUserListItem {
      {
        id = user.id;
        email = user.email;
        name = user.name;
        verifiedEmail = user.verifiedEmail;
        authProvider = user.authProvider;
        lastLoginAt = user.lastLoginAt;
        profileSyncedAt = user.profileSyncedAt;
        inviter = user.inviter;
        referralAppliedAt = user.referralAppliedAt;
        role = user.role;
        trialUsed = user.trialUsed;
        createdAt = user.createdAt;
        updatedAt = user.updatedAt;
        profile;
      };
    };

    func compareAdminItems(a : AdminUserListItem, b : AdminUserListItem, sort : [(Text, ZenDB.Types.SortDirection)]) : Order.Order {
      let (field, direction) = switch (List.first(List.fromArray<(Text, ZenDB.Types.SortDirection)>(sort))) {
        case (?(field, direction)) (field, direction);
        case null ("createdAt", #Descending);
      };

      let order = if (field == "updatedAt") {
        Int.compare(a.updatedAt, b.updatedAt);
      } else if (field == "referralAppliedAt") {
        compareOptionalTime(a.referralAppliedAt, b.referralAppliedAt);
      } else if (field == "profileSyncedAt") {
        compareOptionalTime(a.profileSyncedAt, b.profileSyncedAt);
      } else if (field == "lastLoginAt") {
        compareOptionalTime(a.lastLoginAt, b.lastLoginAt);
      } else if (field == "role") {
        compareRole(a.role, b.role);
      } else if (field == "name") {
        Text.compare(
          switch (a.profile) {
            case (?p) switch (p.displayName) {
              case (?v) v;
              case null p.username;
            };
            case null switch (a.name) { case (?v) v; case null "" };
          },
          switch (b.profile) {
            case (?p) switch (p.displayName) {
              case (?v) v;
              case null p.username;
            };
            case null switch (b.name) { case (?v) v; case null "" };
          },
        );
      } else {
        Int.compare(a.createdAt, b.createdAt);
      };

      switch (direction) {
        case (#Descending) {
          switch (order) {
            case (#less) #greater;
            case (#greater) #less;
            case (#equal) #equal;
          };
        };
        case (#Ascending) order;
      };
    };

    public func list(options : AdminUserListOptions, getProfile : (Principal) -> ?PublicProfileSummary) : AdminUsersPage {
      let #ok({ documents }) = usersCollection.search(ZenDB.QueryBuilder()) else Runtime.trap("usersCollection.search failed");

      let maybeRows = Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), ?AdminUserListItem>(
        documents,
        func((_, user, _)) : ?AdminUserListItem {
          let profile = getProfile(user.id);
          if (
            matchesIdFilter(user, options.filter.id) and matchesInviterFilter(user, options.filter.inviter) and (switch (options.filter.role) { case (?role) user.role == role; case null true }) and (switch (options.filter.trialUsed) { case (?trialUsed) user.trialUsed == trialUsed; case null true }) and matchesOptionalBoolFilter(user.verifiedEmail, options.filter.verifiedEmail) and matchesOptionalTextFilter(user.authProvider, options.filter.authProvider) and matchesTimeFilter(user.createdAt, options.filter.createdAt) and matchesTimeFilter(user.updatedAt, options.filter.updatedAt) and matchesOptionalTimeFilter(user.lastLoginAt, options.filter.lastLoginAt) and matchesOptionalTimeFilter(user.profileSyncedAt, options.filter.profileSyncedAt) and matchesOptionalTimeFilter(user.referralAppliedAt, options.filter.referralAppliedAt) and matchesAdminSearch(user, profile, options.filter.search)
          ) {
            ?toAdminUserListItem(user, profile);
          } else {
            null;
          };
        },
      );
      let rows = Array.map<?AdminUserListItem, AdminUserListItem>(
        Array.filter<?AdminUserListItem>(maybeRows, func(item) = item != null),
        func(item) = switch (item) {
          case (?value) value;
          case null Runtime.unreachable();
        },
      );

      let sorted = Array.sort<AdminUserListItem>(rows, func(a, b) = compareAdminItems(a, b, options.sort));
      let total = sorted.size();
      let offset = Nat.min(options.pagination.offset, total);
      let end = Nat.min(offset + options.pagination.limit, total);
      {
        data = Array.sliceToArray<AdminUserListItem>(sorted, offset, end);
        total = if (options.count) ?total else null;
      };
    };

    public func searchDirectory(search : Text, limit : Nat, getProfile : (Principal) -> ?PublicProfileSummary) : [UserDirectoryItem] {
      let searchText = Text.trim(search, #char ' ');
      if (searchText == "" or limit == 0) return [];

      let effectiveLimit = Nat.min(limit, USER_DIRECTORY_LIMIT_CAP);
      let canSearchProfiles = Text.size(searchText) >= USER_DIRECTORY_MIN_PROFILE_SEARCH_LENGTH;

      let #ok({ documents }) = usersCollection.search(ZenDB.QueryBuilder()) else return [];
      let maybeMatches = Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), ?UserDirectoryItem>(
        documents,
        func((_, user, _)) : ?UserDirectoryItem {
          let profile = getProfile(user.id);
          let principalExact = Principal.toText(user.id) == searchText;
          let emailExact = switch (user.email) {
            case (?email) equalsIgnoreCase(email, searchText);
            case null false;
          };
          let profileMatches = switch (profile) {
            case (?p) {
              canSearchProfiles and (
                containsIgnoreCase(p.username, searchText) or (switch (p.displayName) { case (?displayName) containsIgnoreCase(displayName, searchText); case null false })
              );
            };
            case null false;
          };

          if (principalExact) {
            ?{ id = user.id; match = #principalExact; profile };
          } else if (emailExact) {
            ?{ id = user.id; match = #emailExact; profile };
          } else if (profileMatches) {
            ?{ id = user.id; match = #profile; profile };
          } else {
            null;
          };
        },
      );
      let matches = Array.map<?UserDirectoryItem, UserDirectoryItem>(
        Array.filter<?UserDirectoryItem>(maybeMatches, func(item) = item != null),
        func(item) = switch (item) {
          case (?value) value;
          case null Runtime.unreachable();
        },
      );

      let sorted = Array.sort<UserDirectoryItem>(
        matches,
        func(a, b) {
          Text.compare(
            switch (a.profile) {
              case (?p) switch (p.displayName) {
                case (?v) v;
                case null p.username;
              };
              case null Principal.toText(a.id);
            },
            switch (b.profile) {
              case (?p) switch (p.displayName) {
                case (?v) v;
                case null p.username;
              };
              case null Principal.toText(b.id);
            },
          );
        },
      );
      Array.sliceToArray<UserDirectoryItem>(sorted, 0, Nat.min(effectiveLimit, sorted.size()));
    };

    func findDocument(caller : Principal) : ?(ZenDB.Types.DocumentId, User) {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);
      let #ok({ documents }) = usersCollection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (docId, user, _) = documents[0];
      ?(docId, user);
    };

    public func exists(id : Principal) : Bool {
      get(id) != null;
    };

    public func isAdmin(principal : Principal) : Bool {
      switch (get(principal)) {
        case (?u) u.role == #admin;
        case null false;
      };
    };

    /// List all users with a specific role.
    /// Implemented as a full scan + in-memory filter because Orchid (ZenDB's
    /// index encoder) does not support equality queries on compound types
    /// like `#Variant`. For expected user counts (thousands) this is fine;
    /// revisit if the table grows to millions.
    public func listByRole(role : Role) : [Principal] {
      let #ok({ documents }) = usersCollection.search(ZenDB.QueryBuilder()) else return [];
      let matches = Array.filter<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch])>(
        documents,
        func((_, u, _)) = u.role == role,
      );
      Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), Principal>(matches, func((_, u, _)) = u.id);
    };

    public func getAmbassadorChain(principal : Principal) : AmbassadorChain {
      let ?user = get(principal) else return { l1 = null; l2 = null };
      let ?inviter = user.inviter else return { l1 = null; l2 = null };
      let l2 = switch (get(inviter)) {
        case (?inviterUser) inviterUser.inviter;
        case null null;
      };
      { l1 = ?inviter; l2 };
    };
  };
};
