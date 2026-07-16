import Array "mo:core/Array";
import Blob "mo:core/Blob";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Nat "mo:core/Nat";
import Option "mo:core/Option";
import Queue "mo:core/Queue";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import FrontendInstaller "FrontendInstaller";
import GitHubReleases "GitHubReleases";
import HttpDownloader "HttpDownloader";

module StorageReleaseRuntime {
  public type ExtractionStatus = GitHubReleases.ExtractionStatus;
  public type ReleasesFullStatus = GitHubReleases.ReleasesFullStatus;
  public type ReleaseListTransformArg = GitHubReleases.TransformArg;
  public type ReleaseListTransform = ?GitHubReleases.Transform;

  type Store = {
    region : MemoryRegion.MemoryRegion;
    githubReleases : GitHubReleases.Store;
    frontendInstaller : FrontendInstaller.Store;

    var downloaderTimerId : ?Timer.TimerId;
    var retryTimerId : ?Timer.TimerId;
    var running : Bool;

    var lastFetchError : ?Text;
    var lastFetchTime : ?Time.Time;
    var fetchRetryCount : Nat;
  };

  let MAX_GITHUB_RETRY_ATTEMPTS : Nat = 3;
  let INITIAL_RETRY_DELAY_SECONDS : Nat = 5;

  func cancelTimer(timerId : ?Timer.TimerId) {
    switch (timerId) {
      case (?id) Timer.cancelTimer(id);
      case null {};
    };
  };

