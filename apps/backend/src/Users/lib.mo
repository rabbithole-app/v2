import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

module {
  public type User = {
    id : Principal;
    inviter : ?Principal;
    trialUsed : Bool;
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

    public func create(principal : Principal, inviter : ?Principal) : ZenDB.Types.Result<ZenDB.Types.DocumentId, Text> {
      let now = Time.now();
      let user : User = {
        id = principal;
        inviter;
        trialUsed = false;
        createdAt = now;
        updatedAt = now;
      };
      usersCollection.insert(user);
    };

    public func hasUsedTrial(principal : Principal) : Bool {
      let ?user = get(principal) else return false;
      user.trialUsed;
    };

    public func markTrialUsed(principal : Principal) {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Principal(principal))).Limit(1);
      let #ok({ documents }) = usersCollection.search(q) else return;
      if (documents.size() == 0) return;
      let (docId, user) = documents[0];
      ignore usersCollection.replace(docId, { user with trialUsed = true; updatedAt = Time.now() });
    };

    public func get(caller : Principal) : ?User {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Principal(caller))).Limit(1);
      let #ok({ documents }) = usersCollection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, user) = documents[0];
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
