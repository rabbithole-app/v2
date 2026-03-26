import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

module {
  public type User = {
    id : Principal;
    inviter : ?Principal;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type AmbassadorChain = {
    l1 : ?Principal;
    l2 : ?Principal;
  };

  let UserSchema : ZenDB.Types.Schema = #Record([
    ("id", #Principal),
    ("inviter", #Option(#Principal)),
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
    let #ok(usersCollection) = db.createCollection<User>("users", UserSchema, candifyUsers, ?{ schemaConstraints }) else Runtime.unreachable();

    public func create(principal : Principal, inviter : ?Principal) : ZenDB.Types.Result<Nat, Text> {
      let now = Time.now();
      let user : User = {
        id = principal;
        inviter;
        createdAt = now;
        updatedAt = now;
      };
      usersCollection.insert(user);
    };

    public func get(caller : Principal) : ?User {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);
      let #ok(users) = usersCollection.search(q) else return null;
      let ?(_, user) = List.fromArray<ZenDB.Types.WrapId<User>>(users) |> List.first(_) else return null;
      ?user;
    };

    public func exists(id : Principal) : Bool {
      get(id) != null;
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
