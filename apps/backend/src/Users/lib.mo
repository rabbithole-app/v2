import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
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

  public type VerifiedIdentityAttributes = Types.VerifiedIdentityAttributes;

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
            authProvider = switch authProvider { case (?provider) ?provider; case null user.authProvider };
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
