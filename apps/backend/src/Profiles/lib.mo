import Array "mo:core/Array";
import IC "mo:core/InternetComputer";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

module {
  public type ListOptions = {
    filter : {
      id : ?[Principal]; // filter based on id
      username : ?Text; // filter based on username
      displayName : ?Text; // filter based on displayName
      avatarUrl : ?Bool; // filter based on avatar
      inviter : ?[Principal];
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
    createdAt : Time.Time;
    updatedAt : Time.Time;
    inviter : ?Principal;
  };

  let ProfileSchema : ZenDB.Types.Schema = #Record([
    ("id", #Principal),
    ("username", #Text),
    ("displayName", #Option(#Text)),
    ("avatarUrl", #Option(#Text)),
    ("createdAt", #Int),
    ("updatedAt", #Int),
    ("inviter", #Option(#Principal)),
  ]);

  public type CreateProfileArgs = {
    username : Text;
    displayName : ?Text;
    avatarUrl : ?Text;
    inviter : ?Principal;
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
    #Unique(["id"]), // id must be unique
    #Unique(["username"]), // Username must be unique
    #Field("username", [#MinSize(2), #MaxSize(20)]), // username must be between 2 and 20 characters
    #Field("displayName", [#MaxSize(100)]), // displayName must be <= 100 characters
  ];

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

    switch (options.filter.inviter) {
      case (?v) {
        let values = Array.map<Principal, ZenDB.Types.Candid>(v, func id = #Option(#Principal(id)));
        ignore dbQuery.Where("inviter", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.createdAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("createdAt", #between(#Int(min), #Int(max)));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("createdAt", #gte(#Int(min)));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("createdAt", #lte(#Int(max)));
      case _ {};
    };

    switch (List.first(List.fromArray<(Text, ZenDB.Types.SortDirection)>(options.sort))) {
      case (?(field, direction)) ignore dbQuery.Sort(field, direction);
      case null {};
    };

    dbQuery;
  };

  public class Profiles(db : ZenDB.Database, deleteAsset : (Text) -> ()) {
    let #ok(profilesCollection) = db.createCollection<Profile>("profiles", ProfileSchema, candifyProfiles, ?{ schemaConstraints }) else Runtime.unreachable();

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

    public func create(caller : Principal, args : CreateProfileArgs) : ZenDB.Types.Result<Nat, Text> {
      let now = Time.now();
      let profile : Profile = {
        args and { id = caller; createdAt = now; updatedAt = now }
      };
      profilesCollection.insert(profile);
    };

    public func update(caller : Principal, args : UpdateProfileArgs) : ZenDB.Types.Result<(), Text> {
      let callerQuery = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);

      // Get prevAvatarUrl before update
      let prevAvatarUrl : ?Text = switch (profilesCollection.search(callerQuery)) {
        case (#ok(results)) {
          switch (List.fromArray<ZenDB.Types.WrapId<Profile>>(results) |> List.first(_)) {
            case (?(_, profile)) profile.avatarUrl;
            case null return #err("Profile not found");
          };
        };
        case (#err message) return #err(message);
      };

      let #ok(updated) = profilesCollection.update(
        callerQuery,
        [
          ("displayName", Option.map<Text, ZenDB.Types.Candid>(args.displayName, func(v : Text) : ZenDB.Types.Candid = #Text(v)) |> Option.get(_, #Null) |> #Option _),
          ("avatarUrl", Option.map<Text, ZenDB.Types.Candid>(args.avatarUrl, func(v : Text) : ZenDB.Types.Candid = #Text(v)) |> Option.get(_, #Null) |> #Option _),
          ("updatedAt", #Int(Time.now())),
        ],
      ) else return #err("Failed to update profile");

      if (updated == 0) {
        return #err("Profile not found");
      };

      deleteIfDifferent(Map.take(pendingAvatars, Principal.compare, caller), args.avatarUrl);
      deleteIfDifferent(prevAvatarUrl, args.avatarUrl);

      #ok();
    };

    public func get(caller : Principal) : ?Profile {
      let callerQuery = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);

      let #ok(profiles) = profilesCollection.search(callerQuery) else return null;
      let ?(_, profile) = List.fromArray<ZenDB.Types.WrapId<Profile>>(profiles) |> List.first(_) else return null;
      ?profile;
    };

    public func delete(caller : Principal) : ZenDB.Types.Result<Profile, Text> {
      let callerQuery = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);

      let #ok(deletedProfiles) = profilesCollection.delete(callerQuery) else return #err("Failed to delete profile");
      let ?(_, profile) = List.fromArray<ZenDB.Types.WrapId<Profile>>(deletedProfiles) |> List.first(_) else return #err("Profile not found");

      deleteIfDifferent(profile.avatarUrl, null); // always delete saved avatar
      deleteIfDifferent(Map.take(pendingAvatars, Principal.compare, caller), profile.avatarUrl);

      #ok(profile);
    };

    public func usernameExists(username : Text) : Bool {
      let profilesByUsernameQuery = ZenDB.QueryBuilder().Where("username", #eq(#Text(username)));
      let #ok(count) = profilesCollection.count(profilesByUsernameQuery) else return false;
      count > 0;
    };

    public func list(options : ListOptions) : GetProfilesResponse {
      let dbQuery = convertListOptionsToDBQuery(options);

      var data : [Profile] = [];
      var total : ?Nat = null;

      let instructions = IC.countInstructions(
        func() {
          data := switch (profilesCollection.search(dbQuery)) {
            case (#ok(result)) Array.map<(Nat, Profile), Profile>(result, func(_, profile) = profile);
            case (#err message) Runtime.trap("list failed: " # message);
          };

          if (options.count) {
            let #ok(count) = profilesCollection.count(dbQuery) else Runtime.trap("profilesCollection.count failed");
            total := ?count;
          };
        }
      );

      { data; total; instructions = Nat64.toNat(instructions) };
    };
  };
};
