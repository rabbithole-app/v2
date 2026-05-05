import Array "mo:core/Array";
import IC "mo:core/InternetComputer";
import List "mo:core/List";
import Nat "mo:core/Nat";
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
  public type StorageCreationCore = Types.StorageCreationCore;
  public type StorageCreationContext = Types.StorageCreationContext;
  public type StorageCreationTimeline = Types.StorageCreationTimeline;
  public type StorageCreationDiagnostics = Types.StorageCreationDiagnostics;
  public type CreationStatus = Types.CreationStatus;
  public type StatusEvent = Types.StatusEvent;
  public type ListCreationsOptions = Types.ListCreationsOptions;
  public type GetCreationsResponse = Types.GetCreationsResponse;
  public type CreationListItem = Types.CreationListItem;

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

  let FrontendInstallDiagnosticsSchema : ZenDB.Types.Schema = #Record([
    ("totalFiles", #Nat),
    ("totalBytes", #Nat),
    ("processedFiles", #Nat),
    ("processedBytes", #Nat),
    ("uploadedFiles", #Nat),
    ("uploadedBytes", #Nat),
    ("skippedFiles", #Nat),
    ("skippedBytes", #Nat),
    ("staleDeletedFiles", #Nat),
    ("changedDeletedFiles", #Nat),
    ("batchesTotal", #Nat),
    ("batchesProcessed", #Nat),
    ("stage", #Text),
    ("startedAt", #Int),
    ("updatedAt", #Int),
    ("completedAt", #Option(#Int)),
    ("error", #Option(#Text)),
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

  let CreationCoreSchema : ZenDB.Types.Schema = #Record([
    ("id", #Nat),
    ("owner", #Principal),
    ("releaseTag", #Text),
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
    ("ambassadorPayoutStatus", AmbassadorPayoutStatusSchema),
    ("ambassadorPayoutStatusTag", #Text),
    ("subnetId", #Option(#Principal)),
  ]);

  let CreationContextSchema : ZenDB.Types.Schema = #Record([
    ("creationId", #Nat),
    ("initArg", #Blob),
    ("envPairs", #Option(#Array(EnvPairSchema))),
  ]);

  let CreationTimelineSchema : ZenDB.Types.Schema = #Record([
    ("creationId", #Nat),
    ("events", #Array(StatusEventSchema)),
  ]);

  let CreationDiagnosticsSchema : ZenDB.Types.Schema = #Record([
    ("creationId", #Nat),
    ("frontendInstallDiagnostics", #Option(FrontendInstallDiagnosticsSchema)),
  ]);

  let candifyCreationCores : ZenDB.Types.Candify<StorageCreationCore> = {
    from_blob = func(blob : Blob) : ?StorageCreationCore = from_candid (blob);
    to_blob = func(c : StorageCreationCore) : Blob = to_candid (c);
  };

  let candifyCreationContexts : ZenDB.Types.Candify<StorageCreationContext> = {
    from_blob = func(blob : Blob) : ?StorageCreationContext = from_candid (blob);
    to_blob = func(c : StorageCreationContext) : Blob = to_candid (c);
  };

  let candifyCreationTimelines : ZenDB.Types.Candify<StorageCreationTimeline> = {
    from_blob = func(blob : Blob) : ?StorageCreationTimeline = from_candid (blob);
    to_blob = func(c : StorageCreationTimeline) : Blob = to_candid (c);
  };

  let candifyCreationDiagnostics : ZenDB.Types.Candify<StorageCreationDiagnostics> = {
    from_blob = func(blob : Blob) : ?StorageCreationDiagnostics = from_candid (blob);
    to_blob = func(c : StorageCreationDiagnostics) : Blob = to_candid (c);
  };

  let coreSchemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["id"]),
  ];

  let creationIdSchemaConstraints : [ZenDB.Types.SchemaConstraint] = [
    #Unique(["creationId"]),
  ];

  let LIST_CREATIONS_LIMIT_CAP : Nat = 100;

  func convertListOptionsToDBQuery(options : ListCreationsOptions) : ZenDB.QueryBuilder {
    let dbQuery = ZenDB.QueryBuilder();
    ignore dbQuery.Limit(Nat.min(options.pagination.limit, LIST_CREATIONS_LIMIT_CAP));
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

  func coreFromRecord(record : StorageCreationRecord) : StorageCreationCore {
    {
      id = record.id;
      owner = record.owner;
      releaseTag = record.releaseTag;
      createdAt = record.createdAt;
      canisterId = record.canisterId;
      wasmHash = record.wasmHash;
      frontendHash = record.frontendHash;
      installedReleaseTag = record.installedReleaseTag;
      status = record.status;
      statusTag = record.statusTag;
      completedAt = record.completedAt;
      licensePaymentId = record.licensePaymentId;
      isUpgrade = record.isUpgrade;
      upgradeIncludesFrontend = record.upgradeIncludesFrontend;
      lastUpgradeError = record.lastUpgradeError;
      ambassadorPayoutStatus = record.ambassadorPayoutStatus;
      ambassadorPayoutStatusTag = record.ambassadorPayoutStatusTag;
      subnetId = record.subnetId;
    };
  };

  func contextFromRecord(record : StorageCreationRecord) : StorageCreationContext {
    {
      creationId = record.id;
      initArg = record.initArg;
      envPairs = record.envPairs;
    };
  };

  func timelineFromRecord(record : StorageCreationRecord) : StorageCreationTimeline {
    {
      creationId = record.id;
      events = record.events;
    };
  };

  func diagnosticsFromRecord(record : StorageCreationRecord) : StorageCreationDiagnostics {
    {
      creationId = record.id;
      frontendInstallDiagnostics = record.frontendInstallDiagnostics;
    };
  };

  func lastEventAt(events : [StatusEvent]) : ?Time.Time {
    if (events.size() == 0) return null;
    ?events[events.size() - 1].timestamp;
  };

  func assemble(
    core : StorageCreationCore,
    context : StorageCreationContext,
    timeline : StorageCreationTimeline,
    diagnostics : ?StorageCreationDiagnostics,
  ) : StorageCreationRecord {
    {
      id = core.id;
      owner = core.owner;
      releaseTag = core.releaseTag;
      initArg = context.initArg;
      envPairs = context.envPairs;
      createdAt = core.createdAt;
      canisterId = core.canisterId;
      wasmHash = core.wasmHash;
      frontendHash = core.frontendHash;
      installedReleaseTag = core.installedReleaseTag;
      status = core.status;
      statusTag = core.statusTag;
      completedAt = core.completedAt;
      licensePaymentId = core.licensePaymentId;
      isUpgrade = core.isUpgrade;
      upgradeIncludesFrontend = core.upgradeIncludesFrontend;
      lastUpgradeError = core.lastUpgradeError;
      frontendInstallDiagnostics = switch (diagnostics) {
        case (?value) value.frontendInstallDiagnostics;
        case null null;
      };
      events = timeline.events;
      ambassadorPayoutStatus = core.ambassadorPayoutStatus;
      ambassadorPayoutStatusTag = core.ambassadorPayoutStatusTag;
      subnetId = core.subnetId;
    };
  };

  func toListItem(
    core : StorageCreationCore,
    timeline : ?StorageCreationTimeline,
    diagnostics : ?StorageCreationDiagnostics,
  ) : CreationListItem {
    let events = switch (timeline) {
      case (?value) value.events;
      case null [];
    };
    {
      id = core.id;
      owner = core.owner;
      releaseTag = core.releaseTag;
      createdAt = core.createdAt;
      canisterId = core.canisterId;
      installedReleaseTag = core.installedReleaseTag;
      status = core.status;
      statusTag = core.statusTag;
      completedAt = core.completedAt;
      licensePaymentId = core.licensePaymentId;
      isUpgrade = core.isUpgrade;
      upgradeIncludesFrontend = core.upgradeIncludesFrontend;
      lastUpgradeError = core.lastUpgradeError;
      ambassadorPayoutStatusTag = core.ambassadorPayoutStatusTag;
      subnetId = core.subnetId;
      lastEventAt = lastEventAt(events);
      hasEvents = events.size() > 0;
      hasFrontendInstallDiagnostics = switch (diagnostics) {
        case (?value) Option.isSome(value.frontendInstallDiagnostics);
        case null false;
      };
    };
  };

  /// ZenDB-backed storage for creations. Core rows are the queryable source of
  /// truth; recovery payload, timeline and diagnostics live in separate
  /// collections keyed by creationId.
  public class Creations(db : ZenDB.Database) {
    let #ok(cores) = db.createCollection<StorageCreationCore>(
      "creation_cores",
      CreationCoreSchema,
      candifyCreationCores,
      ?{ schema_constraints = coreSchemaConstraints },
    ) else Runtime.unreachable();

    let #ok(contexts) = db.createCollection<StorageCreationContext>(
      "creation_contexts",
      CreationContextSchema,
      candifyCreationContexts,
      ?{ schema_constraints = creationIdSchemaConstraints },
    ) else Runtime.unreachable();

    let #ok(timelines) = db.createCollection<StorageCreationTimeline>(
      "creation_timelines",
      CreationTimelineSchema,
      candifyCreationTimelines,
      ?{ schema_constraints = creationIdSchemaConstraints },
    ) else Runtime.unreachable();

    let #ok(diagnostics) = db.createCollection<StorageCreationDiagnostics>(
      "creation_diagnostics",
      CreationDiagnosticsSchema,
      candifyCreationDiagnostics,
      ?{ schema_constraints = creationIdSchemaConstraints },
    ) else Runtime.unreachable();

    func coreQuery(creationId : Nat) : ZenDB.QueryBuilder {
      ZenDB.QueryBuilder().Where("id", #eq(#Nat(creationId))).Limit(1);
    };

    func creationIdQuery(creationId : Nat) : ZenDB.QueryBuilder {
      ZenDB.QueryBuilder().Where("creationId", #eq(#Nat(creationId))).Limit(1);
    };

    func deleteById(creationId : Nat) {
      ignore cores.delete(ZenDB.QueryBuilder().Where("id", #eq(#Nat(creationId))));
      ignore contexts.delete(ZenDB.QueryBuilder().Where("creationId", #eq(#Nat(creationId))));
      ignore timelines.delete(ZenDB.QueryBuilder().Where("creationId", #eq(#Nat(creationId))));
      ignore diagnostics.delete(ZenDB.QueryBuilder().Where("creationId", #eq(#Nat(creationId))));
    };

    func replaceRecord(record : StorageCreationRecord) {
      deleteById(record.id);
      ignore cores.insert(coreFromRecord(record));
      ignore contexts.insert(contextFromRecord(record));
      ignore timelines.insert(timelineFromRecord(record));
      ignore diagnostics.insert(diagnosticsFromRecord(record));
    };

    func findCore(creationId : Nat) : ?StorageCreationCore {
      let #ok({ documents }) = cores.search(coreQuery(creationId)) else return null;
      if (documents.size() == 0) return null;
      let (_, core, _) = documents[0];
      ?core;
    };

    func findContext(creationId : Nat) : ?StorageCreationContext {
      let #ok({ documents }) = contexts.search(creationIdQuery(creationId)) else return null;
      if (documents.size() == 0) return null;
      let (_, context, _) = documents[0];
      ?context;
    };

    func findTimeline(creationId : Nat) : StorageCreationTimeline {
      let #ok({ documents }) = timelines.search(creationIdQuery(creationId)) else {
        return { creationId; events = [] };
      };
      if (documents.size() == 0) return { creationId; events = [] };
      let (_, timeline, _) = documents[0];
      timeline;
    };

    func findDiagnostics(creationId : Nat) : ?StorageCreationDiagnostics {
      let #ok({ documents }) = diagnostics.search(creationIdQuery(creationId)) else return null;
      if (documents.size() == 0) return null;
      let (_, diagnostic, _) = documents[0];
      ?diagnostic;
    };

    func getFromCore(core : StorageCreationCore) : ?StorageCreationRecord {
      let ?context = findContext(core.id) else return null;
      ?assemble(core, context, findTimeline(core.id), findDiagnostics(core.id));
    };

    func upsertTimeline(timeline : StorageCreationTimeline) {
      ignore timelines.delete(ZenDB.QueryBuilder().Where("creationId", #eq(#Nat(timeline.creationId))));
      ignore timelines.insert(timeline);
    };

    func upsertCore(core : StorageCreationCore) {
      ignore cores.delete(ZenDB.QueryBuilder().Where("id", #eq(#Nat(core.id))));
      ignore cores.insert(core);
    };

    /// Insert a fresh creation record. Caller must provide a record whose
    /// `id` is not yet in the collection — duplicates fail the uniqueness
    /// constraint. Use `mutate` for in-place updates.
    public func add(record : StorageCreationRecord) {
      ignore cores.insert(coreFromRecord(record));
      ignore contexts.insert(contextFromRecord(record));
      ignore timelines.insert(timelineFromRecord(record));
      ignore diagnostics.insert(diagnosticsFromRecord(record));
    };

    /// Insert-or-replace a creation record. Kept for edge cases where the
    /// caller already holds a full snapshot (e.g. tests); orchestrator code
    /// should prefer `mutate` for atomic read-modify-write.
    public func upsert(record : StorageCreationRecord) {
      replaceRecord(record);
    };

    /// Delete a creation row. Called by `deleteStorage` / `removeRefundedCreation`.
    public func remove(creationId : Nat) {
      deleteById(creationId);
    };

    /// Atomic read-modify-write. Fetches the record, applies `fn`, writes
    /// the result back. Returns the new record, or null if the id doesn't
    /// exist. Runs within a single message — no awaits between fetch and
    /// write, so concurrent orchestrator ticks see a consistent view.
    public func mutate(creationId : Nat, fn : (StorageCreationRecord) -> StorageCreationRecord) : ?StorageCreationRecord {
      let ?record = get(creationId) else return null;
      let updated = fn(record);
      replaceRecord(updated);
      ?updated;
    };

    /// Status transition with tag-based deduplication. Always updates
    /// `status` + `statusTag`; appends to `events` only when the tag
    /// changes (so a 100-chunk install yields one timeline entry, not
    /// 100). Returns the updated record or null if the creation doesn't
    /// exist.
    public func appendEvent(creationId : Nat, status : Types.CreationStatus) : ?StorageCreationRecord {
      let ?core = findCore(creationId) else return null;
      let timeline = findTimeline(creationId);
      let newTag = Types.tagOfCreationStatus(status);
      let events = if (core.statusTag != newTag) {
        Array.concat<StatusEvent>(
          timeline.events,
          [{ status; timestamp = Time.now() }],
        );
      } else {
        timeline.events;
      };
      let updatedCore = { core with status; statusTag = newTag };
      upsertCore(updatedCore);
      if (core.statusTag != newTag) {
        upsertTimeline({ creationId; events });
      };
      getFromCore(updatedCore);
    };

    /// Get a single creation by id. Returns null if the record doesn't exist.
    public func get(creationId : Nat) : ?StorageCreationRecord {
      let ?core = findCore(creationId) else return null;
      getFromCore(core);
    };

    /// All creations owned by `owner`. Ordered by createdAt ASC.
    public func listByOwner(owner : Principal) : [StorageCreationRecord] {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .SortBy("createdAt", #Ascending);
      let #ok({ documents }) = cores.search(q) else return [];
      Array.map<?StorageCreationRecord, StorageCreationRecord>(
        Array.filter<?StorageCreationRecord>(
          Array.map<(ZenDB.Types.DocumentId, StorageCreationCore, [ZenDB.Types.TextMatch]), ?StorageCreationRecord>(
            documents,
            func(_, core, _) = getFromCore(core),
          ),
          func(record) = Option.isSome(record),
        ),
        func(record) = switch (record) {
          case (?value) value;
          case null Runtime.unreachable();
        },
      );
    };

    /// Find a creation by its bound canisterId. Used by `findOwnerByCanister`
    /// and by sibling mixins (Subscriptions) to resolve canister → owner.
    public func findByCanister(canisterId : Principal) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder()
        .Where("canisterId", #eq(#Option(#Principal(canisterId))))
        .Limit(1);
      let #ok({ documents }) = cores.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, core, _) = documents[0];
      getFromCore(core);
    };

    /// First creation owned by `owner` that isn't in a terminal state
    /// (Completed / Failed). Used to enforce "one in-flight per owner".
    public func findActiveByOwner(owner : Principal) : ?StorageCreationRecord {
      let q = ZenDB.QueryBuilder()
        .Where("owner", #eq(#Principal(owner)))
        .Where("statusTag", #not_(#anyOf([#Text("Completed"), #Text("Failed")])))
        .Limit(1);
      let #ok({ documents }) = cores.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, core, _) = documents[0];
      getFromCore(core);
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
      let #ok({ documents }) = cores.search(q) else return null;
      if (documents.size() == 0) return null;
      let (_, core, _) = documents[0];
      getFromCore(core);
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
      let #ok({ documents }) = cores.search(q) else return [];
      Array.map<?StorageCreationRecord, StorageCreationRecord>(
        Array.filter<?StorageCreationRecord>(
          Array.map<(ZenDB.Types.DocumentId, StorageCreationCore, [ZenDB.Types.TextMatch]), ?StorageCreationRecord>(
            documents,
            func(_, core, _) = getFromCore(core),
          ),
          func(record) = Option.isSome(record),
        ),
        func(record) = switch (record) {
          case (?value) value;
          case null Runtime.unreachable();
        },
      );
    };

    /// Flexible query with pagination + filters. Non-admin callers are
    /// pinned to `filter.owner = [caller]` at the API layer (main.mo).
    public func list(options : ListCreationsOptions) : GetCreationsResponse {
      let dbQuery = convertListOptionsToDBQuery(options);
      var data : [CreationListItem] = [];
      var total : ?Nat = null;

      let instructions = IC.countInstructions(
        func() {
          data := switch (cores.search(dbQuery)) {
            case (#ok({ documents })) {
              Array.map<(ZenDB.Types.DocumentId, StorageCreationCore, [ZenDB.Types.TextMatch]), CreationListItem>(
                documents,
                func(_, core, _) = toListItem(core, ?findTimeline(core.id), findDiagnostics(core.id)),
              );
            };
            case (#err message) Runtime.trap("Creations.list failed: " # message);
          };

          if (options.count) {
            let #ok({ count }) = cores.count(dbQuery) else Runtime.trap("Creations.count failed");
            total := ?count;
          };
        }
      );

      { data; total; instructions = Nat64.toNat(instructions) };
    };
  };
};
