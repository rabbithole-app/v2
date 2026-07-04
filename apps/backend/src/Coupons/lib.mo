import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";

import ZenDB "mo:zendb";

import Utils "../Utils/lib";

module {
  /// Hard ceiling for any referral discount. Keeps discount + L1 ambassador
  /// share (15%) at or below ~35% of the list price — above that,
  /// self-referral through a second identity becomes profitable.
  public let MAX_DISCOUNT_BPS : Nat = 3_500;
  public let DEFAULT_DISCOUNT_BPS : Nat = 1_000;
  public let MAX_ACTIVE_COUPONS : Nat = 10;

  public type Coupon = {
    code : Text;
    owner : Principal;
    ownerText : Text;
    discountBps : Nat;
    maxRedemptions : ?Nat;
    redeemedCount : Nat;
    expiresAt : ?Time.Time;
    revoked : Bool;
    createdAt : Time.Time;
    /// Owner-private annotation ("for twitter", "gift for a friend").
    note : ?Text;
  };

  public let MAX_NOTE_LENGTH : Nat = 64;

  public type CreateCouponArgs = {
    maxRedemptions : ?Nat;
    expiresAt : ?Time.Time;
    note : ?Text;
  };

  public type CreateCouponError = {
    #tooManyActiveCoupons : { limit : Nat };
    #invalidExpiry;
    #invalidMaxRedemptions;
    #invalidNote;
    #userNotFound;
    #storageError : Text;
  };

  public type RevokeCouponError = {
    #couponNotFound;
    #notOwner;
    #storageError : Text;
  };

  public type DeleteCouponError = {
    #couponNotFound;
    #notOwner;
    #couponActive;
    #storageError : Text;
  };

  public type DiscountKind = { #license; #proFirstMonth };

  public type DiscountState = {
    discountBps : Nat;
    couponCode : Text;
    appliedAt : Time.Time;
    licenseUsed : Bool;
    proFirstMonthUsed : Bool;
  };

  /// Superset of Users.ApplyReferralCodeResult: same tags for the personal
  /// referral-code path plus coupon-specific rejections.
  public type ApplyReferralCodeResult = {
    #ok;
    #alreadyApplied;
    #userNotFound;
    #referralCodeNotFound;
    #selfReferral;
    #storageError : Text;
    #couponExpired;
    #couponExhausted;
    #couponRevoked;
    #discountAlreadyApplied;
  };

  public func isExpired(coupon : Coupon, now : Time.Time) : Bool {
    switch (coupon.expiresAt) {
      case (?expiresAt) expiresAt < now;
      case null false;
    };
  };

  public func isExhausted(coupon : Coupon) : Bool {
    switch (coupon.maxRedemptions) {
      case (?max) coupon.redeemedCount >= max;
      case null false;
    };
  };

  public func isActive(coupon : Coupon, now : Time.Time) : Bool {
    not coupon.revoked and not isExpired(coupon, now) and not isExhausted(coupon);
  };

  public func generateCode(owner : Principal, nonce : Nat, now : Time.Time) : Text {
    Utils.referralCode([
      Principal.toBlob(owner),
      Text.encodeUtf8(Nat.toText(nonce) # ":" # Int.toText(now)),
    ]);
  };

  let CouponSchema : ZenDB.Types.Schema = #Record([
    ("code", #Text),
    ("owner", #Principal),
    ("ownerText", #Text),
    ("discountBps", #Nat),
    ("maxRedemptions", #Option(#Nat)),
    ("redeemedCount", #Nat),
    ("expiresAt", #Option(#Int)),
    ("revoked", #Bool),
    ("createdAt", #Int),
    ("note", #Option(#Text)),
  ]);

  let candifyCoupons : ZenDB.Types.Candify<Coupon> = {
    from_blob = func(blob : Blob) : ?Coupon = from_candid (blob);
    to_blob = func(c : Coupon) : Blob = to_candid (c);
  };

  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["code"]),
  ];

  public class Coupons(db : ZenDB.Database) {
    /// ZenDB has no automatic schema migrations: createCollection rejects an
    /// existing collection whose stored schema differs. When that happens we
    /// migrate manually — read every row through candid-compatible decoding
    /// (new optional fields decode to null), drop the old collection, and
    /// refill a fresh one with the current schema.
    func rebuildWithCurrentSchema() : ZenDB.Collection<Coupon> {
      let #ok(old) = db.getCollection<Coupon>("coupons", candifyCoupons) else Runtime.trap("coupons migration: cannot open existing collection");
      let #ok({ documents }) = old.search(ZenDB.QueryBuilder()) else Runtime.trap("coupons migration: cannot read rows");
      let rows = Array.map<(ZenDB.Types.DocumentId, Coupon, [ZenDB.Types.TextMatch]), Coupon>(documents, func((_, coupon, _)) = coupon);

      let #ok(_) = db.deleteCollection("coupons") else Runtime.trap("coupons migration: cannot drop old collection");
      let #ok(fresh) = db.createCollection<Coupon>("coupons", CouponSchema, candifyCoupons, ?{ schema_constraints = schemaConstraints }) else Runtime.trap("coupons migration: cannot recreate collection");
      for (row in rows.vals()) {
        switch (fresh.insert(row)) {
          case (#ok _) {};
          case (#err msg) Runtime.trap("coupons migration: cannot restore row '" # row.code # "': " # msg);
        };
      };
      fresh;
    };

    let collection = switch (db.createCollection<Coupon>("coupons", CouponSchema, candifyCoupons, ?{ schema_constraints = schemaConstraints })) {
      case (#ok(value)) value;
      case (#err _) rebuildWithCurrentSchema();
    };

    switch (collection.getIndex("coupons_owner_idx")) {
      case (?_) {};
      case null {
        switch (collection.createIndex("coupons_owner_idx", [("ownerText", #Ascending)], null)) {
          case (#ok _) {};
          case (#err message) Runtime.trap("Failed to create coupons index 'coupons_owner_idx': " # message);
        };
      };
    };

    public func findByCode(code : Text) : ?(ZenDB.Types.DocumentId, Coupon) {
      let q = ZenDB.QueryBuilder().Where("code", #eq(#Text(code))).Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (docId, coupon, _) = documents[0];
      ?(docId, coupon);
    };

    public func listByOwner(owner : Principal) : [Coupon] {
      let q = ZenDB.QueryBuilder().Where("ownerText", #eq(#Text(Principal.toText(owner))));
      let #ok({ documents }) = collection.search(q) else return [];
      Array.map<(ZenDB.Types.DocumentId, Coupon, [ZenDB.Types.TextMatch]), Coupon>(documents, func((_, coupon, _)) = coupon);
    };

    public func countActiveByOwner(owner : Principal, now : Time.Time) : Nat {
      var count = 0;
      for (coupon in listByOwner(owner).vals()) {
        if (isActive(coupon, now)) count += 1;
      };
      count;
    };

    public func insert(coupon : Coupon) : ZenDB.Types.Result<(), Text> {
      switch (collection.insert(coupon)) {
        case (#ok _) #ok(());
        case (#err msg) #err(msg);
      };
    };

    public func replace(docId : ZenDB.Types.DocumentId, coupon : Coupon) : ZenDB.Types.Result<(), Text> {
      switch (collection.replace(docId, coupon)) {
        case (#ok _) #ok(());
        case (#err msg) #err(msg);
      };
    };

    public func deleteById(docId : ZenDB.Types.DocumentId) : ZenDB.Types.Result<(), Text> {
      switch (collection.deleteById(docId)) {
        case (#ok _) #ok(());
        case (#err msg) #err(msg);
      };
    };
  };
};
