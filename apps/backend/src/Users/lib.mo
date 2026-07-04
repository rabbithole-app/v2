import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";

import Hex "mo:hex";
import Sha256 "mo:sha2/Sha256";
import ZenDB "mo:zendb";

import Types "../Types/lib";
import Utils "../Utils/lib";

module {
  public type Role = {
    #user;
    #admin;
    #moderator;
  };

  public type UserIdentityAttributes = {
    email : ?Text;
    name : ?Text;
    verifiedEmail : ?Bool;
    provider : ?Text;
    syncedAt : ?Time.Time;
  };

  public type AvatarRef = {
    rootHash : Text;
    blobId : Blob;
    sha256 : Blob;
    contentType : Text;
    size : Nat;
    updatedAt : Time.Time;
  };

  public type AvatarUploadReservation = {
    avatarRef : AvatarRef;
    expiresAt : Time.Time;
  };

  public type PrepareAvatarUploadArgs = {
    content : Blob;
    contentType : Text;
  };

  public type PrepareAvatarUploadResult = AvatarRef;

  public type UserProfile = {
    username : Text;
    displayName : ?Text;
    avatarRef : ?AvatarRef;
    referralCode : ?Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type User = {
    id : Principal;
    identity : UserIdentityAttributes;
    profile : ?UserProfile;
    lastLoginAt : ?Time.Time;
    inviter : ?Principal;
    inviterText : Text;
    referralAppliedAt : ?Time.Time;
    role : Role;
    roleText : Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type Profile = {
    id : Principal;
    username : Text;
    displayName : ?Text;
    avatarRef : ?AvatarRef;
    referralCode : ?Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type PublicProfileSummary = {
    username : Text;
    displayName : ?Text;
    avatarRef : ?AvatarRef;
  };

  public type PublicProfileLookup = {
    principal : Principal;
    profile : ?PublicProfileSummary;
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
      verifiedEmail : ?Bool;
      identityProvider : ?Text;
      search : ?Text;
      createdAt : ?TimeRangeFilter;
      updatedAt : ?TimeRangeFilter;
      lastLoginAt : ?TimeRangeFilter;
      identitySyncedAt : ?TimeRangeFilter;
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
    identity : UserIdentityAttributes;
    lastLoginAt : ?Time.Time;
    inviter : ?Principal;
    referralAppliedAt : ?Time.Time;
    role : Role;
    roleText : Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
    profile : ?PublicProfileSummary;
  };

  public type AdminUsersPage = {
    data : [AdminUserListItem];
    total : ?Nat;
  };

  public type InvitedUserItem = {
    id : Principal;
    referralAppliedAt : ?Time.Time;
    profile : ?PublicProfileSummary;
  };

  public type InvitedUsersPage = {
    data : [InvitedUserItem];
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

  public type VerifiedEmailIdentity = {
    principal : Principal;
    email : Text;
  };

  public type VerifiedIdentityAttributes = Types.VerifiedIdentityAttributes;

  public type CreateProfileArgs = {
    username : Text;
    displayName : ?Text;
  };

  public type UpdateProfileArgs = {
    displayName : ?Text;
  };

  let USER_DIRECTORY_LIMIT_CAP : Nat = 20;
  let USER_DIRECTORY_MIN_PROFILE_SEARCH_LENGTH : Nat = 2;
  let ADMIN_USER_LIST_LIMIT_CAP : Nat = 100;
  let AVATAR_MAX_BYTES : Nat = 1_048_576;
  let AVATAR_UPLOAD_TTL_NS : Time.Time = 900_000_000_000;

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

  func concatBlob(left : Blob, right : Blob) : Blob {
    Blob.fromArray(Array.concat<Nat8>(Blob.toArray(left), Blob.toArray(right)));
  };

  func sha256WithDomain(domain : Text, payload : Blob) : Blob {
    let digest = Sha256.Digest(#sha256);
    digest.writeBlob(Text.encodeUtf8(domain));
    digest.writeBlob(payload);
    digest.sum();
  };

  func normalizeAvatarContentType(contentType : Text) : ?Text {
    let value = Text.toLower(Text.trim(contentType, #char ' '));
    switch (value) {
      case ("image/jpeg") ?value;
      case ("image/png") ?value;
      case ("image/webp") ?value;
      case _ null;
    };
  };

  func avatarRootHash(content : Blob, contentType : Text) : Text {
    let chunkHash = sha256WithDomain("icfs-chunk/", content);
    let metadata = "Content-Length: " # Nat.toText(content.size()) # "\nContent-Type: " # contentType # "\n";
    let metadataHash = sha256WithDomain("icfs-metadata/", Text.encodeUtf8(metadata));
    let rootHash = sha256WithDomain("ynode/", concatBlob(chunkHash, metadataHash));
    "sha256:" # Hex.toText(Blob.toArray(rootHash));
  };

  func createAvatarRef(content : Blob, contentType : Text, now : Time.Time) : Result.Result<AvatarRef, Text> {
    let size = content.size();
    if (size == 0) return #err("Avatar content is empty");
    if (size > AVATAR_MAX_BYTES) return #err("Avatar content exceeds 1 MiB");

    let ?normalizedContentType = normalizeAvatarContentType(contentType) else {
      return #err("Unsupported avatar content type");
    };

    let rootHash = avatarRootHash(content, normalizedContentType);
    #ok({
      rootHash;
      blobId = Text.encodeUtf8(rootHash);
      sha256 = Sha256.fromBlob(#sha256, content);
      contentType = normalizedContentType;
      size;
      updatedAt = now;
    });
  };

  func emptyIdentity(provider : ?Text, syncedAt : ?Time.Time) : UserIdentityAttributes {
    {
      email = null;
      name = null;
      verifiedEmail = null;
      provider;
      syncedAt;
    };
  };

  func generateReferralCode(principal : Principal) : Text {
    Utils.referralCode([Principal.toBlob(principal)]);
  };

  func toProfile(id : Principal, profile : UserProfile) : Profile {
    {
      id;
      username = profile.username;
      displayName = profile.displayName;
      avatarRef = profile.avatarRef;
      referralCode = profile.referralCode;
      createdAt = profile.createdAt;
      updatedAt = profile.updatedAt;
    };
  };

  func toPublicProfileSummary(profile : UserProfile) : PublicProfileSummary {
    {
      username = profile.username;
      displayName = profile.displayName;
      avatarRef = profile.avatarRef;
    };
  };

  let AvatarRefSchema : ZenDB.Types.Schema = #Record([
    ("rootHash", #Text),
    ("blobId", #Blob),
    ("sha256", #Blob),
    ("contentType", #Text),
    ("size", #Nat),
    ("updatedAt", #Int),
  ]);

  let UserSchema : ZenDB.Types.Schema = #Record([
    ("id", #Principal),
    (
      "identity",
      #Record([
        ("email", #Option(#Text)),
        ("name", #Option(#Text)),
        ("verifiedEmail", #Option(#Bool)),
        ("provider", #Option(#Text)),
        ("syncedAt", #Option(#Int)),
      ]),
    ),
    (
      "profile",
      #Option(
        #Record([
          ("username", #Text),
          ("displayName", #Option(#Text)),
          ("avatarRef", #Option(AvatarRefSchema)),
          ("referralCode", #Option(#Text)),
          ("createdAt", #Int),
          ("updatedAt", #Int),
        ])
      ),
    ),
    ("lastLoginAt", #Option(#Int)),
    ("inviter", #Option(#Principal)),
    ("inviterText", #Text),
    ("referralAppliedAt", #Option(#Int)),
    ("role", #Variant([("user", #Null), ("admin", #Null), ("moderator", #Null)])),
    ("roleText", #Text),
    ("createdAt", #Int),
    ("updatedAt", #Int),
  ]);

  let candifyUsers : ZenDB.Types.Candify<User> = {
    from_blob = func(blob : Blob) : ?User = from_candid (blob);
    to_blob = func(c : User) : Blob = to_candid (c);
  };

  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["id"]),
    #Unique(["profile.username"]),
    #Unique(["profile.referralCode"]),
    #Field("profile.username", [#MinSize(2), #MaxSize(20)]),
    #Field("profile.displayName", [#MaxSize(100)]),
  ];

  public class Users(
    db : ZenDB.Database,
    avatarUploadReservations : Map.Map<Principal, AvatarUploadReservation>,
    avatarDrafts : Map.Map<Principal, AvatarRef>,
  ) {
    let #ok(usersCollection) = db.createCollection<User>("users", UserSchema, candifyUsers, ?{ schema_constraints = schemaConstraints }) else Runtime.unreachable();

    func ensureIndex(name : Text, fields : [(Text, ZenDB.Types.CreateIndexSortDirection)]) {
      switch (usersCollection.getIndex(name)) {
        case (?_) {};
        case null {
          switch (usersCollection.createIndex(name, fields, null)) {
            case (#ok _) {};
            case (#err message) Runtime.trap("Failed to create users index '" # name # "': " # message);
          };
        };
      };
    };

    ensureIndex("users_inviter_idx", [("inviterText", #Ascending)]);
    ensureIndex("users_role_text_idx", [("roleText", #Ascending)]);
    ensureIndex("users_verified_email_idx", [("identity.verifiedEmail", #Ascending)]);
    ensureIndex("users_identity_provider_idx", [("identity.provider", #Ascending)]);
    ensureIndex("users_created_at_idx", [("createdAt", #Ascending)]);
    ensureIndex("users_updated_at_idx", [("updatedAt", #Ascending)]);
    ensureIndex("users_last_login_at_idx", [("lastLoginAt", #Ascending)]);
    ensureIndex("users_identity_synced_at_idx", [("identity.syncedAt", #Ascending)]);
    ensureIndex("users_referral_applied_at_idx", [("referralAppliedAt", #Ascending)]);

    func buildUser(principal : Principal, inviter : ?Principal, role : Role, now : Time.Time) : User {
      {
        id = principal;
        identity = emptyIdentity(null, null);
        profile = null;
        lastLoginAt = null;
        inviter;
        inviterText = switch (inviter) {
          case (?value) Principal.toText(value);
          case null "";
        };
        referralAppliedAt = null;
        role;
        roleText = roleToText(role);
        createdAt = now;
        updatedAt = now;
      };
    };

    public func prepareAvatarUpload(caller : Principal, args : PrepareAvatarUploadArgs) : Result.Result<PrepareAvatarUploadResult, Text> {
      let now = Time.now();
      switch (createAvatarRef(args.content, args.contentType, now)) {
        case (#err(message)) #err(message);
        case (#ok(avatarRef)) {
          Map.add(avatarUploadReservations, Principal.compare, caller, {
            avatarRef;
            expiresAt = now + AVATAR_UPLOAD_TTL_NS;
          });
          #ok(avatarRef);
        };
      };
    };

    public func hasPendingAvatarUpload(caller : Principal, rootHash : Text) : Bool {
      let ?reservation = Map.get(avatarUploadReservations, Principal.compare, caller) else return false;
      reservation.avatarRef.rootHash == rootHash and reservation.expiresAt >= Time.now();
    };

    public func commitAvatarUpload(caller : Principal, rootHash : Text) : ZenDB.Types.Result<AvatarRef, Text> {
      let ?reservation = Map.get(avatarUploadReservations, Principal.compare, caller) else {
        return #err("Avatar upload was not prepared");
      };
      if (reservation.avatarRef.rootHash != rootHash) return #err("Avatar upload root hash mismatch");
      if (reservation.expiresAt < Time.now()) {
        Map.remove(avatarUploadReservations, Principal.compare, caller);
        return #err("Avatar upload expired");
      };

      let now = Time.now();
      let avatarRef = { reservation.avatarRef with updatedAt = now };

      switch (findDocument(caller)) {
        case (?(docId, user)) {
          switch (user.profile) {
            case (?profile) {
              let nextProfile = { profile with avatarRef = ?avatarRef; updatedAt = now };
              switch (usersCollection.replace(docId, { user with profile = ?nextProfile; updatedAt = now })) {
                case (#ok _) {
                  Map.remove(avatarUploadReservations, Principal.compare, caller);
                  #ok(avatarRef);
                };
                case (#err msg) #err(msg);
              };
            };
            case null {
              Map.add(avatarDrafts, Principal.compare, caller, avatarRef);
              Map.remove(avatarUploadReservations, Principal.compare, caller);
              #ok(avatarRef);
            };
          };
        };
        case null {
          Map.add(avatarDrafts, Principal.compare, caller, avatarRef);
          Map.remove(avatarUploadReservations, Principal.compare, caller);
          #ok(avatarRef);
        };
      };
    };

    public func clearAvatar(caller : Principal) : ZenDB.Types.Result<(), Text> {
      Map.remove(avatarUploadReservations, Principal.compare, caller);
      Map.remove(avatarDrafts, Principal.compare, caller);

      let ?(docId, user) = findDocument(caller) else return #ok();
      let ?profile = user.profile else return #ok();
      switch (profile.avatarRef) {
        case null #ok();
        case (?_) {
          let now = Time.now();
          let nextProfile = { profile with avatarRef = null; updatedAt = now };
          switch (usersCollection.replace(docId, { user with profile = ?nextProfile; updatedAt = now })) {
            case (#ok _) #ok();
            case (#err msg) #err(msg);
          };
        };
      };
    };

    public func create(principal : Principal, inviter : ?Principal, role : Role) : ZenDB.Types.Result<ZenDB.Types.DocumentId, Text> {
      usersCollection.insert(buildUser(principal, inviter, role, Time.now()));
    };

    public func createProfile(caller : Principal, args : CreateProfileArgs) : ZenDB.Types.Result<ZenDB.Types.DocumentId, Text> {
      let now = Time.now();
      let avatarRef = Map.get(avatarDrafts, Principal.compare, caller);
      let profile : UserProfile = {
        username = args.username;
        displayName = args.displayName;
        avatarRef;
        referralCode = ?generateReferralCode(caller);
        createdAt = now;
        updatedAt = now;
      };

      let result = switch (findDocument(caller)) {
        case (?(docId, user)) {
          switch (user.profile) {
            case (?_) return #err("Profile already exists");
            case null {};
          };
          switch (usersCollection.replace(docId, { user with profile = ?profile; updatedAt = now })) {
            case (#ok _) #ok(docId);
            case (#err msg) #err(msg);
          };
        };
        case null usersCollection.insert({ buildUser(caller, null, #user, now) with profile = ?profile });
      };

      switch (result) {
        case (#ok _) {
          Map.remove(avatarDrafts, Principal.compare, caller);
          Map.remove(avatarUploadReservations, Principal.compare, caller);
        };
        case (#err _) {};
      };
      result;
    };

    public func updateProfile(caller : Principal, args : UpdateProfileArgs) : ZenDB.Types.Result<(), Text> {
      let ?(docId, user) = findDocument(caller) else return #err("Profile not found");
      let ?profile = user.profile else return #err("Profile not found");
      let now = Time.now();
      let nextProfile : UserProfile = {
        profile with
        displayName = args.displayName;
        updatedAt = now;
      };

      switch (usersCollection.replace(docId, { user with profile = ?nextProfile; updatedAt = now })) {
        case (#ok _) #ok();
        case (#err msg) #err(msg);
      };
    };

    public func getProfile(caller : Principal) : ?Profile {
      let ?user = get(caller) else return null;
      let ?profile = user.profile else return null;
      ?toProfile(caller, profile);
    };

    public func getPublicProfiles(principals : [Principal]) : [PublicProfileLookup] {
      Array.map<Principal, PublicProfileLookup>(
        principals,
        func(principal) {
          let profile = switch (get(principal)) {
            case (?user) switch (user.profile) {
              case (?value) ?toPublicProfileSummary(value);
              case null null;
            };
            case null null;
          };
          { principal; profile };
        },
      );
    };

    public func deleteProfile(caller : Principal) : ZenDB.Types.Result<Profile, Text> {
      let ?(docId, user) = findDocument(caller) else return #err("Profile not found");
      let ?profile = user.profile else return #err("Profile not found");
      let now = Time.now();

      switch (usersCollection.replace(docId, { user with profile = null; updatedAt = now })) {
        case (#ok _) {
          Map.remove(avatarDrafts, Principal.compare, caller);
          Map.remove(avatarUploadReservations, Principal.compare, caller);
          #ok(toProfile(caller, profile));
        };
        case (#err msg) #err(msg);
      };
    };

    public func usernameExists(username : Text) : Bool {
      let q = ZenDB.QueryBuilder().Where("profile.username", #eq(#Text(username))).Limit(1);
      let #ok({ count }) = usersCollection.count(q) else return false;
      count > 0;
    };

    /// Self-serve list of users invited by `ambassador`, newest referral
    /// first. Delegates to the admin `list` query, but exposes only
    /// public-directory fields — identity attributes stay admin-only.
    public func listInvitedBy(ambassador : Principal, pagination : { limit : Nat; offset : Nat }) : InvitedUsersPage {
      let page = list({
        filter = {
          id = null;
          inviter = ?[ambassador];
          role = null;
          verifiedEmail = null;
          identityProvider = null;
          search = null;
          createdAt = null;
          updatedAt = null;
          lastLoginAt = null;
          identitySyncedAt = null;
          referralAppliedAt = null;
        };
        sort = [("referralAppliedAt", #Descending)];
        pagination;
        count = true;
      });
      {
        data = Array.map<AdminUserListItem, InvitedUserItem>(
          page.data,
          func(item) = {
            id = item.id;
            referralAppliedAt = item.referralAppliedAt;
            profile = item.profile;
          },
        );
        total = page.total;
      };
    };

    public func resolveReferralCode(code : Text) : ?Principal {
      let q = ZenDB.QueryBuilder().Where("profile.referralCode", #eq(#Option(#Text(code)))).Limit(1);
      let #ok({ documents }) = usersCollection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, user, _) = documents[0];
      ?user.id;
    };

    public func upsertFromIdentity(principal : Principal, identityProviderHint : ?Text, isNewAuthEvent : Bool) : ZenDB.Types.Result<(), Text> {
      let now = Time.now();
      switch (findDocument(principal)) {
        case (?(docId, user)) {
          let identity = {
            user.identity with
            provider = switch identityProviderHint {
              case (?provider) ?provider;
              case null user.identity.provider;
            };
          };
          let updated = {
            user with
            identity;
            lastLoginAt = if (isNewAuthEvent) ?now else user.lastLoginAt;
            updatedAt = now;
          };
          switch (usersCollection.replace(docId, updated)) {
            case (#ok _) #ok(());
            case (#err msg) #err(msg);
          };
        };
        case null {
          let user = {
            buildUser(principal, null, #user, now) with
            identity = emptyIdentity(identityProviderHint, null);
            lastLoginAt = if (isNewAuthEvent) ?now else null;
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
      let identity : UserIdentityAttributes = {
        email = attrs.email;
        name = attrs.name;
        verifiedEmail = attrs.verifiedEmail;
        provider = attrs.provider;
        syncedAt = ?now;
      };

      switch (findDocument(principal)) {
        case (?(docId, user)) {
          let updated = {
            user with
            identity;
            lastLoginAt = ?now;
            updatedAt = now;
          };
          switch (usersCollection.replace(docId, updated)) {
            case (#ok _) #ok(());
            case (#err msg) #err(msg);
          };
        };
        case null {
          let user = {
            buildUser(principal, null, #user, now) with
            identity;
            lastLoginAt = ?now;
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
        inviterText = Principal.toText(inviter);
        referralAppliedAt = ?now;
        updatedAt = now;
      };
      switch (usersCollection.replace(docId, updated)) {
        case (#ok _) #ok;
        case (#err msg) #storageError(msg);
      };
    };

    public func setRole(principal : Principal, role : Role) : Bool {
      let ?(docId, user) = findDocument(principal) else return false;
      ignore usersCollection.replace(docId, { user with role; roleText = roleToText(role); updatedAt = Time.now() });
      true;
    };

    public func get(caller : Principal) : ?User {
      switch (findDocument(caller)) {
        case (?(_, user)) ?user;
        case null null;
      };
    };

    func matchesAdminSearch(user : User, search : ?Text) : Bool {
      switch (search) {
        case null true;
        case (?"") true;
        case (?value) {
          containsIgnoreCase(Principal.toText(user.id), value) or
          (switch (user.identity.name) { case (?name) containsIgnoreCase(name, value); case null false }) or
          (switch (user.identity.email) { case (?email) containsIgnoreCase(email, value); case null false }) or
          (
            switch (user.profile) {
              case (?profile) {
                containsIgnoreCase(profile.username, value) or
                (switch (profile.displayName) { case (?displayName) containsIgnoreCase(displayName, value); case null false });
              };
              case null false;
            }
          );
        };
      };
    };

    func toAdminUserListItem(user : User) : AdminUserListItem {
      {
        id = user.id;
        identity = user.identity;
        lastLoginAt = user.lastLoginAt;
        inviter = user.inviter;
        referralAppliedAt = user.referralAppliedAt;
        role = user.role;
        roleText = user.roleText;
        createdAt = user.createdAt;
        updatedAt = user.updatedAt;
        profile = switch (user.profile) {
          case (?profile) ?toPublicProfileSummary(profile);
          case null null;
        };
      };
    };

    func addPrincipalListFilter(dbQuery : ZenDB.QueryBuilder, field : Text, values : ?[Principal]) {
      switch (values) {
        case null {};
        case (?items) {
          ignore dbQuery.And(
            field,
            #anyOf(Array.map<Principal, ZenDB.Types.Candid>(items, func(value) = #Principal(value))),
          );
        };
      };
    };

    func addPrincipalTextListFilter(dbQuery : ZenDB.QueryBuilder, field : Text, values : ?[Principal]) {
      switch (values) {
        case null {};
        case (?items) {
          ignore dbQuery.And(
            field,
            #anyOf(Array.map<Principal, ZenDB.Types.Candid>(items, func(value) = #Text(Principal.toText(value)))),
          );
        };
      };
    };

    func addTimeRangeFilter(dbQuery : ZenDB.QueryBuilder, field : Text, range : ?TimeRangeFilter, optional : Bool) {
      switch (range) {
        case null {};
        case (?{ min; max }) {
          switch (min, max) {
            case (?minValue, ?maxValue) ignore dbQuery.And(field, #between(#Int(minValue), #Int(maxValue)));
            case (?minValue, null) ignore dbQuery.And(field, #gte(#Int(minValue)));
            case (null, ?maxValue) ignore dbQuery.And(field, #lte(#Int(maxValue)));
            case (null, null) {
              if (optional) {
                ignore dbQuery.And(field, #exists);
              };
            };
          };
        };
      };
    };

    func sortField(field : Text) : Text {
      if (field == "identityProvider") {
        "identity.provider";
      } else if (field == "identitySyncedAt") {
        "identity.syncedAt";
      } else if (field == "lastLoginAt") {
        "lastLoginAt";
      } else if (field == "name") {
        "identity.name";
      } else if (field == "referralAppliedAt") {
        "referralAppliedAt";
      } else if (field == "role") {
        "roleText";
      } else if (field == "updatedAt") {
        "updatedAt";
      } else {
        "createdAt";
      };
    };

    func applyAdminSort(dbQuery : ZenDB.QueryBuilder, sort : [(Text, ZenDB.Types.SortDirection)]) {
      switch (sort.size()) {
        case (0) ignore dbQuery.SortBy("createdAt", #Descending);
        case (_) {
          let (field, direction) = sort[0];
          ignore dbQuery.SortBy(sortField(field), direction);
        };
      };
    };

    func buildAdminQuery(options : AdminUserListOptions, includePagination : Bool) : ZenDB.QueryBuilder {
      let dbQuery = ZenDB.QueryBuilder();

      addPrincipalListFilter(dbQuery, "id", options.filter.id);
      addPrincipalTextListFilter(dbQuery, "inviterText", options.filter.inviter);

      switch (options.filter.role) {
        case (?role) ignore dbQuery.And("roleText", #eq(#Text(roleToText(role))));
        case null {};
      };
      switch (options.filter.verifiedEmail) {
        case (?true) ignore dbQuery.And("identity.verifiedEmail", #eq(#Bool(true)));
        case (?false) ignore dbQuery.And("identity.verifiedEmail", #not_(#eq(#Bool(true))));
        case null {};
      };
      switch (options.filter.identityProvider) {
        case (?provider) ignore dbQuery.And("identity.provider", #eq(#Text(provider)));
        case null {};
      };

      addTimeRangeFilter(dbQuery, "createdAt", options.filter.createdAt, false);
      addTimeRangeFilter(dbQuery, "updatedAt", options.filter.updatedAt, false);
      addTimeRangeFilter(dbQuery, "lastLoginAt", options.filter.lastLoginAt, true);
      addTimeRangeFilter(dbQuery, "identity.syncedAt", options.filter.identitySyncedAt, true);
      addTimeRangeFilter(dbQuery, "referralAppliedAt", options.filter.referralAppliedAt, true);

      applyAdminSort(dbQuery, options.sort);

      if (includePagination) {
        ignore dbQuery.Skip(options.pagination.offset);
        ignore dbQuery.Limit(Nat.min(options.pagination.limit, ADMIN_USER_LIST_LIMIT_CAP));
      };

      dbQuery;
    };

    func hasAdminSearch(search : ?Text) : Bool {
      switch (search) {
        case null false;
        case (?value) Text.trim(value, #char ' ') != "";
      };
    };

    public func list(options : AdminUserListOptions) : AdminUsersPage {
      let hasSearch = hasAdminSearch(options.filter.search);
      let dbQuery = buildAdminQuery(options, not hasSearch);
      let #ok({ documents }) = usersCollection.search(dbQuery) else Runtime.trap("usersCollection.search failed");

      let maybeRows = Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), ?AdminUserListItem>(
        documents,
        func((_, user, _)) : ?AdminUserListItem {
          if (matchesAdminSearch(user, options.filter.search)) {
            ?toAdminUserListItem(user);
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

      let total = if (hasSearch) {
        rows.size();
      } else {
        let #ok({ count }) = usersCollection.count(buildAdminQuery(options, false)) else Runtime.trap("usersCollection.count failed");
        count;
      };

      let data = if (hasSearch) {
        let offset = Nat.min(options.pagination.offset, rows.size());
        let limit = Nat.min(options.pagination.limit, ADMIN_USER_LIST_LIMIT_CAP);
        let end = Nat.min(offset + limit, rows.size());
        Array.sliceToArray<AdminUserListItem>(rows, offset, end);
      } else {
        rows;
      };

      {
        data;
        total = if (options.count) ?total else null;
      };
    };

    public func searchDirectory(search : Text, limit : Nat) : [UserDirectoryItem] {
      let searchText = Text.trim(search, #char ' ');
      if (searchText == "" or limit == 0) return [];

      let effectiveLimit = Nat.min(limit, USER_DIRECTORY_LIMIT_CAP);
      let canSearchProfiles = Text.size(searchText) >= USER_DIRECTORY_MIN_PROFILE_SEARCH_LENGTH;

      let #ok({ documents }) = usersCollection.search(ZenDB.QueryBuilder()) else return [];
      let maybeMatches = Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), ?UserDirectoryItem>(
        documents,
        func((_, user, _)) : ?UserDirectoryItem {
          let principalExact = Principal.toText(user.id) == searchText;
          let emailExact = switch (user.identity.email) {
            case (?email) equalsIgnoreCase(email, searchText);
            case null false;
          };
          let profileMatches = switch (user.profile) {
            case (?profile) {
              canSearchProfiles and (
                containsIgnoreCase(profile.username, searchText) or
                (switch (profile.displayName) { case (?displayName) containsIgnoreCase(displayName, searchText); case null false })
              );
            };
            case null false;
          };
          let profile = switch (user.profile) {
            case (?value) ?toPublicProfileSummary(value);
            case null null;
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
          Text.compare(directorySortLabel(a), directorySortLabel(b));
        },
      );
      Array.sliceToArray<UserDirectoryItem>(sorted, 0, Nat.min(effectiveLimit, sorted.size()));
    };

    public func listVerifiedEmailIdentities() : [VerifiedEmailIdentity] {
      let #ok({ documents }) = usersCollection.search(ZenDB.QueryBuilder()) else return [];
      let result = Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), ?VerifiedEmailIdentity>(
        documents,
        func((_, user, _)) : ?VerifiedEmailIdentity {
          let isVerified = switch (user.identity.verifiedEmail) {
            case (?value) value;
            case null false;
          };
          if (not isVerified) return null;
          switch (user.identity.email) {
            case (?email) ?{ principal = user.id; email };
            case null null;
          };
        },
      );
      Array.map<?VerifiedEmailIdentity, VerifiedEmailIdentity>(
        Array.filter<?VerifiedEmailIdentity>(result, func(item) = item != null),
        func(item) = switch (item) {
          case (?value) value;
          case null Runtime.unreachable();
        },
      );
    };

    func directorySortLabel(item : UserDirectoryItem) : Text {
      switch (item.profile) {
        case (?profile) switch (profile.displayName) {
          case (?value) value;
          case null profile.username;
        };
        case null Principal.toText(item.id);
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

    public func listByRole(role : Role) : [Principal] {
      let #ok({ documents }) = usersCollection.search(ZenDB.QueryBuilder()) else return [];
      let matches = Array.filter<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch])>(
        documents,
        func((_, user, _)) = user.role == role,
      );
      Array.map<(ZenDB.Types.DocumentId, User, [ZenDB.Types.TextMatch]), Principal>(matches, func((_, user, _)) = user.id);
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
