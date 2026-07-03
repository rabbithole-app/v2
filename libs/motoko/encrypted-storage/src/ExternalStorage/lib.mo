import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";

import ICCall "mo:ic/Call";
import Map "mo:core/Map";
import Vector "mo:vector";

import Layout "Layout";
import S3SigV4 "S3SigV4";
import T "Types";

module {
  public type Store = T.Store;

  // Response headers count toward max_response_bytes; S3 error bodies are small
  // and success never depends on the body (HEAD status is the oracle).
  let HTTP_MAX_RESPONSE_BYTES : Nat64 = 4096;
  let OUTCALL_URL_EXPIRES_SECONDS : Nat = 300;
  let NANOS_PER_SECOND : Int = 1_000_000_000;
  let RETRY_BASE_DELAY_NANOS : Int = 30_000_000_000; // 30s
  let RETRY_MAX_DELAY_NANOS : Int = 21_600_000_000_000; // 6h
  let LEASE_DURATION_NANOS : Int = 120_000_000_000; // 120s
  let DONE_TASK_RETENTION_NANOS : Int = 86_400_000_000_000; // 24h
  let CANCELLED_TASK_RETENTION_NANOS : Int = 600_000_000_000; // 10min
  let DELETED_REPLICA_RETENTION_NANOS : Int = 86_400_000_000_000; // 24h
  let UPLOAD_SESSION_MARGIN_NANOS : Int = 900_000_000_000; // 15min

  public func new() : Store {
    {
      var activeTargetId = null;
      var nextTargetSequence = 0;
      var nextCredentialSequence = 0;
      var nextDeleteTaskId = 0;
      targets = Map.empty<T.TargetId, T.Target>();
      credentials = Map.empty<T.CredentialId, T.Credential>();
      replicas = Map.empty<Text, T.BlobReplica>();
      deleteTasks = Map.empty<Nat, T.DeleteTask>();
      uploadSessions = Map.empty<Text, T.UploadSession>();
    };
  };

  public func targetView(store : Store, target : T.Target) : T.TargetView {
    let hasCredential = switch (target.credentialId) {
      case (?credentialId) switch (Map.get(store.credentials, Text.compare, credentialId)) {
        case (?credential) credential.status != #Removed;
        case null false;
      };
      case null false;
    };

    {
      id = target.id;
      version = target.version;
      displayName = target.displayName;
      kind = target.kind;
      layoutVersion = target.layoutVersion;
      readMode = target.readMode;
      writeMode = target.writeMode;
      status = target.status;
      hasCredential;
      createdAt = target.createdAt;
      updatedAt = target.updatedAt;
      lastValidatedAt = target.lastValidatedAt;
    };
  };

  public func listTargets(store : Store) : [T.TargetView] {
    Iter.map<T.Target, T.TargetView>(Map.values(store.targets), func(target) = targetView(store, target))
    |> Iter.toArray(_);
  };

  func deleteTaskView(task : T.DeleteTask) : T.DeleteTaskView {
    {
      id = task.id;
      targetId = task.targetId;
      rootHashHex = task.rootHashHex;
      replicaId = task.replicaId;
      keys = task.keys;
      attempts = task.attempts;
      status = task.status;
      nextAttemptAt = task.nextAttemptAt;
      lastError = task.lastError;
      createdAt = task.createdAt;
      updatedAt = task.updatedAt;
    };
  };

  public func listBlobReplicas(store : Store) : [T.BlobReplica] {
    Iter.toArray(Map.values(store.replicas));
  };

  public func listDeleteTasks(store : Store) : [T.DeleteTaskView] {
    Iter.map<T.DeleteTask, T.DeleteTaskView>(Map.values(store.deleteTasks), deleteTaskView)
    |> Iter.toArray(_);
  };

  public func getTarget(store : Store, targetId : T.TargetId) : ?T.Target {
    Map.get(store.targets, Text.compare, targetId);
  };

  public func getActiveTarget(store : Store) : ?T.Target {
    switch (store.activeTargetId) {
      case (?targetId) getTarget(store, targetId);
      case null null;
    };
  };

  func targetHasActiveCredential(store : Store, target : T.Target) : Bool {
    switch (target.credentialId) {
      case (?credentialId) switch (Map.get(store.credentials, Text.compare, credentialId)) {
        case (?credential) credential.status == #Active;
        case null false;
      };
      case null false;
    };
  };

  /// Picks the newest usable target (Active status + active credential) as the
  /// new active pointer, or clears it when none remain. Used after the active
  /// target is disabled or disconnected so the vault keeps writing to another
  /// working bucket instead of stalling.
  public func promoteNextActiveTarget(store : Store) : ?T.TargetId {
    var best : ?T.Target = null;
    for (target in Map.values(store.targets)) {
      if (target.status == #Active and targetHasActiveCredential(store, target)) {
        best := switch (best) {
          case (?current) if (target.createdAt > current.createdAt) ?target else ?current;
          case null ?target;
        };
      };
    };
    switch (best) {
      case (?target) { store.activeTargetId := ?target.id; ?target.id };
      case null { store.activeTargetId := null; null };
    };
  };

  func nextTargetId(store : Store) : T.TargetId {
    let id = "external-target-" # Nat.toText(store.nextTargetSequence);
    store.nextTargetSequence += 1;
    id;
  };

  func nextCredentialId(store : Store) : T.CredentialId {
    let id = "external-credential-" # Nat.toText(store.nextCredentialSequence);
    store.nextCredentialSequence += 1;
    id;
  };

  func validateTextField(name : Text, value : Text) : Result.Result<(), Text> {
    if (Text.size(Text.trim(value, #char ' ')) == 0) {
      return #err(name # " is required");
    };
    #ok;
  };

  func validateBucket(bucket : Text) : Result.Result<(), Text> {
    switch (validateTextField("bucket", bucket)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    if (Text.contains(bucket, #char '/')) {
      return #err("bucket must not contain '/'");
    };
    #ok;
  };

  func validateEndpoint(endpoint : Text) : Result.Result<(), Text> {
    switch (validateTextField("endpoint", endpoint)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    if (not Text.startsWith(endpoint, #text "https://")) {
      return #err("endpoint must use https://");
    };
    let ?withoutScheme = Text.stripStart(Text.trim(endpoint, #char ' '), #text "https://") else {
      return #err("endpoint must use https://");
    };
    if (Text.contains(withoutScheme, #char '/') or Text.contains(withoutScheme, #char '?') or Text.contains(withoutScheme, #char '#')) {
      return #err("endpoint must not include path, query, or fragment");
    };
    #ok;
  };

  func validateConfig(args : T.ConfigureTargetArgs) : Result.Result<T.S3CompatibleTargetConfig, Text> {
    switch (validateEndpoint(args.endpoint)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (validateBucket(args.bucket)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (validateTextField("region", args.region)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (validateTextField("accessKeyId", args.accessKeyId)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (validateTextField("secretAccessKey", args.secretAccessKey)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };

    let prefix = switch (Layout.normalizePrefix(args.prefix)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    #ok({
      endpoint = Text.trim(args.endpoint, #char ' ');
      bucket = Text.trim(args.bucket, #char ' ');
      region = Text.trim(args.region, #char ' ');
      prefix;
      forcePathStyle = args.forcePathStyle;
    });
  };

  func samePhysicalTarget(a : T.S3CompatibleTargetConfig, b : T.S3CompatibleTargetConfig) : Bool {
    Text.equal(a.endpoint, b.endpoint) and Text.equal(a.bucket, b.bucket) and Text.equal(a.prefix, b.prefix);
  };

  func removeCredential(store : Store, credentialId : T.CredentialId, now : Time.Time) {
    switch (Map.get(store.credentials, Text.compare, credentialId)) {
      case (?credential) {
        Map.add(
          store.credentials,
          Text.compare,
          credentialId,
          {
            credential with
            accessKeyId = "";
            secretAccessKey = "";
            sessionToken = null;
            status = #Removed;
            updatedAt = now;
          },
        );
      };
      case null {};
    };
  };

  /// Validates a configure request without mutating the store. The returned
  /// value carries everything the capability probe and the final commit need.
  public func prepareConfigureTarget(store : Store, args : T.ConfigureTargetArgs) : Result.Result<T.PreparedConfigureTarget, Text> {
    let config = switch (validateConfig(args)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    let existingTarget = switch (args.targetId) {
      case (?targetId) {
        if (Text.size(Text.trim(targetId, #char ' ')) == 0) {
          return #err("targetId must not be empty");
        };
        switch (Map.get(store.targets, Text.compare, targetId)) {
          case (?target) ?target;
          case null return #err("external storage target not found");
        };
      };
      case null null;
    };

    switch (existingTarget) {
      case (?target) {
        if (not samePhysicalTarget(configOf(target), config)) {
          return #err("endpoint, bucket, or prefix changes require creating a new external storage target");
        };
      };
      case null {};
    };

    #ok({
      existingTarget;
      displayName = args.displayName;
      config;
      accessKeyId = Text.trim(args.accessKeyId, #char ' ');
      secretAccessKey = Text.trim(args.secretAccessKey, #char ' ');
      sessionToken = args.sessionToken;
    });
  };

  /// Commits a prepared configure request after the capability probe passed.
  /// On rotation the previous credential is only removed here, so a failed
  /// probe never demotes a working target.
  public func commitConfigureTarget(store : Store, prepared : T.PreparedConfigureTarget, validatedAt : ?Time.Time, now : Time.Time) : Result.Result<T.TargetView, Text> {
    let targetId = switch (prepared.existingTarget) {
      case (?target) target.id;
      case null nextTargetId(store);
    };
    let credentialId = nextCredentialId(store);

    let credential : T.Credential = {
      id = credentialId;
      targetId;
      accessKeyId = prepared.accessKeyId;
      secretAccessKey = prepared.secretAccessKey;
      sessionToken = prepared.sessionToken;
      status = #Active;
      createdAt = now;
      updatedAt = now;
      lastValidatedAt = validatedAt;
    };
    Map.add(store.credentials, Text.compare, credentialId, credential);

    switch (prepared.existingTarget) {
      case (?target) switch (target.credentialId) {
        case (?oldCredentialId) removeCredential(store, oldCredentialId, now);
        case null {};
      };
      case null {};
    };

    let target : T.Target = switch (prepared.existingTarget) {
      case (?previous) {
        {
          previous with
          version = previous.version + 1;
          displayName = prepared.displayName;
          kind = #S3CompatiblePublicEncrypted(prepared.config);
          layoutVersion = Layout.layoutVersionV1;
          readMode = #PublicEncrypted;
          writeMode = #CanisterPresigned;
          status = #Active;
          credentialId = ?credentialId;
          updatedAt = now;
          lastValidatedAt = validatedAt;
        };
      };
      case null {
        {
          id = targetId;
          version = 1;
          displayName = prepared.displayName;
          kind = #S3CompatiblePublicEncrypted(prepared.config);
          layoutVersion = Layout.layoutVersionV1;
          readMode = #PublicEncrypted;
          writeMode = #CanisterPresigned;
          status = #Active;
          credentialId = ?credentialId;
          createdAt = now;
          updatedAt = now;
          lastValidatedAt = validatedAt;
        };
      };
    };

    Map.add(store.targets, Text.compare, targetId, target);
    store.activeTargetId := ?targetId;

    #ok(targetView(store, target));
  };

  /// Permanently removes a target and its credential. Only allowed when the
  /// target holds no data: every replica is HEAD-confirmed deleted, no cleanup
  /// task is live, and no upload session is in flight.
  public func disconnectTarget(store : Store, targetId : T.TargetId) : Result.Result<(), Text> {
    let ?target = Map.get(store.targets, Text.compare, targetId) else return #err("external storage target not found");

    for (replica in Map.values(store.replicas)) {
      if (Text.equal(replica.targetId, targetId) and replica.status != #Deleted) {
        return #err("external storage target still holds data; delete the files first and wait for cleanup to finish");
      };
    };
    for (task in Map.values(store.deleteTasks)) {
      if (Text.equal(task.targetId, targetId) and (task.status == #Pending or task.status == #Running)) {
        return #err("external storage cleanup is still running for this target; try again later");
      };
    };
    for (session in Map.values(store.uploadSessions)) {
      if (Text.equal(session.targetId, targetId)) {
        return #err("an upload to this target is still in progress");
      };
    };

    // Drop the target's terminal records right away instead of waiting for GC.
    let replicas = Iter.toArray(Map.entries(store.replicas));
    for ((replicaId, replica) in replicas.vals()) {
      if (Text.equal(replica.targetId, targetId)) {
        Map.remove(store.replicas, Text.compare, replicaId);
      };
    };
    let tasks = Iter.toArray(Map.entries(store.deleteTasks));
    for ((taskId, task) in tasks.vals()) {
      if (Text.equal(task.targetId, targetId)) {
        Map.remove(store.deleteTasks, Nat.compare, taskId);
      };
    };

    switch (target.credentialId) {
      case (?credentialId) Map.remove(store.credentials, Text.compare, credentialId);
      case null {};
    };
    Map.remove(store.targets, Text.compare, targetId);
    if (store.activeTargetId == ?targetId) {
      store.activeTargetId := null;
    };
    #ok;
  };

  public func disableTarget(store : Store, targetId : T.TargetId, now : Time.Time) : Result.Result<T.TargetView, Text> {
    let ?target = Map.get(store.targets, Text.compare, targetId) else return #err("external storage target not found");
    let disabled = {
      target with
      status = #Disabled;
      updatedAt = now;
    };
    Map.add(store.targets, Text.compare, targetId, disabled);
    if (store.activeTargetId == ?targetId) {
      store.activeTargetId := null;
    };
    #ok(targetView(store, disabled));
  };

  public func blobLocatorForTarget(store : Store, args : T.TargetBlobLocatorArgs) : Result.Result<T.TargetBlobLocator, Text> {
    switch (targetAndLocator(store, args.targetId, args.rootHashHex)) {
      case (#ok((target, locator))) #ok({ target = targetView(store, target); locator });
      case (#err(message)) #err(message);
    };
  };

  public func blobLocatorForReplica(store : Store, rootHashHex : T.RootHashHex) : Result.Result<T.TargetBlobLocator, Text> {
    for (replica in Map.values(store.replicas)) {
      if (Text.equal(replica.rootHashHex, rootHashHex) and replica.status == #Active) {
        let ?target = getTarget(store, replica.targetId) else return #err("external storage target not found");
        return #ok({
          target = targetView(store, target);
          locator = replica.locator;
        });
      };
    };
    #err("external blob replica not found");
  };

  func activeCredential(store : Store, target : T.Target) : Result.Result<T.Credential, Text> {
    let ?credentialId = target.credentialId else return #err("external storage target has no signing credential");
    let ?credential = Map.get(store.credentials, Text.compare, credentialId) else return #err("external storage signing credential not found");
    if (credential.status != #Active) {
      return #err("external storage signing credential is not active");
    };
    #ok(credential);
  };

  /// Extracts the S3 config. `TargetKind` currently has a single variant;
  /// this one helper localizes that assumption, so a future kind plugs in here.
  func configOf(target : T.Target) : T.S3CompatibleTargetConfig {
    switch (target.kind) { case (#S3CompatiblePublicEncrypted(config)) config };
  };

  /// Resolves a target by id (or the active one when null) and asserts it is
  /// usable (`#Active`). The shared core of every "operate on a target" entry.
  func resolveTarget(store : Store, targetId : ?T.TargetId) : Result.Result<T.Target, Text> {
    let target = switch (targetId) {
      case (?id) switch (getTarget(store, id)) {
        case (?target) target;
        case null return #err("external storage target not found");
      };
      case null switch (getActiveTarget(store)) {
        case (?target) target;
        case null return #err("active external storage target is not configured");
      };
    };
    if (target.status != #Active) {
      return #err("external storage target is not active");
    };
    #ok(target);
  };

  func targetAndLocator(store : Store, targetId : ?T.TargetId, rootHashHex : T.RootHashHex) : Result.Result<(T.Target, T.BlobLocator), Text> {
    let target = switch (resolveTarget(store, targetId)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let locator = switch (Layout.blobLocator({ prefix = configOf(target).prefix; rootHashHex })) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    #ok((target, locator));
  };

  /// Cancels live delete tasks that own the exact objects of `replicaId`
  /// (or orphan tasks covering the same target+root). Called before a re-upload
  /// touches those keys, so an in-flight cleanup cannot destroy resurrected content.
  func cancelLiveDeleteTasksForReplica(store : Store, targetId : T.TargetId, rootHashHex : T.RootHashHex, now : Time.Time) {
    let replicaId = Layout.replicaId(targetId, rootHashHex);
    let tasks = Iter.toArray(Map.values(store.deleteTasks));
    for (task in tasks.vals()) {
      let owns = switch (task.replicaId) {
        case (?id) Text.equal(id, replicaId);
        case null Text.equal(task.targetId, targetId) and Text.equal(task.rootHashHex, rootHashHex);
      };
      if (owns) {
        switch (task.status) {
          case (#Pending or #Running) {
            task.status := #Cancelled;
            task.lastError := ?"cancelled: content re-uploaded";
            task.updatedAt := now;
          };
          case (#Done or #Cancelled) {};
        };
      };
    };
  };

  public func prepareBlobUpload(store : Store, args : T.PresignBlobUploadArgs, now : Time.Time) : Result.Result<T.PresignBlobUploadResult, Text> {
    let (target, locator) = switch (targetAndLocator(store, args.targetId, args.rootHashHex)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let credential = switch (activeCredential(store, target)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let config = configOf(target);

    let treeUpload = switch (S3SigV4.presign({ config; credential; method = #PUT; key = locator.treeKey; expiresSeconds = args.expiresSeconds; now })) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    let blobUpload = switch (S3SigV4.presign({ config; credential; method = #PUT; key = locator.blobKey; expiresSeconds = args.expiresSeconds; now })) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    cancelLiveDeleteTasksForReplica(store, target.id, args.rootHashHex, now);

    let replicaId = Layout.replicaId(target.id, args.rootHashHex);
    Map.add(
      store.uploadSessions,
      Text.compare,
      replicaId,
      {
        targetId = target.id;
        rootHashHex = args.rootHashHex;
        keys = [locator.treeKey, locator.blobKey];
        createdAt = now;
        expiresAt = now + args.expiresSeconds * NANOS_PER_SECOND + UPLOAD_SESSION_MARGIN_NANOS;
      },
    );

    #ok({
      target = targetView(store, target);
      locator;
      treeUpload;
      blobUpload;
    });
  };

  public func recordBlobReplica(store : Store, args : { targetId : ?T.TargetId; rootHashHex : T.RootHashHex; size : Nat; sha256 : ?Blob }, now : Time.Time) : Result.Result<T.BlobReplica, Text> {
    let (target, locator) = switch (targetAndLocator(store, args.targetId, args.rootHashHex)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    cancelLiveDeleteTasksForReplica(store, target.id, args.rootHashHex, now);

    let id = Layout.replicaId(target.id, args.rootHashHex);
    Map.remove(store.uploadSessions, Text.compare, id);

    let replica : T.BlobReplica = {
      id;
      targetId = target.id;
      rootHashHex = args.rootHashHex;
      locator;
      size = args.size;
      sha256 = args.sha256;
      status = #Active;
      pendingDeleteTaskId = null;
      createdAt = now;
      updatedAt = now;
    };
    Map.add(store.replicas, Text.compare, id, replica);
    #ok(replica);
  };

  func taskIsLive(store : Store, taskId : ?Nat) : Bool {
    switch (taskId) {
      case (?id) switch (Map.get(store.deleteTasks, Nat.compare, id)) {
        case (?task) task.status == #Pending or task.status == #Running;
        case null false;
      };
      case null false;
    };
  };

  func shouldQueueReplicaDelete(store : Store, replica : T.BlobReplica) : Bool {
    switch (replica.status) {
      case (#Active) true;
      // Re-queue a stuck DeletePending replica whose task was cancelled or lost.
      case (#DeletePending) not taskIsLive(store, replica.pendingDeleteTaskId);
      case (#Deleted) false;
      case (#Missing) false;
    };
  };

  func addDeleteTask(store : Store, args : { targetId : T.TargetId; rootHashHex : T.RootHashHex; replicaId : ?Text; keys : [Text] }, now : Time.Time) : T.DeleteTask {
    let taskId = store.nextDeleteTaskId;
    store.nextDeleteTaskId += 1;

    let task : T.DeleteTask = {
      id = taskId;
      targetId = args.targetId;
      rootHashHex = args.rootHashHex;
      replicaId = args.replicaId;
      keys = args.keys;
      var attempts = 0;
      var status = #Pending;
      var nextAttemptAt = now;
      var leaseExpiresAt = now;
      var lastError = null;
      createdAt = now;
      var updatedAt = now;
    };
    Map.add(store.deleteTasks, Nat.compare, taskId, task);
    task;
  };

  public func queueBlobReplicaDeletesForRoot(store : Store, rootHashHex : T.RootHashHex, now : Time.Time) : [T.DeleteTaskView] {
    let tasks = Vector.new<T.DeleteTaskView>();
    let replicas = Iter.toArray(Map.values(store.replicas));
    for (replica in replicas.vals()) {
      if (Text.equal(replica.rootHashHex, rootHashHex) and shouldQueueReplicaDelete(store, replica)) {
        let task = addDeleteTask(
          store,
          {
            targetId = replica.targetId;
            rootHashHex = replica.rootHashHex;
            replicaId = ?replica.id;
            keys = [replica.locator.treeKey, replica.locator.blobKey];
          },
          now,
        );

        Map.add(
          store.replicas,
          Text.compare,
          replica.id,
          {
            replica with
            status = #DeletePending;
            pendingDeleteTaskId = ?task.id;
            updatedAt = now;
          },
        );

        Vector.add(tasks, deleteTaskView(task));
      };
    };
    Vector.toArray(tasks);
  };

  /// Queues delete tasks for expired upload sessions (presigned PUT that was
  /// never committed). Returns the number of newly queued tasks.
  public func sweepUploadSessions(store : Store, now : Time.Time) : Nat {
    var queued : Nat = 0;
    let sessions = Iter.toArray(Map.entries(store.uploadSessions));
    for ((replicaId, session) in sessions.vals()) {
      if (session.expiresAt <= now) {
        Map.remove(store.uploadSessions, Text.compare, replicaId);
        switch (Map.get(store.replicas, Text.compare, replicaId)) {
          // A replica exists: the commit won the race (or a delete flow already owns it).
          case (?_) {};
          case null {
            ignore addDeleteTask(
              store,
              {
                targetId = session.targetId;
                rootHashHex = session.rootHashHex;
                replicaId = null;
                keys = session.keys;
              },
              now,
            );
            queued += 1;
          };
        };
      };
    };
    queued;
  };

  /// Drops terminal records after their retention window. #Missing replicas
  /// and live tasks are kept until resolved.
  public func gcCleanupRecords(store : Store, now : Time.Time) {
    let tasks = Iter.toArray(Map.entries(store.deleteTasks));
    for ((taskId, task) in tasks.vals()) {
      let expired = switch (task.status) {
        case (#Done) task.updatedAt + DONE_TASK_RETENTION_NANOS <= now;
        case (#Cancelled) task.updatedAt + CANCELLED_TASK_RETENTION_NANOS <= now;
        case (#Pending or #Running) false;
      };
      if (expired) {
        Map.remove(store.deleteTasks, Nat.compare, taskId);
      };
    };

    let replicas = Iter.toArray(Map.entries(store.replicas));
    for ((replicaId, replica) in replicas.vals()) {
      if (replica.status == #Deleted and replica.updatedAt + DELETED_REPLICA_RETENTION_NANOS <= now) {
        Map.remove(store.replicas, Text.compare, replicaId);
      };
    };
  };

  func targetAllowsCleanup(store : Store, targetId : T.TargetId) : Bool {
    switch (getTarget(store, targetId)) {
      case (?target) target.status != #CredentialFailed;
      case null true; // target gone: still try, task will fail into retry with a clear error
    };
  };

  func taskIsReady(task : T.DeleteTask, now : Time.Time) : Bool {
    switch (task.status) {
      case (#Pending) task.nextAttemptAt <= now;
      case (#Running) task.leaseExpiresAt <= now; // stale lease after trap/upgrade
      case (#Done or #Cancelled) false;
    };
  };

  func nextRunnableDeleteTask(store : Store, now : Time.Time) : ?T.DeleteTask {
    var best : ?T.DeleteTask = null;
    for (task in Map.values(store.deleteTasks)) {
      if (taskIsReady(task, now) and targetAllowsCleanup(store, task.targetId)) {
        best := switch (best) {
          case (?current) if (task.nextAttemptAt < current.nextAttemptAt) ?task else ?current;
          case null ?task;
        };
      };
    };
    best;
  };

  /// Earliest moment any cleanup work becomes due (tasks or session expiry).
  /// Tasks on credential-failed targets are excluded: they resume only after
  /// a successful re-validation, which re-arms the timer explicitly.
  public func nextWakeTime(store : Store) : ?Time.Time {
    var wake : ?Time.Time = null;
    func consider(at : Time.Time) {
      wake := switch (wake) {
        case (?current) if (at < current) ?at else ?current;
        case null ?at;
      };
    };

    for (task in Map.values(store.deleteTasks)) {
      if (targetAllowsCleanup(store, task.targetId)) {
        switch (task.status) {
          case (#Pending) consider(task.nextAttemptAt);
          case (#Running) consider(task.leaseExpiresAt);
          case (#Done or #Cancelled) {};
        };
      };
    };
    for (session in Map.values(store.uploadSessions)) {
      consider(session.expiresAt);
    };
    wake;
  };

  public func cleanupStatus(store : Store) : T.CleanupStatus {
    var pendingTasks = 0;
    var runningTasks = 0;
    var doneTasks = 0;
    var cancelledTasks = 0;
    for (task in Map.values(store.deleteTasks)) {
      switch (task.status) {
        case (#Pending) pendingTasks += 1;
        case (#Running) runningTasks += 1;
        case (#Done) doneTasks += 1;
        case (#Cancelled) cancelledTasks += 1;
      };
    };

    var activeReplicas = 0;
    var deletePendingReplicas = 0;
    var deletedReplicas = 0;
    var missingReplicas = 0;
    for (replica in Map.values(store.replicas)) {
      switch (replica.status) {
        case (#Active) activeReplicas += 1;
        case (#DeletePending) deletePendingReplicas += 1;
        case (#Deleted) deletedReplicas += 1;
        case (#Missing) missingReplicas += 1;
      };
    };

    let credentialBlockedTargetIds = Vector.new<T.TargetId>();
    for (target in Map.values(store.targets)) {
      if (target.status == #CredentialFailed) {
        Vector.add(credentialBlockedTargetIds, target.id);
      };
    };

    {
      pendingTasks;
      runningTasks;
      doneTasks;
      cancelledTasks;
      nextAttemptAt = nextWakeTime(store);
      credentialBlockedTargetIds = Vector.toArray(credentialBlockedTargetIds);
      activeReplicas;
      deletePendingReplicas;
      deletedReplicas;
      missingReplicas;
      pendingUploadSessions = Map.size(store.uploadSessions);
    };
  };

  func retryBackoffNanos(attempts : Nat) : Int {
    var delay : Int = RETRY_BASE_DELAY_NANOS;
    var i : Nat = 1;
    while (i < attempts and delay < RETRY_MAX_DELAY_NANOS) {
      delay *= 2;
      i += 1;
    };
    if (delay > RETRY_MAX_DELAY_NANOS) RETRY_MAX_DELAY_NANOS else delay;
  };

  func markDeleteTaskRetry(task : T.DeleteTask, message : Text, now : Time.Time) : T.DeleteTaskView {
    task.status := #Pending;
    task.lastError := ?message;
    task.nextAttemptAt := now + retryBackoffNanos(task.attempts);
    task.updatedAt := now;
    deleteTaskView(task);
  };

  func markTargetCredentialFailed(store : Store, targetId : T.TargetId, now : Time.Time) {
    switch (getTarget(store, targetId)) {
      case (?target) {
        if (target.status == #Active) {
          Map.add(store.targets, Text.compare, targetId, { target with status = #CredentialFailed; updatedAt = now });
        };
        switch (target.credentialId) {
          case (?credentialId) {
            switch (Map.get(store.credentials, Text.compare, credentialId)) {
              case (?credential) {
                if (credential.status == #Active) {
                  Map.add(store.credentials, Text.compare, credentialId, { credential with status = #ValidationFailed; updatedAt = now });
                };
              };
              case null {};
            };
          };
          case null {};
        };
      };
      case null {};
    };
  };

  func clearTargetCredentialFailed(store : Store, targetId : T.TargetId, validatedAt : Time.Time) {
    switch (getTarget(store, targetId)) {
      case (?target) {
        if (target.status == #CredentialFailed) {
          Map.add(store.targets, Text.compare, targetId, { target with status = #Active; updatedAt = validatedAt; lastValidatedAt = ?validatedAt });
        } else {
          Map.add(store.targets, Text.compare, targetId, { target with lastValidatedAt = ?validatedAt; updatedAt = validatedAt });
        };
        switch (target.credentialId) {
          case (?credentialId) {
            switch (Map.get(store.credentials, Text.compare, credentialId)) {
              case (?credential) {
                Map.add(store.credentials, Text.compare, credentialId, { credential with status = #Active; lastValidatedAt = ?validatedAt; updatedAt = validatedAt });
              };
              case null {};
            };
          };
          case null {};
        };
      };
      case null {};
    };
  };

  func isAuthFailureStatus(status : Nat) : Bool {
    status == 401 or status == 403;
  };

  func presignForOutcall(config : T.S3CompatibleTargetConfig, credential : T.Credential, method : T.PresignedHttpMethod, key : Text, now : Time.Time) : Result.Result<Text, Text> {
    switch (S3SigV4.presign({ config; credential; method; key; expiresSeconds = OUTCALL_URL_EXPIRES_SECONDS; now })) {
      case (#ok(signed)) #ok(signed.url);
      case (#err(message)) #err(message);
    };
  };

  func httpMethod(method : T.PresignedHttpMethod) : { #get; #put; #head; #post; #delete; #patch } {
    switch (method) {
      case (#GET) #get;
      case (#PUT) #put;
      case (#DELETE) #delete;
      case (#HEAD) #head;
    };
  };

  func s3Outcall(
    config : T.S3CompatibleTargetConfig,
    credential : T.Credential,
    method : T.PresignedHttpMethod,
    key : Text,
    body : ?Blob,
    replicated : Bool,
    transform : ?T.HttpTransform,
  ) : async Result.Result<Nat, Text> {
    let url = switch (presignForOutcall(config, credential, method, key, Time.now())) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    try {
      let response = await ICCall.httpRequest({
        url;
        method = httpMethod(method);
        max_response_bytes = ?HTTP_MAX_RESPONSE_BYTES;
        body;
        headers = [];
        transform;
        is_replicated = ?replicated;
      });
      #ok(response.status);
    } catch (error) {
      #err(Error.message(error));
    };
  };

  /// One probe request: fires the outcall and validates the returned status
  /// via `expected` (returns an error message when the status is wrong).
  func probeStep(
    args : {
      config : T.S3CompatibleTargetConfig;
      credential : T.Credential;
      transform : ?T.HttpTransform;
      method : T.PresignedHttpMethod;
      key : Text;
      body : ?Blob;
      requestLabel : Text;
      expected : Nat -> ?Text;
    }
  ) : async Result.Result<(), Text> {
    switch (await s3Outcall(args.config, args.credential, args.method, args.key, args.body, false, args.transform)) {
      case (#ok(status)) switch (args.expected(status)) {
        case (?message) #err(message);
        case null #ok;
      };
      case (#err(message)) #err(args.requestLabel # " request failed: " # message);
    };
  };

  /// Configure-time capability probe: PUT -> HEAD(200) -> DELETE -> HEAD(404)
  /// on a throwaway key under the target prefix. Exercises exactly the
  /// permissions uploads and cleanup rely on, without touching user objects.
  public func probeTargetAccess(
    args : {
      config : T.S3CompatibleTargetConfig;
      accessKeyId : Text;
      secretAccessKey : Text;
      sessionToken : ?Text;
      nonce : Text;
      transform : ?T.HttpTransform;
    }
  ) : async Result.Result<(), Text> {
    let credential : T.Credential = {
      id = "probe";
      targetId = "probe";
      accessKeyId = args.accessKeyId;
      secretAccessKey = args.secretAccessKey;
      sessionToken = args.sessionToken;
      status = #Active;
      createdAt = 0;
      updatedAt = 0;
      lastValidatedAt = null;
    };
    let key = Layout.probeKey(args.config.prefix, args.nonce);
    let body = Text.encodeUtf8("rabbithole-probe");
    let base = { config = args.config; credential; transform = args.transform };

    let put = await probeStep({
      base with method = #PUT; key; body = ?body; requestLabel = "probe PUT";
      expected = func(status) = if (status < 200 or status >= 300) ?("probe PUT failed with status " # Nat.toText(status) # probeHint(status)) else null;
    });
    switch (put) { case (#err(m)) return #err(m); case (#ok) {} };

    let headPresent = await probeStep({
      base with method = #HEAD; key; body = null; requestLabel = "probe HEAD";
      expected = func(status) = if (status != 200) ?("probe HEAD after PUT failed with status " # Nat.toText(status) # probeHint(status)) else null;
    });
    switch (headPresent) { case (#err(m)) return #err(m); case (#ok) {} };

    let del = await probeStep({
      base with method = #DELETE; key; body = null; requestLabel = "probe DELETE";
      expected = func(status) = if ((status < 200 or status >= 300) and status != 404) ?("probe DELETE failed with status " # Nat.toText(status) # probeHint(status)) else null;
    });
    switch (del) { case (#err(m)) return #err(m); case (#ok) {} };

    let headGone = await probeStep({
      base with method = #HEAD; key; body = null; requestLabel = "probe verification HEAD";
      expected = func(status) = if (status != 404) ?("probe object still present after DELETE (HEAD status " # Nat.toText(status) # ")") else null;
    });
    switch (headGone) { case (#err(m)) return #err(m); case (#ok) {} };

    #ok;
  };

  func probeHint(status : Nat) : Text {
    if (isAuthFailureStatus(status)) " (check access key, secret, and bucket permissions)" else "";
  };

  /// Re-runs the capability probe with the stored credential and clears or
  /// sets the target's credential-failed state accordingly.
  public func revalidateTarget(store : Store, targetId : T.TargetId, nonce : Text, transform : ?T.HttpTransform) : async Result.Result<T.TargetView, Text> {
    let ?target = getTarget(store, targetId) else return #err("external storage target not found");
    let ?credentialId = target.credentialId else return #err("external storage target has no signing credential");
    let ?credential = Map.get(store.credentials, Text.compare, credentialId) else return #err("external storage signing credential not found");
    if (credential.status == #Removed) {
      return #err("external storage signing credential was removed");
    };
    let config = configOf(target);

    let probeResult = await probeTargetAccess({
      config;
      accessKeyId = credential.accessKeyId;
      secretAccessKey = credential.secretAccessKey;
      sessionToken = credential.sessionToken;
      nonce;
      transform;
    });

    let now = Time.now();
    switch (probeResult) {
      case (#ok) {
        clearTargetCredentialFailed(store, targetId, now);
        let ?updated = getTarget(store, targetId) else return #err("external storage target not found");
        #ok(targetView(store, updated));
      };
      case (#err(message)) {
        markTargetCredentialFailed(store, targetId, now);
        #err(message);
      };
    };
  };

  func completeDeleteTask(store : Store, task : T.DeleteTask, now : Time.Time) {
    task.status := #Done;
    task.lastError := null;
    task.updatedAt := now;
    switch (task.replicaId) {
      case (?replicaId) {
        switch (Map.get(store.replicas, Text.compare, replicaId)) {
          case (?replica) {
            if (replica.pendingDeleteTaskId == ?task.id and replica.status == #DeletePending) {
              Map.add(
                store.replicas,
                Text.compare,
                replicaId,
                {
                  replica with
                  status = #Deleted;
                  pendingDeleteTaskId = null;
                  updatedAt = now;
                },
              );
            };
          };
          case null {};
        };
      };
      case null {};
    };
  };

  /// A cancelled task finished its outcalls anyway and the objects are gone.
  /// If a resurrected replica now points at those keys, its content is missing.
  func recordClobberedReplica(store : Store, task : T.DeleteTask, now : Time.Time) {
    let replicaId = switch (task.replicaId) {
      case (?id) id;
      case null Layout.replicaId(task.targetId, task.rootHashHex);
    };
    switch (Map.get(store.replicas, Text.compare, replicaId)) {
      case (?replica) {
        if (replica.status == #Active) {
          Map.add(
            store.replicas,
            Text.compare,
            replicaId,
            {
              replica with
              status = #Missing;
              pendingDeleteTaskId = null;
              updatedAt = now;
            },
          );
        };
      };
      case null {};
    };
  };

  /// Executes one delete task: per-object DELETE (response untrusted,
  /// non-replicated) followed by a replicated HEAD per key. The task is done
  /// only when every key is HEAD-confirmed absent. Transient failures return
  /// the task to #Pending with exponential backoff; 401/403 marks the target
  /// credential-failed and pauses its queue.
  public func runDeleteTask(store : Store, taskId : ?Nat, transform : ?T.HttpTransform, now : Time.Time) : async Result.Result<T.DeleteTaskView, Text> {
    let task = switch (taskId) {
      case (?id) switch (Map.get(store.deleteTasks, Nat.compare, id)) {
        case (?value) value;
        case null return #err("external storage delete task not found");
      };
      case null switch (nextRunnableDeleteTask(store, now)) {
        case (?value) value;
        case null return #err("no runnable external storage delete task");
      };
    };

    switch (task.status) {
      case (#Done or #Cancelled) return #ok(deleteTaskView(task));
      case (#Running) {
        if (task.leaseExpiresAt > now) {
          return #err("external storage delete task is already running");
        };
      };
      case (#Pending) {};
    };

    // Start guard: never touch S3 for a task whose replica was resurrected.
    switch (task.replicaId) {
      case (?replicaId) {
        switch (Map.get(store.replicas, Text.compare, replicaId)) {
          case (?replica) {
            if (replica.status != #DeletePending or replica.pendingDeleteTaskId != ?task.id) {
              task.status := #Cancelled;
              task.lastError := ?"cancelled: replica no longer owned by this task";
              task.updatedAt := now;
              return #ok(deleteTaskView(task));
            };
          };
          case null {
            task.status := #Cancelled;
            task.lastError := ?"cancelled: replica record is gone";
            task.updatedAt := now;
            return #ok(deleteTaskView(task));
          };
        };
      };
      case null {
        // Orphan-session task: a committed replica means the upload succeeded after all.
        switch (Map.get(store.replicas, Text.compare, Layout.replicaId(task.targetId, task.rootHashHex))) {
          case (?replica) {
            if (replica.status == #Active) {
              task.status := #Cancelled;
              task.lastError := ?"cancelled: upload was committed";
              task.updatedAt := now;
              return #ok(deleteTaskView(task));
            };
          };
          case null {};
        };
      };
    };

    let ?target = getTarget(store, task.targetId) else {
      return #ok(markDeleteTaskRetry(task, "external storage target not found", now));
    };
    let credential = switch (activeCredential(store, target)) {
      case (#ok(value)) value;
      case (#err(message)) return #ok(markDeleteTaskRetry(task, message, now));
    };
    let config = configOf(target);

    task.status := #Running;
    task.attempts += 1;
    task.leaseExpiresAt := now + LEASE_DURATION_NANOS;
    task.lastError := null;
    task.updatedAt := now;

    for (key in task.keys.vals()) {
      switch (await s3Outcall(config, credential, #DELETE, key, null, false, transform)) {
        case (#ok(status)) {
          if (isAuthFailureStatus(status)) {
            markTargetCredentialFailed(store, task.targetId, Time.now());
            return #ok(markDeleteTaskRetry(task, "S3 DELETE rejected with status " # Nat.toText(status) # " (credential failure)", Time.now()));
          };
          // Any other status is fine: HEAD below is the only success oracle.
        };
        case (#err(message)) {
          return #ok(markDeleteTaskRetry(task, "S3 DELETE request failed: " # message, Time.now()));
        };
      };
    };

    for (key in task.keys.vals()) {
      switch (await s3Outcall(config, credential, #HEAD, key, null, true, transform)) {
        case (#ok(status)) {
          if (status == 404) {
            // confirmed gone
          } else if (isAuthFailureStatus(status)) {
            markTargetCredentialFailed(store, task.targetId, Time.now());
            return #ok(markDeleteTaskRetry(task, "S3 HEAD rejected with status " # Nat.toText(status) # " (credential failure)", Time.now()));
          } else {
            return #ok(markDeleteTaskRetry(task, "object still present after DELETE (HEAD status " # Nat.toText(status) # " for " # key # ")", Time.now()));
          };
        };
        case (#err(message)) {
          return #ok(markDeleteTaskRetry(task, "S3 HEAD verification failed: " # message, Time.now()));
        };
      };
    };

    let doneAt = Time.now();
    // Completion guard: a re-upload may have cancelled the task mid-flight.
    if (task.status == #Cancelled) {
      recordClobberedReplica(store, task, doneAt);
      return #ok(deleteTaskView(task));
    };

    completeDeleteTask(store, task, doneAt);
    #ok(deleteTaskView(task));
  };
};
