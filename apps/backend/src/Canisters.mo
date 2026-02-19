import Map "mo:map/Map";
import Principal "mo:core/Principal";
import Set "mo:core/Set";

module {
  public type Store = Map.Map<Principal, Set.Set<Principal>>;
  let { phash } = Map;

  public func new() : Store {
    Map.new<Principal, Set.Set<Principal>>();
  };

  public func add(store : Store, caller : Principal, canisterId : Principal) {
    let set = switch (Map.get(store, phash, caller)) {
      case (?set) set;
      case (null) {
        let set = Set.empty<Principal>();
        ignore Map.put(store, phash, caller, set);
        set;
      };
    };
    Set.add(set, Principal.compare, canisterId);
  };

  public func list(store : Store, caller : Principal) : [Principal] {
    switch (Map.get(store, phash, caller)) {
      case (?set) Set.toArray(set);
      case (null) [];
    };
  };

  public func delete(store : Store, caller : Principal, canisterId : Principal) {
    let ?set = Map.get(store, phash, caller) else return;
    ignore Set.delete(set, Principal.compare, canisterId);
  };
};
