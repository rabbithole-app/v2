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
  public type StorageCreationRecord = Types.StorageCreationRecord;
  public type CreationStatus = Types.CreationStatus;
  public type StatusEvent = Types.StatusEvent;
  public type ListCreationsOptions = Types.ListCreationsOptions;
  public type GetCreationsResponse = Types.GetCreationsResponse;

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

  let ProgressSchema : ZenDB.Types.Schema = #Record([
    ("processed", #Nat),
    ("total", #Nat),
  ]);

  let PaymentPhaseSchema : ZenDB.Types.Schema = #Variant([
    ("Starting", #Null),
    ("FetchingRates", #Null),
    ("CheckingBalances", #Null),
    ("Charging", #Record([
      ("tokenId", TokenIdSchema),
      ("amount", #Nat),
    ])),
    ("RecordingLicense", #Null),
    ("Activating", #Null),
    ("Queueing", #Null),
  ]);

  let CreationStatusSchema : ZenDB.Types.Schema = #Variant([
    ("ProcessingPayment", PaymentPhaseSchema),
    ("Pending", #Null),
    ("CheckingBalance", #Null),
    ("TransferringICP", #Record([("amount", #Nat)])),
    ("NotifyingCMC", #Record([("blockIndex", #Nat)])),
    ("CanisterCreated", #Record([("canisterId", #Principal)])),
    ("InstallingWasm", #Record([
      ("canisterId", #Principal),
      ("progress", ProgressSchema),
    ])),
    ("UploadingFrontend", #Record([
      ("canisterId", #Principal),
      ("progress", ProgressSchema),
    ])),
    ("RevokingInstallerPermission", #Record([("canisterId", #Principal)])),
    ("UpdatingControllers", #Record([("canisterId", #Principal)])),
    ("UpgradingWasm", #Record([
      ("canisterId", #Principal),
      ("progress", ProgressSchema),
    ])),
    ("UpgradingFrontend", #Record([
      ("canisterId", #Principal),
      ("progress", ProgressSchema),
    ])),
    ("Completed", #Record([("canisterId", #Principal)])),
    ("Failed", #Text),
  ]);

  let StatusEventSchema : ZenDB.Types.Schema = #Record([
    ("status", CreationStatusSchema),
    ("timestamp", #Int),
  ]);

  let EnvPairSchema : ZenDB.Types.Schema = #Record([
    ("name", #Text),
    ("value", #Text),
  ]);

  let AmbassadorPayoutStatusSchema : ZenDB.Types.Schema = #Variant([
    ("skipped", #Null),
    ("pending", #Null),
    ("completed", #Null),
    ("failed", #Text),
  ]);

  let CreationSchema : ZenDB.Types.Schema = #Record([
    ("id", #Nat),
    ("owner", #Principal),
    ("releaseTag", #Text),
    ("initArg", #Blob),
    ("envPairs", #Option(#Array(EnvPairSchema))),
    ("createdAt", #Int),
    ("canisterId", #Option(#Principal)),
    ("wasmHash", #Option(#Blob)),
    ("frontendHash", #Option(#Blob)),
    ("installedReleaseTag", #Option(#Text)),
    ("status", CreationStatusSchema),
    ("statusTag", #Text),
    ("completedAt", #Option(#Int)),
    ("licensePaymentId", #Option(#Text)),
    ("isUpgrade", #Bool),
    ("upgradeIncludesFrontend", #Bool),
    ("lastUpgradeError", #Option(#Text)),
    ("events", #Array(StatusEventSchema)),
    ("ambassadorPayoutStatus", AmbassadorPayoutStatusSchema),
    ("ambassadorPayoutStatusTag", #Text),
    ("subnetId", #Option(#Principal)),
  ]);

  let candifyCreations : ZenDB.Types.Candify<StorageCreationRecord> = {
    from_blob = func(blob : Blob) : ?StorageCreationRecord = from_candid (blob);
    to_blob = func(c : StorageCreationRecord) : Blob = to_candid (c);
  };

  let schemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["id"]),
  ];

  func convertListOptionsToDBQuery(options : ListCreationsOptions) : ZenDB.QueryBuilder {
    let dbQuery = ZenDB.QueryBuilder();
    ignore dbQuery.Limit(options.pagination.limit);
    ignore dbQuery.Skip(options.pagination.offset);

    switch (options.filter.id) {
      case (?v) {
        let values = Array.map<Nat, ZenDB.Types.Candid>(v, func id = #Nat(id));
        ignore dbQuery.Where("id", #anyOf(values));
      };
      case null {};
    };

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

    switch (options.filter.statusTag) {
      case (?v) {
        let values = Array.map<Text, ZenDB.Types.Candid>(v, func t = #Text(t));
        ignore dbQuery.Where("statusTag", #anyOf(values));
      };
      case null {};
    };

    switch (options.filter.releaseTag) {
      case (?v) ignore dbQuery.Where("releaseTag", #eq(#Text(v)));
      case null {};
    };

    switch (options.filter.hasCanister) {
      case (?true) ignore dbQuery.Where("canisterId", #not_(#eq(#Null)));
      case (?false) ignore dbQuery.Where("canisterId", #eq(#Null));
      case null {};
    };

    switch (options.filter.hasLicense) {
      case (?true) ignore dbQuery.Where("licensePaymentId", #not_(#eq(#Null)));
      case (?false) ignore dbQuery.Where("licensePaymentId", #eq(#Null));
      case null {};
    };

    switch (options.filter.createdAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("createdAt", #between(#Int(min), #Int(max)));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("createdAt", #gte(#Int(min)));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("createdAt", #lte(#Int(max)));
      case _ {};
    };

    switch (options.filter.completedAt) {
      case (?{ min = ?min; max = ?max }) ignore dbQuery.Where("completedAt", #between(#Option(#Int(min)), #Option(#Int(max))));
      case (?{ min = ?min; max = null }) ignore dbQuery.Where("completedAt", #gte(#Option(#Int(min))));
      case (?{ min = null; max = ?max }) ignore dbQuery.Where("completedAt", #lte(#Option(#Int(max))));
      case _ {};
    };

    switch (options.filter.ambassadorPayoutStatus) {
      case (?v) {
        let values = Array.map<Text, ZenDB.Types.Candid>(v, func t = #Text(t));
        ignore dbQuery.Where("ambassadorPayoutStatusTag", #anyOf(values));
      };
      case null {};
    };

    switch (List.first(List.fromArray<(Text, ZenDB.Types.SortDirection)>(options.sort))) {
      case (?(field, direction)) ignore dbQuery.SortBy(field, direction);
      case null {};
    };

    dbQuery;
  };

  /// ZenDB-backed storage for creation records. Single source of truth —
  /// every mutation goes through `mutate` or `appendEvent`, which fetch the
  /// current row, apply the change, and upsert the result atomically within
  /// a single message (no awaits inside).
  ///
  /// Class handle is transient; backing rows persist across upgrades via
  /// the stable ZenDB store (`db`).
  public class Creations(db : ZenDB.Database) {
    let #ok(collection) = db.createCollection<StorageCreationRecord>(
      "creations",
      CreationSchema,
      candifyCreations,
      ?{ schema_constraints = schemaConstraints },
    ) else Runtime.unreachable();

    /// Insert a fresh creation record. Caller must provide a record whose
    /// `id` is not yet in the collection — duplicates fail the uniqueness
    /// constraint. Use `mutate` for in-place updates.
    public func add(record : StorageCreationRecord) {
      ignore collection.insert(record);
    };

    /// Insert-or-replace a creation record. Kept for edge cases where the
    /// caller already holds a full snapshot (e.g. tests); orchestrator code
    /// should prefer `mutate` for atomic read-modify-write.
    public func upsert(record : StorageCreationRecord) {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Nat(record.id))).Limit(1);
      switch (collection.search(q)) {
        case (#ok({ documents })) {
          if (documents.size() == 0) {
            ignore collection.insert(record);
          } else {
            let (docId, _, _) = documents[0];
            ignore collection.replace(docId, record);
          };
        };
        case (#err _) {};
      };
    };

    /// Delete a creation row. Called by `deleteStorage` / `removeRefundedCreation`.
    public func remove(creationId : Nat) {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Nat(creationId)));
      ignore collection.delete(q);
    };

    /// Atomic read-modify-write. Fetches the record, applies `fn`, writes
    /// the result back. Returns the new record, or null if the id doesn't
    /// exist. Runs within a single message — no awaits between fetch and
    /// write, so concurrent orchestrator ticks see a consistent view.
    public func mutate(creationId : Nat, fn : (StorageCreationRecord) -> StorageCreationRecord) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Nat(creationId))).Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (docId, record, _) = documents[0];
      let updated = fn(record);
      ignore collection.replace(docId, updated);
      ?updated;
    };

    /// Status transition with tag-based deduplication. Always updates
    /// `status` + `statusTag`; appends to `events` only when the tag
    /// changes (so a 100-chunk install yields one timeline entry, not
    /// 100). Returns the updated record or null if the creation doesn't
    /// exist.
    public func appendEvent(creationId : Nat, status : Types.CreationStatus) : ?StorageCreationRecord {
      mutate(
        creationId,
        func(r : StorageCreationRecord) : StorageCreationRecord {
          let newTag = Types.tagOfCreationStatus(status);
          let events = if (r.statusTag != newTag) {
            Array.concat<StatusEvent>(
              r.events,
              [{ status; timestamp = Time.now() }],
            );
          } else {
            r.events;
          };
          { r with status; statusTag = newTag; events };
        },
      );
    };

    /// Get a single creation by id. Returns null if the record doesn't exist.
    public func get(creationId : Nat) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder().Where("id", #eq(#Nat(creationId))).Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, record, _) = documents[0];
      ?record;
    };

    /// All creations owned by `owner`. Ordered by createdAt ASC.
    public func listByOwner(owner : Principal) : [StorageCreationRecord] {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .SortBy("createdAt", #Ascending);
      let #ok({ documents }) = collection.search(q) else return [];
      Array.map<(ZenDB.Types.DocumentId, StorageCreationRecord, [ZenDB.Types.TextMatch]), StorageCreationRecord>(
        documents,
        func(_, record, _) = record,
      );
    };

    /// Find a creation by its bound canisterId. Used by `findOwnerByCanister`
    /// and by sibling mixins (Subscriptions) to resolve canister → owner.
    public func findByCanister(canisterId : Principal) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder()
        .Where("canisterId", #eq(#Option(#Principal(canisterId))))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, record, _) = documents[0];
      ?record;
    };

    /// First creation owned by `owner` that isn't in a terminal state
    /// (Completed / Failed). Used to enforce "one in-flight per owner".
    public func findActiveByOwner(owner : Principal) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .Where("statusTag", #not_(#anyOf([#Text("Completed"), #Text("Failed")])))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, record, _) = documents[0];
      ?record;
    };

    /// True if any creation record already holds this canisterId. Used to
    /// reject duplicate `#Existing` targets and `addStorage` registrations.
    public func isCanisterUsed(canisterId : Principal) : Bool {
      Option.isSome(findByCanister(canisterId));
    };

    /// Find a creation by canisterId with ownership filter in a single
    /// query — used by `upgradeStorage` to both resolve and authorize.
    public func findByCanisterAndOwner(canisterId : Principal, owner : Principal) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder()
        .Where("canisterId", #eq(#Option(#Principal(canisterId))))
        .Where("owner", #eq(#Principal(owner)))
        .Limit(1);
      let #ok({ documents }) = collection.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, record, _) = documents[0];
      ?record;
    };

    /// Resolve a canister back to its owner principal. Used by sibling
    /// mixins (Subscriptions, Balance, low-cycles callback).
    public func findOwnerByCanister(canisterId : Principal) : ?Principal {
      switch (findByCanister(canisterId)) {
        case (?r) ?r.owner;
        case null null;
      };
    };

    /// All records in the collection, ordered by id ASC. Used by
    /// `resetTransientState` on startup to sweep interrupted creations.
    public func all() : [StorageCreationRecord] {
      let q = ZenDB.QueryBuilder().SortBy("id", #Ascending);
      let #ok({ documents }) = collection.search(q) else return [];
      Array.map<(ZenDB.Types.DocumentId, StorageCreationRecord, [ZenDB.Types.TextMatch]), StorageCreationRecord>(
        documents,
        func(_, record, _) = record,
      );
    };

    /// Flexible query with pagination + filters. Non-admin callers are
    /// pinned to `filter.owner = [caller]` at the API layer (main.mo).
    public func list(options : ListCreationsOptions) : GetCreationsResponse {
      let dbQuery = convertListOptionsToDBQuery(options);
      var data : [StorageCreationRecord] = [];
      var total : ?Nat = null;

      let instructions = IC.countInstructions(
        func() {
          data := switch (collection.search(dbQuery)) {
            case (#ok({ documents })) {
              Array.map<(ZenDB.Types.DocumentId, StorageCreationRecord, [ZenDB.Types.TextMatch]), StorageCreationRecord>(
                documents,
                func(_, rec, _) = rec,
              );
            };
            case (#err message) Runtime.trap("Creations.list failed: " # message);
          };

          if (options.count) {
            let #ok({ count }) = collection.count(dbQuery) else Runtime.trap("Creations.count failed");
            total := ?count;
          };
        }
      );

      { data; total; instructions = Nat64.toNat(instructions) };
    };
  };
};
