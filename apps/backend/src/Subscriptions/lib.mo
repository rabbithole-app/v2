import Array "mo:core/Array";
import IC "mo:core/InternetComputer";
import List "mo:core/List";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

module {
  public type Plan = {
    #Free;
    #Trial;
    #License;
    #Pro;
  };

  public type Status = {
    #Active;
    #Expired;
    #Cancelled;
  };

  public type Subscription = {
    userId : Principal;
    plan : Plan;
    status : Status;
    activatedAt : Time.Time;
    expiresAt : ?Time.Time;
    autoRenew : Bool;
    trialUsedBytes : Nat;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type SubscriptionCheckResult = {
    #active : { plan : Plan };
    #trial : { remainingBytes : Nat };
    #expired;
    #free;
    #invalidWasm;
    #unknownCanister;
  };

  public type ActivateError = {
    #UserNotFound;
    #AlreadyActive;
    #TrialAlreadyUsed;
  };

  public type ListOptions = {
    filter : {
      userId : ?[Principal];
      plan : ?[Plan];
      status : ?[Status];
      expiresAt : ?{ min : ?Int; max : ?Int };
    };
    sort : [(Text, ZenDB.Types.SortDirection)];
    pagination : { limit : Nat; offset : Nat };
    count : Bool;
  };

  public type GetSubscriptionsResponse = {
    data : [Subscription];
    total : ?Nat;
    instructions : Nat;
  };

  public let TRIAL_LIMIT_BYTES : Nat = 100_000_000; // 100 MB

  let SubscriptionSchema : ZenDB.Types.Schema = #Record([
    ("userId", #Principal),
    ("plan", #Variant([("Free", #Null), ("Trial", #Null), ("License", #Null), ("Pro", #Null)])),
    ("status", #Variant([("Active", #Null), ("Expired", #Null), ("Cancelled", #Null)])),
    ("activatedAt", #Int),
    ("expiresAt", #Option(#Int)),
    ("autoRenew", #Bool),
    ("trialUsedBytes", #Nat),
    ("createdAt", #Int),
    ("updatedAt", #Int),
  ]);

  let candifySubscriptions : ZenDB.Types.Candify<Subscription> = {
    from_blob = func(blob : Blob) : ?Subscription = from_candid (blob);
    to_blob = func(c : Subscription) : Blob = to_candid (c);
  };

  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["userId"]),
  ];

  func convertListOptionsToDBQuery(options : ListOptions) : ZenDB.QueryBuilder {
    let dbQuery = ZenDB.QueryBuilder();
    ignore dbQuery.Limit(options.pagination.limit);
    ignore dbQuery.Skip(options.pagination.offset);

    switch (options.filter.userId) {
      case (?v) {
        let values = Array.map<Principal, ZenDB.Types.Candid>(v, func id = #Principal(id));
        ignore dbQuery.Where("userId", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.plan) {
      case (?v) {
        let values = Array.map<Plan, ZenDB.Types.Candid>(v, func(plan : Plan) : ZenDB.Types.Candid {
          switch plan {
            case (#Free) #Text("Free");
            case (#Trial) #Text("Trial");
            case (#License) #Text("License");
            case (#Pro) #Text("Pro");
          };
        });
        ignore dbQuery.Where("plan", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.status) {
      case (?v) {
        let values = Array.map<Status, ZenDB.Types.Candid>(v, func(status : Status) : ZenDB.Types.Candid {
          switch status {
            case (#Active) #Text("Active");
            case (#Expired) #Text("Expired");
            case (#Cancelled) #Text("Cancelled");
          };
        });
        ignore dbQuery.Where("status", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.expiresAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("expiresAt", #between(#Option(#Int(min)), #Option(#Int(max))));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("expiresAt", #gte(#Option(#Int(min))));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("expiresAt", #lte(#Option(#Int(max))));
      case _ {};
    };

    switch (List.first(List.fromArray<(Text, ZenDB.Types.SortDirection)>(options.sort))) {
      case (?(field, direction)) ignore dbQuery.Sort(field, direction);
      case null {};
    };

    dbQuery;
  };

  public class Subscriptions(db : ZenDB.Database) {
    let #ok(collection) = db.createCollection<Subscription>("subscriptions", SubscriptionSchema, candifySubscriptions, ?{ schemaConstraints }) else Runtime.unreachable();

    func findSubscription(userId : Principal) : ?(Nat, Subscription) {
      let q = ZenDB.QueryBuilder().Where("userId", #eq(#Principal(userId))).Limit(1);
      let #ok(results) = collection.search(q) else return null;
      if (results.size() == 0) return null;
      ?results[0];
    };

    public func getSubscription(userId : Principal) : ?Subscription {
      let ?(_, sub) = findSubscription(userId) else return null;
      ?withEffectiveStatus(sub);
    };

    public func activateSubscription(userId : Principal, plan : Plan, expiresAt : ?Time.Time) : Result.Result<(), ActivateError> {
      let now = Time.now();

      switch (findSubscription(userId)) {
        case (?(docId, sub)) {
          let effective = withEffectiveStatus(sub);
          if (effective.status == #Active) return #err(#AlreadyActive);
          ignore collection.replace(docId, {
            sub with
            plan;
            status = #Active;
            activatedAt = now;
            expiresAt;
            autoRenew = true;
            updatedAt = now;
          });
        };
        case null {
          let sub : Subscription = {
            userId;
            plan;
            status = #Active;
            activatedAt = now;
            expiresAt;
            autoRenew = true;
            trialUsedBytes = 0;
            createdAt = now;
            updatedAt = now;
          };
          ignore collection.insert(sub);
        };
      };

      #ok;
    };

    public func activateTrial(userId : Principal) : Result.Result<(), ActivateError> {
      switch (findSubscription(userId)) {
        case (?(_, sub)) {
          if (sub.plan == #Trial) return #err(#TrialAlreadyUsed);
          let effective = withEffectiveStatus(sub);
          if (effective.status == #Active) return #err(#AlreadyActive);
        };
        case null {};
      };

      let now = Time.now();
      let fourteenDays = 14 * 24 * 60 * 60 * 1_000_000_000; // 14 days in nanoseconds

      activateSubscription(userId, #Trial, ?(now + fourteenDays));
    };

    public func expireOverdue() : [Principal] {
      let now = Time.now();
      let q = ZenDB.QueryBuilder()
        .Where("status", #eq(#Text("Active")))
        .Where("expiresAt", #lte(#Option(#Int(now))));

      let #ok(results) = collection.search(q) else return [];

      let expired = Array.map<(Nat, Subscription), Principal>(results, func(_, sub) = sub.userId);

      for ((docId, sub) in results.vals()) {
        ignore collection.replace(docId, { sub with status = #Expired; updatedAt = now });
      };

      expired;
    };

    public func getExpiring(hoursAhead : Nat) : [(Principal, Subscription)] {
      let now = Time.now();
      let cutoff = now + hoursAhead * 60 * 60 * 1_000_000_000;
      let q = ZenDB.QueryBuilder()
        .Where("status", #eq(#Text("Active")))
        .Where("expiresAt", #lte(#Option(#Int(cutoff))))
        .Where("expiresAt", #gte(#Option(#Int(now))));

      let #ok(results) = collection.search(q) else return [];
      Array.map<(Nat, Subscription), (Principal, Subscription)>(results, func(_, sub) = (sub.userId, withEffectiveStatus(sub)));
    };

    public func recordTrialBytes(userId : Principal, bytes : Nat) {
      let q = ZenDB.QueryBuilder().Where("userId", #eq(#Principal(userId))).Limit(1);
      let #ok(results) = collection.search(q) else return;
      if (results.size() == 0) return;
      let (docId, sub) = results[0];

      ignore collection.updateById(docId, [
        ("trialUsedBytes", #Nat(sub.trialUsedBytes + bytes)),
        ("updatedAt", #Int(Time.now())),
      ]);
    };

    func withEffectiveStatus(sub : Subscription) : Subscription {
      let effectiveStatus = switch (sub.status, sub.expiresAt) {
        case (#Active, ?exp) { if (exp <= Time.now()) #Expired else #Active };
        case _ sub.status;
      };
      { sub with status = effectiveStatus };
    };

    public func list(options : ListOptions) : GetSubscriptionsResponse {
      let dbQuery = convertListOptionsToDBQuery(options);

      var data : [Subscription] = [];
      var total : ?Nat = null;

      let instructions = IC.countInstructions(
        func() {
          data := switch (collection.search(dbQuery)) {
            case (#ok(result)) Array.map<(Nat, Subscription), Subscription>(result, func(_, sub) = withEffectiveStatus(sub));
            case (#err message) Runtime.trap("list failed: " # message);
          };

          if (options.count) {
            let #ok(count) = collection.count(dbQuery) else Runtime.trap("collection.count failed");
            total := ?count;
          };
        }
      );

      { data; total; instructions = Nat64.toNat(instructions) };
    };
  };
};
