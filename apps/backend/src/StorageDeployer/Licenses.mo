import Array "mo:core/Array";
import IC "mo:core/InternetComputer";
import List "mo:core/List";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";

import TreasuryTypes "mo:treasury/Types";
import ZenDB "mo:zendb";

import Types "Types";

module {
  public type License = Types.License;
  public type PaymentReceipt = Types.PaymentReceipt;
  public type PaymentStatus = Types.PaymentStatus;
  public type ListLicensesOptions = Types.ListLicensesOptions;
  public type GetLicensesResponse = Types.GetLicensesResponse;

  let TokenIdSchema : ZenDB.Types.Schema = #Variant([
    ("ICP", #Null),
    ("ckUSDC", #Null),
    ("ckUSDT", #Null),
    ("ckETH", #Null),
    ("BaseETH", #Null),
    ("BaseUSDC", #Null),
    ("BaseUSDT", #Null),
    ("SOL", #Null),
    ("SolUSDC", #Null),
    ("SolUSDT", #Null),
  ]);

  let PaymentStatusSchema : ZenDB.Types.Schema = #Variant([
    ("completed", #Null),
    ("refunded", #Record([
      ("at", #Int),
      ("blockIndex", #Option(#Nat)),
      ("reason", #Text),
    ])),
  ]);

  let LicenseSchema : ZenDB.Types.Schema = #Record([
    ("owner", #Principal),
    ("canisterId", #Option(#Principal)),
    ("receipt", #Record([
      ("tokenId", TokenIdSchema),
      ("amount", #Nat),
      ("paymentId", #Text),
      ("paidAt", #Int),
      ("status", PaymentStatusSchema),
    ])),
    ("statusTag", #Text),
    ("createdAt", #Int),
  ]);

  let candifyLicenses : ZenDB.Types.Candify<License> = {
    from_blob = func(blob : Blob) : ?License = from_candid (blob);
    to_blob = func(c : License) : Blob = to_candid (c);
  };

  /// `paymentId` is unique globally — generated per (caller, nextPaymentId) in
  /// Balance.generatePaymentId, so two users cannot collide. Enforcing at
  /// collection level lets us catch duplicate webhook re-delivery.
  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["receipt.paymentId"]),
  ];

  func convertListOptionsToDBQuery(options : ListLicensesOptions) : ZenDB.QueryBuilder {
    let dbQuery = ZenDB.QueryBuilder();
    ignore dbQuery.Limit(options.pagination.limit);
    ignore dbQuery.Skip(options.pagination.offset);

    // Currently `id : ?[Nat]` is not usable because ZenDB's DocumentId is
    // internal and users don't have access to it — left in the options type
    // for forward compat, no-op here.
    let _ = options.filter.id;

    switch (options.filter.owner) {
      case (?v) {
        let values = Array.map<Principal, ZenDB.Types.Candid>(v, func id = #Principal(id));
        ignore dbQuery.Where("owner", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.canisterId) {
      case (?v) {
        let values = Array.map<Principal, ZenDB.Types.Candid>(v, func id = #Option(#Principal(id)));
        ignore dbQuery.Where("canisterId", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.paymentId) {
      case (?v) ignore dbQuery.Where("receipt.paymentId", #eq(#Text(v)));
      case null {};
    };

    switch (options.filter.statusTag) {
      case (?v) {
        let values = Array.map<Text, ZenDB.Types.Candid>(v, func t = #Text(t));
        ignore dbQuery.Where("statusTag", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.hasCanister) {
      case (?true) ignore dbQuery.Where("canisterId", #not_(#eq(#Null)));
      case (?false) ignore dbQuery.Where("canisterId", #eq(#Null));
      case null {};
    };

    switch (options.filter.createdAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("createdAt", #between(#Int(min), #Int(max)));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("createdAt", #gte(#Int(min)));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("createdAt", #lte(#Int(max)));
      case _ {};
    };

    switch (options.filter.paidAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("receipt.paidAt", #between(#Int(min), #Int(max)));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("receipt.paidAt", #gte(#Int(min)));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("receipt.paidAt", #lte(#Int(max)));
      case _ {};
    };

    switch (List.first(List.fromArray<(Text, ZenDB.Types.SortDirection)>(options.sort))) {
      case (?(field, direction)) ignore dbQuery.SortBy(field, direction);
      case null {};
    };

    dbQuery;
  };

  public class Licenses(db : ZenDB.Database) {
    let #ok(collection) = db.createCollection<License>(
      "licenses",
      LicenseSchema,
      candifyLicenses,
      ?{ schema_constraints = schemaConstraints },
    ) else Runtime.unreachable();

    /// Insert a new license. Returns `#DuplicatePayment` if the same paymentId
    /// was already recorded (unique constraint on `receipt.paymentId`).
    public func add(owner : Principal, receipt : PaymentReceipt) : { #ok; #err : { #DuplicatePayment } } {
      let license : License = {
        owner;
        canisterId = null;
        receipt;
        statusTag = Types.tagOfPaymentStatus(receipt.status);
        createdAt = Time.now();
      };
      switch (collection.insert(license)) {
        case (#ok _) #ok;
        case (#err _) #err(#DuplicatePayment);
      };
    };

    /// Find by paymentId for a given owner. Uses the unique index on paymentId
    /// plus an owner filter to defend against stale references.
    public func findByPaymentId(owner : Principal, paymentId : Text) : ?License {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .Where("receipt.paymentId", #eq(#Text(paymentId)))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, license, _) = documents[0];
      ?license;
    };

    /// Find the first unbound license for a user (canisterId = null).
    /// Used to bind a freshly-created canister to an existing payment.
    public func findUnbound(owner : Principal) : ?License {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .Where("canisterId", #eq(#Null))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, license, _) = documents[0];
      ?license;
    };

    /// List all licenses owned by a principal. Convenience wrapper over `list`
    /// for callers that only need per-user lookup.
    public func listByOwner(owner : Principal) : [License] {
      let q = ZenDB.QueryBuilder().Where("owner", #eq(#Principal(owner)));
      let #ok({ documents }) = collection.search(q) else return [];
      Array.map<(ZenDB.Types.DocumentId, License, [ZenDB.Types.TextMatch]), License>(
        documents,
        func(_, license, _) = license,
      );
    };

    /// Flip a license from `#completed` to `#refunded`. Returns `true` on
    /// transition, `false` if the license doesn't exist or was already
    /// refunded (idempotent no-op).
    public func markRefunded(
      owner : Principal,
      paymentId : Text,
      blockIndex : ?Nat,
      reason : Text,
    ) : Bool {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .Where("receipt.paymentId", #eq(#Text(paymentId)))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return false;
      if (documents.size() == 0) return false;
      let (docId, license, _) = documents[0];
      switch (license.receipt.status) {
        case (#completed) {
          let newReceipt : PaymentReceipt = {
            license.receipt with status = #refunded({
              at = Time.now();
              blockIndex;
              reason;
            });
          };
          let updated : License = {
            license with
            receipt = newReceipt;
            statusTag = "refunded";
          };
          ignore collection.replace(docId, updated);
          true;
        };
        case (#refunded _) false;
      };
    };

    /// Bind an unbound license to a canister after successful creation.
    /// No-op if the license is already bound or doesn't exist.
    public func bind(owner : Principal, paymentId : Text, canisterId : Principal) {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .Where("receipt.paymentId", #eq(#Text(paymentId)))
        .Where("canisterId", #eq(#Null))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return;
      if (documents.size() == 0) return;
      let (docId, license, _) = documents[0];
      ignore collection.replace(docId, { license with canisterId = ?canisterId });
    };

    /// Generic list with flexible filter. Enforces per-caller auth at the
    /// API layer (main.mo) by pinning `filter.owner` to `[caller]` for non-admins.
    public func list(options : ListLicensesOptions) : GetLicensesResponse {
      let dbQuery = convertListOptionsToDBQuery(options);
      var data : [License] = [];
      var total : ?Nat = null;

      let instructions = IC.countInstructions(
        func() {
          data := switch (collection.search(dbQuery)) {
            case (#ok({ documents })) {
              Array.map<(ZenDB.Types.DocumentId, License, [ZenDB.Types.TextMatch]), License>(
                documents,
                func(_, license, _) = license,
              );
            };
            case (#err message) Runtime.trap("Licenses.list failed: " # message);
          };

          if (options.count) {
            let #ok({ count }) = collection.count(dbQuery) else Runtime.trap("Licenses.count failed");
            total := ?count;
          };
        }
      );

      { data; total; instructions = Nat64.toNat(instructions) };
    };
  };
};
