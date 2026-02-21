import Set "mo:core/Set";
import Vector "mo:vector";

import Types "../../Types";

module {
  public type StableStore = {
    processedPayments : Set.Set<Text>;
    distributions : Vector.Vector<Types.DistributionRecord>;
    var nextDistributionId : Nat;
    admin : Principal;
  };
};
