import Array "mo:core/Array";
import IC "mo:core/InternetComputer";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Text "mo:core/Text";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

import ByteUtils "mo:byte-utils";
import Sha256 "mo:sha2/Sha256";
import ZenDB "mo:zendb";

module {
  public type ListOptions = {
    filter : {
      id : ?[Principal];
      username : ?Text;
      displayName : ?Text;
      avatarUrl : ?Bool;
      createdAt : ?{
        min : ?Int;
        max : ?Int;
      };
    };

    sort : [(Text, ZenDB.Types.SortDirection)];

    pagination : {
      limit : Nat;
      offset : Nat;
    };

    count : Bool;
  };

  public type Profile = {
    id : Principal;
    username : Text;
    displayName : ?Text;
    avatarUrl : ?Text;
    referralCode : ?Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  let ProfileSchema : ZenDB.Types.Schema = #Record([
    ("id", #Principal),
    ("username", #Text),
    ("displayName", #Option(#Text)),
    ("avatarUrl", #Option(#Text)),
    ("referralCode", #Option(#Text)),
    ("createdAt", #Int),
    ("updatedAt", #Int),
  ]);

  public type CreateProfileArgs = {
    username : Text;
    displayName : ?Text;
    avatarUrl : ?Text;
  };

  public type CreateProfileAvatarArgs = {
    filename : Text;
    content : Blob;
    contentType : Text;
  };

  public type UpdateProfileArgs = {
    avatarUrl : ?Text;
    displayName : ?Text;
  };

  public type GetProfilesResponse = {
    data : [Profile];
    total : ?Nat;
    instructions : Nat;
  };

  let candifyProfiles : ZenDB.Types.Candify<Profile> = {
    from_blob = func(blob : Blob) : ?Profile = from_candid (blob);
    to_blob = func(c : Profile) : Blob = to_candid (c);
  };

  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["id"]),
    #Unique(["username"]),
    #Unique(["referralCode"]),
    #Field("username", [#MinSize(2), #MaxSize(20)]),
    #Field("displayName", [#MaxSize(100)]),
  ];

  /// Generate an 8-char alphanumeric referral code (e.g. "8UGR6WKP")
  /// Deterministic per principal (seeded PRNG from SHA256 of principal)
  func generateReferralCode(principal : Principal) : Text {
    let alphabet = Text.toArray("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    let hash = Sha256.fromBlob(#sha256, Principal.toBlob(principal));
    let seed = ByteUtils.BigEndian.toNat64(hash.vals());

    let random = Random.seed(seed);
    var code = "";
    var i = 0;
    while (i < 8) {
      let idx = random.natRange(0, alphabet.size());
      code #= Text.fromChar(alphabet[idx]);
      i += 1;
    };
    code;
  };

  func convertListOptionsToDBQuery(options : ListOptions) : ZenDB.QueryBuilder {
    let dbQuery = ZenDB.QueryBuilder();
    ignore dbQuery.Limit(options.pagination.limit);
    ignore dbQuery.Skip(options.pagination.offset);

    switch (options.filter.id) {
      case (?v) {
        let values = Array.map<Principal, ZenDB.Types.Candid>(v, func id = #Principal(id));
        ignore dbQuery.Where("id", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.username) {
      case (?v) ignore dbQuery.Where("username", #eq(#Text(v))); //.Or("username", #startsWith(#Text(v)));
      case null {};
    };

    switch (options.filter.displayName) {
      case (?v) ignore dbQuery.Where("displayName", #eq(#Option(#Text(v))));
      case null {};
    };

    switch (options.filter.avatarUrl) {
      case (?true) ignore dbQuery.Where("avatarUrl", #not_(#eq(#Null))); // #exists
      case (?false) ignore dbQuery.Where("avatarUrl", #eq(#Null)); // #not_(#exists)
      case null {};
    };

    switch (options.filter.createdAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("createdAt", #between(#Int(min), #Int(max)));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("createdAt", #gte(#Int(min)));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("createdAt", #lte(#Int(max)));
      case _ {};
    };

    switch (List.first(List.fromArray<(Text, ZenDB.Types.SortDirection)>(options.sort))) {
      case (?(field, direction)) ignore dbQuery.SortBy(field, direction);
      case null {};
    };

    dbQuery;
  };

  public class Profiles(db : ZenDB.Database, deleteAsset : (Text) -> ()) {
    let #ok(profilesCollection) = db.createCollection<Profile>("profiles", ProfileSchema, candifyProfiles, ?{ schema_constraints = schemaConstraints }) else Runtime.unreachable();

    // Tracks the last uploaded (but not yet saved) avatar asset key per user.
    // On each trackAvatar call the previous pending avatar is deleted.
    let pendingAvatars : Map.Map<Principal, Text> = Map.empty();

    /// Delete asset key if it exists and differs from the one being kept.
    func deleteIfDifferent(key : ?Text, keep : ?Text) {
      switch key {
        case (?k) { if (?k != keep) deleteAsset(k) };
        case null {};
      };
    };

    /// Track a newly uploaded avatar. Deletes the previous pending avatar if any.
    public func trackAvatar(caller : Principal, key : Text) {
      switch (Map.swap(pendingAvatars, Principal.compare, caller, key)) {
        case (?prevKey) deleteAsset(prevKey);
        case null {};
      };
    };

    public func create(caller : Principal, args : CreateProfileArgs) : ZenDB.Types.Result<ZenDB.Types.DocumentId, Text> {
      let now = Time.now();
      let profile : Profile = {
        id = caller;
        username = args.username;
        displayName = args.displayName;
        avatarUrl = args.avatarUrl;
        referralCode = ?generateReferralCode(caller);
        createdAt = now;
        updatedAt = now;
      };
      profilesCollection.insert(profile);
    };

    public func update(caller : Principal, args : UpdateProfileArgs) : ZenDB.Types.Result<(), Text> {
      let callerQuery = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);

      // Get prevAvatarUrl before update
      let prevAvatarUrl : ?Text = switch (profilesCollection.search(callerQuery)) {
        case (#ok({ documents })) {
          if (documents.size() == 0) return #err("Profile not found");
          let (_, profile, _) = documents[0];
          profile.avatarUrl;
        };
        case (#err message) return #err(message);
      };

      let #ok({ updated_count }) = profilesCollection.update(
        callerQuery,
        [
          ("displayName", Option.map<Text, ZenDB.Types.Candid>(args.displayName, func(v : Text) : ZenDB.Types.Candid = #Text(v)) |> Option.get(_, #Null) |> #Option _),
          ("avatarUrl", Option.map<Text, ZenDB.Types.Candid>(args.avatarUrl, func(v : Text) : ZenDB.Types.Candid = #Text(v)) |> Option.get(_, #Null) |> #Option _),
          ("updatedAt", #Int(Time.now())),
        ],
      ) else return #err("Failed to update profile");

      if (updated_count == 0) {
        return #err("Profile not found");
      };

      deleteIfDifferent(Map.take(pendingAvatars, Principal.compare, caller), args.avatarUrl);
      deleteIfDifferent(prevAvatarUrl, args.avatarUrl);

      #ok();
    };

    public func get(caller : Principal) : ?Profile {
      let callerQuery = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);

      let #ok({ documents }) = profilesCollection.search(callerQuery) else return null;
      if (documents.size() == 0) return null;
      let (_, profile, _) = documents[0];
      ?profile;
    };

    public func delete(caller : Principal) : ZenDB.Types.Result<Profile, Text> {
      let callerQuery = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);

      let #ok({ deleted_documents }) = profilesCollection.delete(callerQuery) else return #err("Failed to delete profile");
      if (deleted_documents.size() == 0) return #err("Profile not found");
      let (_, profile) = deleted_documents[0];

      deleteIfDifferent(profile.avatarUrl, null); // always delete saved avatar
      deleteIfDifferent(Map.take(pendingAvatars, Principal.compare, caller), profile.avatarUrl);

      #ok(profile);
    };

    public func usernameExists(username : Text) : Bool {
      let profilesByUsernameQuery = ZenDB.QueryBuilder().Where("username", #eq(#Text(username)));
      let #ok({ count }) = profilesCollection.count(profilesByUsernameQuery) else return false;
      count > 0;
    };

    public func resolveReferralCode(code : Text) : ?Principal {
      let q = ZenDB.QueryBuilder().Where("referralCode", #eq(#Option(#Text(code)))).Limit(1);
      let #ok({ documents }) = profilesCollection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, profile, _) = documents[0];
      ?profile.id;
    };

    public func list(options : ListOptions) : GetProfilesResponse {
      let dbQuery = convertListOptionsToDBQuery(options);

      var data : [Profile] = [];
      var total : ?Nat = null;

      let instructions = IC.countInstructions(
        func() {
          data := switch (profilesCollection.search(dbQuery)) {
            case (#ok({ documents })) Array.map<(ZenDB.Types.DocumentId, Profile, [ZenDB.Types.TextMatch]), Profile>(documents, func(_, profile, _) = profile);
            case (#err message) Runtime.trap("list failed: " # message);
          };

          if (options.count) {
            let #ok({ count }) = profilesCollection.count(dbQuery) else Runtime.trap("profilesCollection.count failed");
            total := ?count;
          };
        }
      );

      { data; total; instructions = Nat64.toNat(instructions) };
    };
  };
};
