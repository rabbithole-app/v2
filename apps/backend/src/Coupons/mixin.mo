import Error "mo:core/Error";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

import Coupons "lib";
import Users "../Users/lib";

mixin (
  store : { db : ZenDB.Database },
  admin : { assertAdmin : (Principal) -> () },
  deps : {
    resolvePersonalReferralCode : Text -> ?Principal;
    applyInviter : (Principal, Principal) -> Users.ApplyReferralCodeResult;
    getUser : Principal -> ?Users.User;
  },
) {
  transient let coupons = Coupons.Coupons(store.db);

  /// Global default discount for newly created coupons. Snapshot semantics:
  /// changing it never affects already-issued coupons or activated discounts.
  var referralDiscountBps : Nat = Coupons.DEFAULT_DISCOUNT_BPS;

  /// Monotonic nonce feeding coupon-code generation (dedupes codes created
  /// by the same owner within one timestamp).
  var couponCodeNonce : Nat = 0;

  /// One entry per referred user, created when a coupon is activated.
  /// Lives outside ZenDB on purpose — looked up only by principal at charge
  /// time, no queries or indexes needed, and the users schema stays untouched.
  let discountStates : Map.Map<Principal, Coupons.DiscountState> = Map.empty();

  /// In-flight charge guards keyed by (principal, kind) so a license charge
  /// never blocks a concurrent Pro charge. Transient: an upgrade kills
  /// in-flight messages. Entries expire after GUARD_TTL_NS because a trap
  /// after a commit point skips the catch-side release — a stuck guard must
  /// not permanently disable the discount.
  transient let discountCharging : Map.Map<Text, Time.Time> = Map.empty();
  transient let GUARD_TTL_NS : Time.Time = 15 * 60 * 1_000_000_000;

  func guardKey(userId : Principal, kind : Coupons.DiscountKind) : Text {
    Principal.toText(userId) # (switch (kind) { case (#license) "#license"; case (#proFirstMonth) "#pro" });
  };

  // ---- Discount hooks for the payment funnel (Balance mixin) ----

  /// Claim the pending discount for a charge attempt. Returns the bps to
  /// apply, or null when no discount is applicable. Sets the in-flight
  /// guard — a concurrent same-kind charge proceeds undiscounted.
  func takeDiscount(userId : Principal, kind : Coupons.DiscountKind) : ?Nat {
    let ?state = Map.get(discountStates, Principal.compare, userId) else return null;
    let key = guardKey(userId, kind);
    switch (Map.get(discountCharging, Text.compare, key)) {
      case (?claimedAt) if (Time.now() - claimedAt < GUARD_TTL_NS) return null;
      case null {};
    };
    let used = switch (kind) {
      case (#license) state.licenseUsed;
      case (#proFirstMonth) state.proFirstMonthUsed;
    };
    if (used) return null;
    if (state.discountBps == 0 or state.discountBps > Coupons.MAX_DISCOUNT_BPS) return null;
    Map.add(discountCharging, Text.compare, key, Time.now());
    ?state.discountBps;
  };

  /// Burn the discount after a successful charge.
  func commitDiscount(userId : Principal, kind : Coupons.DiscountKind) {
    Map.remove(discountCharging, Text.compare, guardKey(userId, kind));
    let ?state = Map.get(discountStates, Principal.compare, userId) else return;
    let updated = switch (kind) {
      case (#license) ({ state with licenseUsed = true });
      case (#proFirstMonth) ({ state with proFirstMonthUsed = true });
    };
    Map.add(discountStates, Principal.compare, userId, updated);
  };

  /// Return a claimed discount after a failed charge — retry stays discounted.
  func releaseDiscount(userId : Principal, kind : Coupons.DiscountKind) {
    Map.remove(discountCharging, Text.compare, guardKey(userId, kind));
  };

  /// Un-burn a committed discount when the underlying payment is refunded
  /// (failed storage creation): the user never received what the discount
  /// paid for, so the retry must stay discounted.
  func restoreDiscount(userId : Principal, kind : Coupons.DiscountKind) {
    let ?state = Map.get(discountStates, Principal.compare, userId) else return;
    let updated = switch (kind) {
      case (#license) ({ state with licenseUsed = false });
      case (#proFirstMonth) ({ state with proFirstMonthUsed = false });
    };
    Map.add(discountStates, Principal.compare, userId, updated);
  };

  // ---- Referral code / coupon activation ----

  func mapUsersResult(result : Users.ApplyReferralCodeResult) : Coupons.ApplyReferralCodeResult {
    switch (result) {
      case (#ok) #ok;
      case (#alreadyApplied) #alreadyApplied;
      case (#userNotFound) #userNotFound;
      case (#referralCodeNotFound) #referralCodeNotFound;
      case (#selfReferral) #selfReferral;
      case (#storageError(msg)) #storageError(msg);
    };
  };

  /// Coupon activation rules:
  ///   inviter == null          → bind inviter + grant discount
  ///   inviter == coupon.owner  → grant discount only (rescues users who
  ///                              registered through a personal-code link)
  ///   inviter != coupon.owner  → reject
  func redeemCoupon(caller : Principal, docId : ZenDB.Types.DocumentId, coupon : Coupons.Coupon) : Coupons.ApplyReferralCodeResult {
    if (Principal.equal(coupon.owner, caller)) return #selfReferral;
    if (coupon.revoked) return #couponRevoked;
    let now = Time.now();
    if (Coupons.isExpired(coupon, now)) return #couponExpired;
    if (Coupons.isExhausted(coupon)) return #couponExhausted;

    let ?user = deps.getUser(caller) else return #userNotFound;
    if (Map.containsKey(discountStates, Principal.compare, caller)) return #discountAlreadyApplied;

    switch (user.inviter) {
      case null {};
      case (?inviter) {
        if (not Principal.equal(inviter, coupon.owner)) return #alreadyApplied;
      };
    };

    // Mutation order: fallible steps first (counter, then inviter binding),
    // the infallible discount grant last — a failure part-way must never
    // leave the user with a granted discount behind an error result. A
    // counter bumped for a binding that then fails only reduces the coupon's
    // remaining capacity, which errs on the owner-safe side.
    switch (coupons.replace(docId, { coupon with redeemedCount = coupon.redeemedCount + 1 })) {
      case (#ok _) {};
      case (#err msg) return #storageError(msg);
    };

    if (user.inviter == null) {
      switch (deps.applyInviter(caller, coupon.owner)) {
        case (#ok) {};
        case (other) return mapUsersResult(other);
      };
    };

    Map.add(
      discountStates,
      Principal.compare,
      caller,
      {
        discountBps = coupon.discountBps;
        couponCode = coupon.code;
        appliedAt = now;
        licenseUsed = false;
        proFirstMonthUsed = false;
      },
    );
    #ok;
  };

  /// Accepts both coupon codes and personal referral codes (shared
  /// namespace, coupons resolve first). Personal codes bind the inviter
  /// without any discount.
  public shared ({ caller }) func applyReferralCode(referralCode : Text) : async Coupons.ApplyReferralCodeResult {
    assert not Principal.isAnonymous(caller);
    switch (coupons.findByCode(referralCode)) {
      case (?(docId, coupon)) redeemCoupon(caller, docId, coupon);
      case null {
        let ?inviter = deps.resolvePersonalReferralCode(referralCode) else return #referralCodeNotFound;
        mapUsersResult(deps.applyInviter(caller, inviter));
      };
    };
  };

  public query ({ caller }) func getMyDiscountState() : async ?Coupons.DiscountState {
    assert not Principal.isAnonymous(caller);
    Map.get(discountStates, Principal.compare, caller);
  };

  // ---- Coupon management ----

  public shared ({ caller }) func createCoupon(args : Coupons.CreateCouponArgs) : async ZenDB.Types.Result<Coupons.Coupon, Coupons.CreateCouponError> {
    assert not Principal.isAnonymous(caller);
    if (deps.getUser(caller) == null) return #err(#userNotFound);

    let now = Time.now();
    switch (args.expiresAt) {
      case (?expiresAt) if (expiresAt <= now) return #err(#invalidExpiry);
      case null {};
    };
    switch (args.maxRedemptions) {
      case (?0) return #err(#invalidMaxRedemptions);
      case _ {};
    };
    let trimmedNote : ?Text = switch (args.note) {
      case (?value) {
        let trimmed = Text.trim(value, #char ' ');
        if (trimmed.size() > Coupons.MAX_NOTE_LENGTH) return #err(#invalidNote);
        if (trimmed == "") null else ?trimmed;
      };
      case null null;
    };
    if (coupons.countActiveByOwner(caller, now) >= Coupons.MAX_ACTIVE_COUPONS) {
      return #err(#tooManyActiveCoupons({ limit = Coupons.MAX_ACTIVE_COUPONS }));
    };

    // Coupons and personal referral codes share one namespace — the code
    // must be free in both tables. Retry with a fresh nonce on collision.
    var attempts = 0;
    while (attempts < 5) {
      couponCodeNonce += 1;
      let code = Coupons.generateCode(caller, couponCodeNonce, now);
      let taken = coupons.findByCode(code) != null or deps.resolvePersonalReferralCode(code) != null;
      if (not taken) {
        let coupon : Coupons.Coupon = {
          code;
          owner = caller;
          ownerText = Principal.toText(caller);
          discountBps = referralDiscountBps;
          maxRedemptions = args.maxRedemptions;
          redeemedCount = 0;
          expiresAt = args.expiresAt;
          revoked = false;
          createdAt = now;
          note = trimmedNote;
        };
        switch (coupons.insert(coupon)) {
          case (#ok _) return #ok(coupon);
          case (#err msg) return #err(#storageError(msg));
        };
      };
      attempts += 1;
    };
    #err(#storageError("failed to generate a unique coupon code"));
  };

  public query ({ caller }) func getMyCoupons() : async [Coupons.Coupon] {
    assert not Principal.isAnonymous(caller);
    coupons.listByOwner(caller);
  };

  public shared ({ caller }) func revokeCoupon(code : Text) : async ZenDB.Types.Result<(), Coupons.RevokeCouponError> {
    assert not Principal.isAnonymous(caller);
    let ?(docId, coupon) = coupons.findByCode(code) else return #err(#couponNotFound);
    if (not Principal.equal(coupon.owner, caller)) return #err(#notOwner);
    if (coupon.revoked) return #ok(());
    switch (coupons.replace(docId, { coupon with revoked = true })) {
      case (#ok _) #ok(());
      case (#err msg) #err(#storageError(msg));
    };
  };

  /// Deleting is allowed only for inactive coupons (revoked, expired, or
  /// exhausted) — an active coupon must be revoked first. Safe for history:
  /// attribution lives on the user record and granted discounts snapshot
  /// their bps into DiscountState.
  public shared ({ caller }) func deleteCoupon(code : Text) : async ZenDB.Types.Result<(), Coupons.DeleteCouponError> {
    assert not Principal.isAnonymous(caller);
    let ?(docId, coupon) = coupons.findByCode(code) else return #err(#couponNotFound);
    if (not Principal.equal(coupon.owner, caller)) return #err(#notOwner);
    if (Coupons.isActive(coupon, Time.now())) return #err(#couponActive);
    switch (coupons.deleteById(docId)) {
      case (#ok _) #ok(());
      case (#err msg) #err(#storageError(msg));
    };
  };

  // ---- Admin ----

  public shared ({ caller }) func setReferralDiscountBps(bps : Nat) : async () {
    admin.assertAdmin(caller);
    if (bps > Coupons.MAX_DISCOUNT_BPS) {
      throw Error.reject("discount cannot exceed " # Nat.toText(Coupons.MAX_DISCOUNT_BPS) # " bps");
    };
    referralDiscountBps := bps;
  };

  public query func getReferralDiscountBps() : async Nat {
    referralDiscountBps;
  };
};
