import Debug "mo:core/Debug";
import Principal "mo:core/Principal";

import Users "lib";
import ZenDB "mo:zendb";

mixin(
  db : ZenDB.Database,
  resolveReferralCode : (Text) -> ?Principal,
) {
  transient let users = Users.Users(db);

  /// Resolve ambassador chain for a user. Available to other mixins (PaymentOrchestrator).
  func getAmbassadorChain(principal : Principal) : Users.AmbassadorChain {
    users.getAmbassadorChain(principal);
  };

  /// Register a new user with optional referral code. Idempotent — noop if user exists.
  public shared ({ caller }) func register(referralCode : ?Text) : async () {
    assert not Principal.isAnonymous(caller);
    if (users.exists(caller)) return;

    let inviter : ?Principal = switch referralCode {
      case (?code) resolveReferralCode(code);
      case null null;
    };

    switch (users.create(caller, inviter)) {
      case (#ok _) {};
      case (#err msg) Debug.print("Failed to create user: " # msg);
    };
  };

  func hasUsedTrial(principal : Principal) : Bool {
    users.hasUsedTrial(principal);
  };

  func markTrialUsed(principal : Principal) {
    users.markTrialUsed(principal);
  };

  func userExists(principal : Principal) : Bool {
    users.exists(principal);
  };

  public query ({ caller }) func getUser() : async ?Users.User {
    assert not Principal.isAnonymous(caller);
    users.get(caller);
  };

  public query ({ caller }) func getAmbassadorChainQuery() : async Users.AmbassadorChain {
    assert not Principal.isAnonymous(caller);
    users.getAmbassadorChain(caller);
  };
};