  /// Queue downloads for a concrete release tag that is already present in
  /// `store.githubReleases`. Does not require the orchestrator to be running,
  /// so callers can use it while reporting `#ReleaseNotReady`.
  public func prepareReleaseDownloads<system>(store : Store, cache : FrontendInstaller.IndexCache, releaseTag : Text, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : Result.Result<(), Text> {
    switch (GitHubReleases.prepareReleaseDownloads(store.githubReleases, releaseTag)) {
      case (#ok(invalidated)) {
        handleInvalidatedAssets<system>(store, cache, invalidated);
        ensureDownloaderTimer<system>(store, cache, onAssetDownloaded);
        tryStartFrontendExtraction<system>(store, cache);
        #ok;
      };
      case (#err(message)) #err(message);
    };
  };

  /// Queue downloads for a concrete release tag through the public/manual API.
  public func prepareStorageRelease<system>(store : Store, cache : FrontendInstaller.IndexCache, releaseTag : Text, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : Result.Result<(), Text> {
    if (not store.running) return #err("Storage deployer is not running");
    prepareReleaseDownloads<system>(store, cache, releaseTag, onAssetDownloaded);
  };

  public func ensureDownloaderTimer<system>(store : Store, cache : FrontendInstaller.IndexCache, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) {
    if (Queue.isEmpty(store.githubReleases.downloaderStore.requests)) {
      cancelTimer(store.downloaderTimerId);
      store.downloaderTimerId := null;

      tryStartFrontendExtraction<system>(store, cache);

      if (not Queue.isEmpty(store.githubReleases.downloaderStore.requests) and Option.isNull(store.downloaderTimerId)) {
        store.downloaderTimerId := ?Timer.recurringTimer<system>(
          #milliseconds 100,
          func() : async () {
            await HttpDownloader.runRequests(store.githubReleases.downloaderStore, onAssetDownloaded);
            ensureDownloaderTimer<system>(store, cache, onAssetDownloaded);
          },
        );
      };
    } else if (Option.isNull(store.downloaderTimerId)) {
      store.downloaderTimerId := ?Timer.recurringTimer<system>(
        #milliseconds 100,
        func() : async () {
          await HttpDownloader.runRequests(store.githubReleases.downloaderStore, onAssetDownloaded);
          ensureDownloaderTimer<system>(store, cache, onAssetDownloaded);
        },
      );
    };
  };

  public func checkAndDownloadReleases<system>(store : Store, cache : FrontendInstaller.IndexCache, transform : ReleaseListTransform, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : async () {
    cancelTimer(store.retryTimerId);
    store.retryTimerId := null;

    switch (await GitHubReleases.listReleases(store.githubReleases, transform)) {
      case (#ok({ invalidated })) {
        store.fetchRetryCount := 0;
        store.lastFetchError := null;
        store.lastFetchTime := ?Time.now();

        handleInvalidatedAssets<system>(store, cache, invalidated);
        ensureDownloaderTimer<system>(store, cache, onAssetDownloaded);
        tryStartFrontendExtraction<system>(store, cache);
      };
      case (#err(errorMsg)) {
        store.lastFetchError := ?errorMsg;
        store.lastFetchTime := ?Time.now();

        if (store.fetchRetryCount < MAX_GITHUB_RETRY_ATTEMPTS) {
          store.fetchRetryCount += 1;

          let delaySeconds = INITIAL_RETRY_DELAY_SECONDS * Nat.pow(2, store.fetchRetryCount - 1);

          store.retryTimerId := ?Timer.setTimer<system>(
            #seconds delaySeconds,
            func() : async () {
              if (store.running) {
                await checkAndDownloadReleases<system>(store, cache, transform, onAssetDownloaded);
              };
            },
          );
        };
      };
    };
  };

  public func getExtractionStatus(store : Store, cache : FrontendInstaller.IndexCache, versionKey : Text) : ExtractionStatus {
    switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, versionKey)) {
      case (#Idle) #Idle;
      case (#Decoding(progress)) #Decoding({
        processed = progress.processed;
        total = progress.total;
      });
      case (#Complete) #Complete(FrontendInstaller.fileMetadata(store.frontendInstaller, cache, versionKey));
      case (#Failed(error)) #Failed(error);
    };
  };

  public func isFrontendExtractionComplete(store : Store) : Bool {
    switch (GitHubReleases.latestStorageFrontend(store.githubReleases)) {
      case (#ok(details)) {
        switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, details.key)) {
          case (#Complete) true;
          case _ false;
        };
      };
      case (#err(_)) false;
    };
  };

  public func createExtractionInfoProvider(store : Store, cache : FrontendInstaller.IndexCache) : GitHubReleases.ExtractionInfoProvider {
    {
      getExtractionStatus = func(versionKey : Text) : GitHubReleases.ExtractionStatus {
        getExtractionStatus(store, cache, versionKey);
      };
    };
  };

  public func getStorageReleaseAdminStatus(store : Store, cache : FrontendInstaller.IndexCache) : GitHubReleases.ReleasesFullStatus {
    GitHubReleases.getFullStatus(store.githubReleases, createExtractionInfoProvider(store, cache));
  };

  public func refreshStorageReleaseIndex<system>(store : Store, cache : FrontendInstaller.IndexCache, transform : ReleaseListTransform, onAssetDownloaded : ?((HttpDownloader.DownloadDetails) -> ())) : async () {
    if (not store.running) return;

    store.fetchRetryCount := 0;
    store.lastFetchError := null;

    cancelTimer(store.retryTimerId);
    store.retryTimerId := null;

    await checkAndDownloadReleases<system>(store, cache, transform, onAssetDownloaded);
  };

  public func getDownloadedWasmHashes(store : Store) : [(Blob, Text)] {
    Array.map<(Text, HttpDownloader.DownloadDetails), (Blob, Text)>(
      GitHubReleases.downloadedStorageWasms(store.githubReleases),
      func((_, details)) = (details.sha256, details.key),
    );
  };

  public func getWasmBlob(store : Store, releaseTag : Text) : Result.Result<Blob, Text> {
    switch (GitHubReleases.storageWasm(store.githubReleases, releaseTag)) {
      case (#ok(details)) #ok(details.content);
      case (#err(e)) #err(e);
    };
  };

  public func getWasmHash(store : Store, releaseTag : Text) : Result.Result<Blob, Text> {
    GitHubReleases.storageWasmHash(store.githubReleases, releaseTag);
  };

  public func getFrontendVersionKey(store : Store, releaseTag : Text) : Result.Result<Text, Text> {
    switch (GitHubReleases.storageFrontend(store.githubReleases, releaseTag)) {
      case (#ok(details)) #ok(details.key);
      case (#err(message)) #err(message);
    };
  };

  public func ensureDeploymentReady(store : Store, releaseTag : Text) : Result.Result<(), Text> {
    switch (GitHubReleases.releaseManifestError(store.githubReleases, releaseTag)) {
      case (?message) return #err("Release " # releaseTag # " is not ready: " # message);
      case null {};
    };

    switch (GitHubReleases.storageWasm(store.githubReleases, releaseTag)) {
      case (#ok(_)) {};
      case (#err(message)) return #err("Release " # releaseTag # " WASM is not ready: " # message);
    };

    let frontend = switch (GitHubReleases.storageFrontend(store.githubReleases, releaseTag)) {
      case (#ok(details)) details;
      case (#err(message)) return #err("Release " # releaseTag # " frontend is not ready: " # message);
    };

    switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, frontend.key)) {
      case (#Complete) #ok;
      case _ #err("Release " # releaseTag # " frontend is not extracted");
    };
  };

  func tryStartFrontendExtraction<system>(store : Store, cache : FrontendInstaller.IndexCache) {
    for ((_, details) in GitHubReleases.downloadedStorageFrontendPointers(store.githubReleases).vals()) {
      switch (FrontendInstaller.getExtractionStatus(store.frontendInstaller, details.key)) {
        case (#Idle) {
          FrontendInstaller.add<system>(
            store.frontendInstaller,
            cache,
            {
              versionKey = details.key;
              contentPointer = details.pointer;
              isGzipped = Text.endsWith(details.name, #text ".gz");
            },
          );
        };
        case _ {};
      };
    };
  };

  func handleInvalidatedAssets<system>(store : Store, cache : FrontendInstaller.IndexCache, invalidated : [GitHubReleases.InvalidatedAsset]) {
    for ({ key; kind } in invalidated.vals()) {
      switch (kind) {
        case (#StorageFrontend) {
          FrontendInstaller.invalidateVersion<system>(store.frontendInstaller, cache, key);
        };
        case (#StorageWASM) {};
        case (#StorageReleaseManifest) {};
      };
    };
  };
};
