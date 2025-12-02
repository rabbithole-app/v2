import Map "mo:map/Map";
import Set "mo:map/Set";
import Principal "mo:core/Principal";

module {
  public type Item = {
    canisterId : Principal;
    name : ?Text;
  };
  public type Store = Map.Map<Principal, Set.Set<Principal>>;
  let { phash } = Map;

  public func new() : Store {
    Map.new<Principal, Set.Set<Principal>>();
  };

  public func add(store : Store, caller : Principal, canisterId : Principal) {
    let set = switch (Map.get(store, phash, caller)) {
      case (?set) set;
      case (null) {
        let set = Set.new<Principal>();
        ignore Map.put(store, phash, caller, set);
        set;
      };
    };
    Set.add(set, phash, canisterId);
  };

  public func list(store : Store, caller : Principal) : [Principal] {
    switch (Map.get(store, phash, caller)) {
      case (?set) Set.toArray(set);
      case (null) [];
    };
  };

  public func delete(store : Store, caller : Principal, canisterId : Principal) {
    let ?set = Map.get(store, phash, caller) else return;
    Set.delete(set, phash, canisterId);
  };
};
