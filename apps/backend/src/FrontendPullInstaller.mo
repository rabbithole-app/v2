import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import HttpAssets "mo:http-assets";
import HttpAssetsTypes "mo:http-assets/BaseAssets/Types";
import Sha256 "mo:sha2/Sha256";
import Vector "mo:vector";

import FrontendPullTypes "StorageDeployer/FrontendPullTypes";

/// Pulls this canister's frontend from the rabbithole backend (pull model):
/// fetches the release manifest, diffs it against the local asset store by
/// sha256, pulls only new/changed files chunk by chunk, writes them locally
/// and reports progress/completion back to the backend.
module FrontendPullInstaller {
  let MAX_ATTEMPTS : Nat = 5;
  let RETRY_BASE_DELAY_SECONDS : Nat = 5;
  /// A run() that shows no activity for this long is considered dead: a
  /// local trap is not catchable and leaves `running` committed as true
  /// (state rolls back only to the last await), so start() self-heals past
  /// it. Longer than the backend's 10-minute pull watchdog.
  let STALE_RUN_TIMEOUT_NS : Int = 900_000_000_000;

  public type FileMetadata = FrontendPullTypes.FileMetadata;
  public type PullPlan = FrontendPullTypes.PullPlan;
  public type PullStats = FrontendPullTypes.PullStats;
  public type PullResult = FrontendPullTypes.PullResult;
  public type PullError = FrontendPullTypes.PullError;
  public type Backend = FrontendPullTypes.Backend;

  /// Stable install request — survives self-upgrade mid-pull; the actor
  /// re-arms the loop from it at init. The whole run is idempotent: the
  /// diff skips files that already match by sha256.
  public type PendingInstall = {
    versionKey : Text;
    expectedTreeHash : ?Blob;
    totalFiles : Nat;
    totalBytes : Nat;
    isUpgrade : Bool;
    requestedAt : Time.Time;
  };

  public type Status = {
    versionKey : Text;
    stage : Text;
    pulledFiles : Nat;
    pulledBytes : Nat;
    totalFiles : Nat;
    totalBytes : Nat;
    attempts : Nat;
    lastError : ?Text;
  };

  public type Runtime = {
    var timerId : ?Timer.TimerId;
    var running : Bool;
    var lastActivityAt : Time.Time;
    var attempts : Nat;
    var stage : Text;
    var lastError : ?Text;
    var pulledFiles : Nat;
    var pulledBytes : Nat;
  };

  public type Context = {
    owner : Principal;
    backend : () -> ?Backend;
    assetStore : () -> HttpAssets.Assets;
    isUserAsset : Text -> Bool;
    computeTreeHash : () -> Blob;
    getPending : () -> ?PendingInstall;
    /// Clears the pending install only if it still belongs to the given
    /// versionKey — a superseding install for another version must survive
    /// the old run's termination.
    clearPending : Text -> ();
  };

  public func newRuntime() : Runtime {
    {
      var timerId = null;
      var running = false;
      var lastActivityAt = 0;
      var attempts = 0;
      var stage = "idle";
      var lastError = null;
      var pulledFiles = 0;
      var pulledBytes = 0;
    };
  };

  public func status(rt : Runtime, ctx : Context) : ?Status {
    let ?pending = ctx.getPending() else return null;
    ?{
      versionKey = pending.versionKey;
      stage = rt.stage;
      pulledFiles = rt.pulledFiles;
      pulledBytes = rt.pulledBytes;
      totalFiles = pending.totalFiles;
      totalBytes = pending.totalBytes;
      attempts = rt.attempts;
      lastError = rt.lastError;
    };
  };

