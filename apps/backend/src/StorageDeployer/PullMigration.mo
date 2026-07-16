import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Queue "mo:core/Queue";
import Set "mo:core/Set";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import IC "mo:ic/Types";
import MemoryRegion "mo:memory-region/MemoryRegion";
import HttpAssetsTypes "mo:http-assets/BaseAssets/Types";
import Vector "mo:vector";

import GitHubReleases "GitHubReleases";
import IncGzipDecoder "IncGzipDecoder";
import StorageDeployerOrchestrator "lib";
import TarExtractor "TarExtractor";
import Types "Types";
import WasmInstaller "WasmInstaller";

/// One-shot migration for the push → pull frontend-install rework.
///
/// The unified queue and the per-version tar stores sit inside mutable
/// containers, whose element types are invariant under `--stable-compatible`:
/// dropping `files` from TarExtractor.Store or adding the #FrontendStartPull
/// task variant is impossible without an explicit migration. Both structures
/// are also disposable — the queue is cleared on every upgrade anyway, and
/// versions are lazily re-added from downloaded releases — so this migration
/// deallocates the push-era tar copies and rebuilds both empty with the new
/// types. Drop after a successful mainnet upgrade.
module PullMigration {
  type OldExtractionStatus = {
    #Idle;
    #Decoding : Types.Progress;
    #Complete;
  };

  type OldTarExtractorStore = {
    files : Set.Set<Types.File>;
    pointer : Types.SizedPointer;
    region : MemoryRegion.MemoryRegion;
    gzipDecoder : IncGzipDecoder.Store;
    isGzipped : Bool;
    var status : OldExtractionStatus;
    var decompressedPointer : ?Types.SizedPointer;
  };

  type OldUploadingStatusMutable = {
    var processed : Nat;
    total : Nat;
    var processedFilesCount : Nat;
    totalFilesCount : Nat;
  };

  type OldInstallStatusMutable = {
    #Uploading : OldUploadingStatusMutable;
    #Committing;
    #Failed : Text;
    #Completed;
  };

  type OldDiagnosticsMutable = {
    totalFiles : Nat;
    totalBytes : Nat;
    var processedFiles : Nat;
    var processedBytes : Nat;
    var uploadedFiles : Nat;
    var uploadedBytes : Nat;
    var skippedFiles : Nat;
    var skippedBytes : Nat;
    var staleDeletedFiles : Nat;
    var changedDeletedFiles : Nat;
    batchesTotal : Nat;
    var batchesProcessed : Nat;
    var stage : Text;
    startedAt : Time.Time;
    var updatedAt : Time.Time;
    var completedAt : ?Time.Time;
    var error : ?Text;
  };

  type OldFrontendInstallerStore = {
    versions : Map.Map<Text, OldTarExtractorStore>;
    region : MemoryRegion.MemoryRegion;
    batches : Map.Map<Principal, Nat>;
    operations : Map.Map<Principal, Vector.Vector<HttpAssetsTypes.BatchOperationKind>>;
    statuses : Map.Map<Principal, OldInstallStatusMutable>;
    diagnostics : Map.Map<Principal, OldDiagnosticsMutable>;
    upgrading : Map.Map<Principal, Bool>;
    existingAssets : Map.Map<Principal, Map.Map<Text, Blob>>;
    newFrontendKeys : Map.Map<Principal, Map.Map<Text, ()>>;
  };

  type OldUnifiedTaskType = {
    #Orchestrator : Types.OrchestratorTask;
    #WasmUploadChunk : {
      canisterId : Principal;
      chunkIndex : Nat;
      chunk : Blob;
      totalChunks : Nat;
    };
    #WasmInstallCode : {
      canisterId : Principal;
      wasmModule : Blob;
      wasmHash : Blob;
      initArg : Blob;
      mode : IC.CanisterInstallMode;
    };
    #WasmInstallChunked : {
      canisterId : Principal;
      wasmHash : Blob;
      initArg : Blob;
      mode : IC.CanisterInstallMode;
    };
    #FrontendCreateBatch : { canisterId : Principal };
    #FrontendUploadChunks : {
      canisterId : Principal;
      files : [Types.File];
    };
    #FrontendCommitBatch : { canisterId : Principal };
    #RevokeInstallerPermission : { canisterId : Principal };
  };

  type OldUnifiedTask = {
    id : Nat;
    creationId : Nat;
    owner : Principal;
    taskType : OldUnifiedTaskType;
    var attempts : Nat;
  };

  type OldStore = {
    var canisterId : ?Principal;
    region : MemoryRegion.MemoryRegion;
    var vetKeyName : ?Text;
    var cashierCanisterId : ?Principal;
    githubReleases : GitHubReleases.Store;
    wasmInstaller : WasmInstaller.Store;
    frontendInstaller : OldFrontendInstallerStore;
    unifiedQueue : Queue.Queue<OldUnifiedTask>;
    var githubTimerId : ?Timer.TimerId;
    var downloaderTimerId : ?Timer.TimerId;
    var unifiedTimerId : ?Timer.TimerId;
    var retryTimerId : ?Timer.TimerId;
    var running : Bool;
    var lastFetchError : ?Text;
    var lastFetchTime : ?Time.Time;
    var fetchRetryCount : Nat;
    var nextTaskId : Nat;
    var nextCreationId : Nat;
  };

  public func run(old : { storageOrchestrator : OldStore }) : {
    storageOrchestrator : StorageDeployerOrchestrator.Store;
  } {
    let o = old.storageOrchestrator;

    // Push-era version entries own their tar copies (`addBlob` in the old
    // tryStartFrontendExtraction) and, for gzipped sources, a decompressed
    // copy. Reclaim both — new entries alias downloader-owned memory instead.
    for ((_, extractor) in Map.entries(o.frontendInstaller.versions)) {
      switch (extractor.decompressedPointer) {
        case (?(address, size)) {
          if (size > 0) MemoryRegion.deallocate(o.region, address, size);
        };
        case null {};
      };
      let (address, size) = extractor.pointer;
      if (size > 0) MemoryRegion.deallocate(o.region, address, size);
    };

    {
      storageOrchestrator = {
        var canisterId = o.canisterId;
        region = o.region;
        var vetKeyName = o.vetKeyName;
        var cashierCanisterId = o.cashierCanisterId;
        githubReleases = o.githubReleases;
        wasmInstaller = o.wasmInstaller;
        frontendInstaller = {
          versions = Map.empty<Text, TarExtractor.Store>();
          region = o.region;
        };
        unifiedQueue = Queue.empty<Types.UnifiedTask>();
        var githubTimerId = o.githubTimerId;
        var downloaderTimerId = o.downloaderTimerId;
        var unifiedTimerId = o.unifiedTimerId;
        var retryTimerId = o.retryTimerId;
        var running = o.running;
        var lastFetchError = o.lastFetchError;
        var lastFetchTime = o.lastFetchTime;
        var fetchRetryCount = o.fetchRetryCount;
        var nextTaskId = o.nextTaskId;
        var nextCreationId = o.nextCreationId;
      };
    };
  };
};