  /// Arm the loop (0-delay first run, backoff on retries). No-op while a
  /// run is in flight or already scheduled.
  public func start<system>(rt : Runtime, ctx : Context) : () {
    if (rt.timerId != null) return;
    if (rt.running) {
      if (Time.now() - rt.lastActivityAt < STALE_RUN_TIMEOUT_NS) return;
      // Self-heal a trapped run (see STALE_RUN_TIMEOUT_NS)
      rt.running := false;
    };
    switch (ctx.getPending()) {
      case (?_) {};
      case null return;
    };

    let delaySeconds = if (rt.attempts == 0) 0 else RETRY_BASE_DELAY_SECONDS * Nat.pow(2, rt.attempts - 1);
    rt.timerId := ?Timer.setTimer<system>(
      #seconds delaySeconds,
      func() : async () {
        rt.timerId := null;
        await run<system>(rt, ctx);
      },
    );
  };

  func contentEncodingOf(key : Text) : Text {
    if (Text.endsWith(key, #text ".gz")) "gzip" else if (Text.endsWith(key, #text ".br")) "br" else "identity";
  };

  /// Existing asset key → sha256 of any encoding. Pre-compressed files
  /// (.br/.gz keys) have no "identity" encoding, so take the first hash.
  func existingAssetHashes(assets : [HttpAssetsTypes.AssetDetails]) : Map.Map<Text, Blob> {
    let hashes = Map.empty<Text, Blob>();
    for (asset in assets.vals()) {
      label findHash for (encoding in asset.encodings.vals()) {
        switch (encoding.sha256) {
          case (?hash) {
            ignore Map.insert(hashes, Text.compare, asset.key, hash);
            break findHash;
          };
          case null {};
        };
      };
    };
    hashes;
  };

  func dropBatch(ctx : Context, batchId : ?Nat) : () {
    switch (batchId) {
      case (?batch_id) ignore ctx.assetStore().delete_batch(ctx.owner, { batch_id });
      case null {};
    };
  };

  func fail<system>(rt : Runtime, ctx : Context, pending : PendingInstall, batchId : ?Nat, message : Text) : async () {
    rt.running := false;
    dropBatch(ctx, batchId);
    rt.lastError := ?message;
    rt.attempts += 1;
    if (rt.attempts < MAX_ATTEMPTS) {
      start<system>(rt, ctx);
      return;
    };

    rt.stage := "failed";
    switch (ctx.backend()) {
      case (?backend) {
        try {
          await backend.completeFrontendInstall({
            versionKey = pending.versionKey;
            result = #err(message);
          });
        } catch (_) {};
      };
      case null {};
    };
    ctx.clearPending(pending.versionKey);
    rt.attempts := 0;
    // A superseding install may be pending by now — pick it up
    start<system>(rt, ctx);
  };

  /// Abort without reporting — the backend told us this install is no
  /// longer wanted (it restarted, the creation was failed/recovered, or a
  /// newer install superseded this one).
  func abort<system>(rt : Runtime, ctx : Context, pending : PendingInstall, batchId : ?Nat) : () {
    rt.running := false;
    dropBatch(ctx, batchId);
    rt.stage := "aborted";
    rt.attempts := 0;
    ctx.clearPending(pending.versionKey);
    start<system>(rt, ctx);
  };

  func isAbortError(e : PullError) : Bool {
    switch (e) {
      // #UnknownVersion: the backend's session (if any) is for a different
      // version — this run is stale and a superseding install owns the flow.
      case (#NoActiveInstall or #UnknownCanister or #UnknownVersion) true;
      case (_) false;
    };
  };

  func run<system>(rt : Runtime, ctx : Context) : async () {
    if (rt.running) return;
    let ?pending = ctx.getPending() else return;
    let ?backend = ctx.backend() else {
      rt.stage := "failed";
      rt.lastError := ?"backend canister id is not configured";
      ctx.clearPending(pending.versionKey);
      return;
    };

    rt.running := true;
    rt.lastActivityAt := Time.now();
    rt.pulledFiles := 0;
    rt.pulledBytes := 0;
    let versionKey = pending.versionKey;
    var batchId : ?Nat = null;

    try {
      // 1. Manifest (paged; limit=0 returns everything at once today)
      rt.stage := "manifest";
      let manifest = Vector.new<FileMetadata>();
      var fetched = 0;
      label paging loop {
        switch (await backend.pullFrontendManifest({ versionKey; offset = fetched; limit = 0 })) {
          case (#ok(page)) {
            rt.lastActivityAt := Time.now();
            for (entry in page.entries.vals()) {
              Vector.add(manifest, entry);
            };
            fetched += page.entries.size();
            if (fetched >= page.totalFiles or page.entries.size() == 0) break paging;
          };
          case (#err(e)) {
            if (isAbortError(e)) {
              abort<system>(rt, ctx, pending, batchId);
            } else {
              await fail<system>(rt, ctx, pending, batchId, "manifest fetch failed: " # debug_show e);
            };
            return;
          };
        };
      };

      // An empty manifest would classify every installed asset as stale and
      // wipe the frontend — never treat it as a valid release.
      if (Vector.size(manifest) == 0) {
        await fail<system>(rt, ctx, pending, batchId, "release manifest is empty");
        return;
      };

      // 2. Diff against local assets by sha256
      rt.stage := "diff";
      let existing = existingAssetHashes(ctx.assetStore().list({}));
      let manifestKeys = Map.empty<Text, ()>();
      let toPull = Vector.new<FileMetadata>();
      var skippedFiles = 0;
      var skippedBytes = 0;
      var bytesToPull = 0;

      for (entry in Vector.vals(manifest)) {
        ignore Map.insert(manifestKeys, Text.compare, entry.key, ());
        switch (Map.get(existing, Text.compare, entry.key)) {
          case (?hash) {
            if (Blob.equal(hash, entry.sha256)) {
              skippedFiles += 1;
              skippedBytes += entry.size;
            } else {
              Vector.add(toPull, entry);
              bytesToPull += entry.size;
            };
          };
          case null {
            Vector.add(toPull, entry);
            bytesToPull += entry.size;
          };
        };
      };

      // Stale = present locally, not a user asset, absent from the manifest.
      // Changed = will be re-created; must be deleted before #CreateAsset.
      let staleKeys = Vector.new<Text>();
      let changedKeys = Vector.new<Text>();
      for ((key, _) in Map.entries(existing)) {
        if (not ctx.isUserAsset(key) and not Map.containsKey(manifestKeys, Text.compare, key)) {
          Vector.add(staleKeys, key);
        };
      };
      for (entry in Vector.vals(toPull)) {
        if (Map.containsKey(existing, Text.compare, entry.key)) {
          Vector.add(changedKeys, entry.key);
        };
      };

      switch (
        await backend.beginFrontendInstall({
          versionKey;
          plan = {
            filesToPull = Vector.size(toPull);
            bytesToPull;
            skippedFiles;
            skippedBytes;
            staleToDelete = Vector.size(staleKeys);
            changedToDelete = Vector.size(changedKeys);
          };
        })
      ) {
        case (#ok) rt.lastActivityAt := Time.now();
        case (#err(e)) {
          if (isAbortError(e)) {
            abort<system>(rt, ctx, pending, batchId);
          } else {
            await fail<system>(rt, ctx, pending, batchId, "beginFrontendInstall failed: " # debug_show e);
          };
          return;
        };
      };

      // 3. Pull changed/new files into a single batch (batch TTL is 4 days)
      rt.stage := "pulling";
      let assetStore = ctx.assetStore();
      let batch_id = switch (assetStore.create_batch(ctx.owner, {})) {
        case (#ok({ batch_id })) {
          batchId := ?batch_id;
          batch_id;
        };
        case (#err(e)) {
          await fail<system>(rt, ctx, pending, batchId, "create_batch failed: " # e);
          return;
        };
      };
      let operations = Vector.new<HttpAssetsTypes.BatchOperationKind>();

      for (entry in Vector.vals(toPull)) {
        let digest = Sha256.Digest(#sha256);
        let chunkIds = Vector.new<Nat>();
        var chunkIndex = 0;
        var chunkCount = 1;
        while (chunkIndex < chunkCount) {
          switch (await backend.pullFrontendFileChunk({ versionKey; key = entry.key; chunkIndex })) {
            case (#ok(chunk)) {
              rt.lastActivityAt := Time.now();
              chunkCount := chunk.chunkCount;
              digest.writeBlob(chunk.content);
              switch (assetStore.create_chunk(ctx.owner, { batch_id; content = chunk.content })) {
                case (#ok({ chunk_id })) Vector.add(chunkIds, chunk_id);
                case (#err(e)) {
                  await fail<system>(rt, ctx, pending, batchId, "create_chunk failed for " # entry.key # ": " # e);
                  return;
                };
              };
              rt.pulledBytes += chunk.content.size();
              chunkIndex += 1;
            };
            case (#err(e)) {
              if (isAbortError(e)) {
                abort<system>(rt, ctx, pending, batchId);
              } else {
                await fail<system>(rt, ctx, pending, batchId, "chunk pull failed for " # entry.key # ": " # debug_show e);
              };
              return;
            };
          };
        };

        if (not Blob.equal(digest.sum(), entry.sha256)) {
          await fail<system>(rt, ctx, pending, batchId, "sha256 mismatch for pulled file " # entry.key);
          return;
        };
        rt.pulledFiles += 1;

        Vector.add(
          operations,
          #CreateAsset({
            key = entry.key;
            content_type = entry.contentType;
            headers = ?[];
            allow_raw_access = ?false;
            max_age = null;
            enable_aliasing = ?Text.endsWith(entry.key, #text "index.html");
          }),
        );
        Vector.add(
          operations,
          #SetAssetContent({
            key = entry.key;
            sha256 = ?entry.sha256;
            chunk_ids = Vector.toArray(chunkIds);
            content_encoding = contentEncodingOf(entry.key);
          }),
        );
      };

      // 4. Delete stale + changed assets (user assets are never touched)
      rt.stage := "deleting";
      for (key in Vector.vals(staleKeys)) {
        ignore assetStore.delete_asset(ctx.owner, { key });
      };
      for (key in Vector.vals(changedKeys)) {
        ignore assetStore.delete_asset(ctx.owner, { key });
      };

      // 5. Commit
      rt.stage := "committing";
      if (Vector.size(operations) > 0) {
        switch (await* assetStore.commit_batch(ctx.owner, { batch_id; operations = Vector.toArray(operations) })) {
          case (#ok) batchId := null;
          case (#err(e)) {
            await fail<system>(rt, ctx, pending, batchId, "commit_batch failed: " # e);
            return;
          };
        };
      } else {
        dropBatch(ctx, batchId);
        batchId := null;
      };

      let treeHashMatched = switch (pending.expectedTreeHash) {
        case (?expected) ?Blob.equal(ctx.computeTreeHash(), expected);
        case null null;
      };

      // 6. Report completion
      rt.stage := "reporting";
      await backend.completeFrontendInstall({
        versionKey;
        result = #ok({
          pulledFiles = rt.pulledFiles;
          pulledBytes = rt.pulledBytes;
          skippedFiles;
          skippedBytes;
          staleDeletedFiles = Vector.size(staleKeys);
          changedDeletedFiles = Vector.size(changedKeys);
          treeHashMatched;
        });
      });

      rt.stage := "completed";
      rt.lastError := null;
      rt.attempts := 0;
      ctx.clearPending(versionKey);
      rt.running := false;
      // A superseding install may be pending by now — pick it up
      start<system>(rt, ctx);
    } catch (error) {
      await fail<system>(rt, ctx, pending, batchId, "frontend pull failed: " # Error.message(error));
    };
  };
};
