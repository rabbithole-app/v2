import Result "mo:core/Result";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Error "mo:core/Error";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Set "mo:core/Set";
import Order "mo:core/Order";
import Iter "mo:core/Iter";
import Option "mo:core/Option";
import List "mo:core/List";
import Int "mo:core/Int";

import IC "mo:ic";
import Hex "mo:hex";
import Vector "mo:vector";
import MemoryRegion "mo:memory-region/MemoryRegion";

import Types "GitHubReleasesTypes";
import HttpDownloader "HttpDownloader";
import Parser "GitHubReleasesParser";
import ManifestPolicy "ReleaseManifestPolicy";
import ReleaseTags "ReleaseTags";
import SemVer "SemVer";

module {
  let HTTP_OUTCALL_CYCLES : Nat = 50_000_000_000; // 50B cycles per HTTP request
  let MAX_RESPONSE_BYTES : Nat64 = 1_500_000; // 1.5MB response limit (buffer for headers)

  func compareHeaders(a : IC.HttpHeader, b : IC.HttpHeader) : Order.Order = Text.compare(a.name, b.name);
  func compareReleases(a : Types.Release, b : Types.Release) : Order.Order = Text.compare(a.tagName, b.tagName);
  func comparePublishedAt(a : Types.Release, b : Types.Release) : Order.Order = Int.compare(Option.get(a.publishedAt, a.createdAt), Option.get(b.publishedAt, b.createdAt));
  func compareReleaseVersion(a : Types.Release, b : Types.Release) : Order.Order {
    switch (SemVer.compareText(ReleaseTags.version(a.tagName), ReleaseTags.version(b.tagName))) {
      case (#equal) comparePublishedAt(a, b);
      case order order;
    };
  };

  // -- Re-exported Types --

  public type Release = Types.Release;
  public type Asset = Types.Asset;
  public type GithubAssetKind = Types.GithubAssetKind;
  public type GithubAsset = Types.GithubAsset;
  public type GithubOptions = Types.GithubOptions;
  public type ReleaseSelector = Types.ReleaseSelector;
  public type AssetDownloadStatus = Types.AssetDownloadStatus;
  public type AssetInfo = Types.AssetInfo;
  public type ReleaseInfo = Types.ReleaseInfo;
  public type ReleasesStatus = Types.ReleasesStatus;
  public type FileMetadata = Types.FileMetadata;
  public type ExtractionStatus = Types.ExtractionStatus;
  public type AssetFullStatus = Types.AssetFullStatus;
  public type ReleaseFullStatus = Types.ReleaseFullStatus;
  public type ReleasesFullStatus = Types.ReleasesFullStatus;
  public type StorageReleaseManifest = Types.StorageReleaseManifest;
  public type ExtractionInfoProvider = Types.ExtractionInfoProvider;
  public type InvalidatedAsset = Types.InvalidatedAsset;
  public type ListReleasesResult = Types.ListReleasesResult;

  // -- Store --

  /// GitHub releases store containing release data and download state
  public type Store = {
    var github : GithubOptions;
    releases : Set.Set<Types.Release>;
    var assets : [(ReleaseSelector, [GithubAsset])]; // (release selector, (storage wasm asset, storage frontend asset))
    downloaderStore : HttpDownloader.Store;
  };

  // -- Helper Functions --

  func findRelease(releases : Set.Set<Types.Release>, draft : Bool, prerelease : Bool) : ?Types.Release {
    Set.values(releases) |> Iter.filterMap<Types.Release, Types.Release>(
      _,
      func(release : Types.Release) : ?Types.Release = if (release.draft == draft and release.prerelease == prerelease) ?release else null,
    ) |> Iter.sort(_, compareReleaseVersion) |> Iter.reverse(_) |> _.next();
  };

  func sortedReleasesDesc(releases : Set.Set<Types.Release>) : [Types.Release] {
    Set.values(releases) |> Iter.sort(_, compareReleaseVersion) |> Iter.reverse(_) |> Iter.toArray(_);
  };

  // Find release by specific tag
  func findReleaseByTag(releases : Set.Set<Types.Release>, tagName : Text) : ?Types.Release {
    Set.values(releases) |> Iter.find<Types.Release>(_, func(release : Types.Release) : Bool = release.tagName == tagName);
  };

  // Find release by selector
  func findReleaseBySelector(releases : Set.Set<Types.Release>, selector : ReleaseSelector) : ?Types.Release {
    switch (selector) {
      case (#Latest) findRelease(releases, false, false);
      case (#LatestDraft) findRelease(releases, true, false);
      case (#LatestPrerelease) findRelease(releases, false, true);
      case (#Version(tag)) findReleaseByTag(releases, tag);
    };
  };

  func configuredAssetNameAndKind(asset : Types.GithubAsset) : (Text, Types.GithubAssetKind) {
    switch (asset) {
      case (#StorageWASM name) (name, #StorageWASM);
      case (#StorageFrontend name) (name, #StorageFrontend);
      case (#StorageReleaseManifest name) (name, #StorageReleaseManifest);
    };
  };

  // -- Public Functions --

  /// Create a new GitHub releases store
  ///
  /// Example:
  /// ```motoko
  /// let store = GitHubReleases.new({
  ///   github = {
  ///     apiUrl = "https://api.github.com"
  ///     owner = "my-org";
  ///     repo = "my-repo";
  ///     token = ?"ghp_xxx";
  ///   };
  ///   assets = [(#Latest, [#StorageWASM("app.wasm")])];
  ///   region = null;
  /// });
  /// ```
  public func new({ github; assets; region } : Types.Options) : Store {
    {
      var github = github;
      releases = Set.empty();
      downloaderStore = HttpDownloader.new({
        httpHeaders = getHeaders(github.token) |> Set.values(_) |> Iter.toArray(_);
        region;
      });
      var assets = assets;
    };
  };

  public func configure(store : Store, { github; assets } : { github : GithubOptions; assets : [(ReleaseSelector, [GithubAsset])] }) {
    store.github := github;
    store.assets := assets;
    Set.clear(store.downloaderStore.httpHeaders);
    Set.addAll(store.downloaderStore.httpHeaders, compareHeaders, Set.values(getHeaders(github.token)));
  };

  /// Fetch releases from GitHub API and start downloading configured assets
  ///
  /// Returns releases and a list of invalidated assets (assets whose hash changed).
  /// The caller should handle invalidation (e.g., clear extracted frontend files).
  public func listReleases(store : Store) : async Result.Result<ListReleasesResult, Text> {
    let url = store.github.apiUrl # "/repos/" # store.github.owner # "/" # store.github.repo # "/releases";
    let headers = getHeaders(store.github.token) |> Set.values(_) |> Iter.toArray(_);

    // Make HTTP request
    let request : IC.HttpRequestArgs = {
      url;
      max_response_bytes = ?MAX_RESPONSE_BYTES;
      headers;
      body = null;
      method = #get;
      transform = null;
      is_replicated = null;
    };

    try {
      let response = await (with cycles = HTTP_OUTCALL_CYCLES) IC.ic.http_request(request);

      // Check status code
      if (response.status < 200 or response.status >= 300) {
        return #err("GitHub API returned status " # Nat.toText(response.status));
      };

      let releases = switch (Parser.parseReleasesBody(response.body)) {
        case (#ok(releases)) releases;
        case (#err(message)) return #err(message);
      };

      // Replace releases with fresh data from GitHub API
      Set.clear(store.releases);
      for (release in releases.vals()) {
        Set.add(store.releases, compareReleases, release);
      };

      // Track invalidated assets (hash changed)
      let invalidated = Vector.new<InvalidatedAsset>();

      // Keep the release index light: every release needs manifest metadata for
      // SemVer/compatibility planning, while heavy install assets are prepared
      // only for configured creation selectors or an explicitly selected tag.
      let assets = configuredAssets(store);
      for (release in releases.vals()) {
        for (asset in assets.vals()) {
          switch (asset) {
            case (#StorageReleaseManifest(assetName)) queueAssetDownload(store, release, assetName, #StorageReleaseManifest, invalidated);
            case _ {};
          };
        };
      };

      for ((selector, selectedAssets) in store.assets.vals()) {
        switch (findReleaseBySelector(store.releases, selector)) {
          case (?release) {
            for (asset in selectedAssets.vals()) {
              let (assetName, assetKind) = configuredAssetNameAndKind(asset);
              queueAssetDownload(store, release, assetName, assetKind, invalidated);
            };
          };
          case null {};
        };
      };

      #ok({ releases; invalidated = Vector.toArray(invalidated) });
    } catch (error) {
      #err("HTTP request failed: " # Error.message(error));
    };
  };

  /// Queue configured storage assets for a concrete release tag.
  ///
  /// Release metadata must already be present from `listReleases`; this call
  /// only schedules asset downloads and re-downloads changed/failed assets.
  public func prepareReleaseDownloads(store : Store, releaseTag : Text) : Result.Result<[InvalidatedAsset], Text> {
    let ?release = findReleaseByTag(store.releases, releaseTag) else return #err("Release not found: " # releaseTag);
    let invalidated = Vector.new<InvalidatedAsset>();

    for (asset in configuredAssets(store).vals()) {
      let (assetName, assetKind) = configuredAssetNameAndKind(asset);
      queueAssetDownload(store, release, assetName, assetKind, invalidated);
    };

    #ok(Vector.toArray(invalidated));
  };

  /// Get the latest storage WASM download details
  public func latestStorageWasm(store : Store) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    latestReleaseAsset(store, #StorageWASM);
  };

  /// Get storage WASM download details for a concrete release tag.
  public func storageWasm(store : Store, releaseTag : Text) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    releaseAsset(store, releaseTag, #StorageWASM);
  };

  /// Get storage WASM hash for a concrete release tag.
  ///
  /// Prefer the downloaded asset hash when available, but fall back to the
  /// validated manifest so upgrade planning does not require the heavy WASM
  /// artifact to be downloaded first.
  public func storageWasmHash(store : Store, releaseTag : Text) : Result.Result<Blob, Text> {
    switch (storageWasm(store, releaseTag)) {
      case (#ok(details)) #ok(details.sha256);
      case (#err(_)) storageArtifactHash(store, releaseTag, #StorageWASM);
    };
  };

  /// Get the latest storage frontend download details
  public func latestStorageFrontend(store : Store) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    latestReleaseAsset(store, #StorageFrontend);
  };

  /// Get storage frontend download details for a concrete release tag.
  public func storageFrontend(store : Store, releaseTag : Text) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    releaseAsset(store, releaseTag, #StorageFrontend);
  };

  /// Get storage release manifest download details for a concrete release tag.
  public func storageReleaseManifest(store : Store, releaseTag : Text) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    releaseAsset(store, releaseTag, #StorageReleaseManifest);
  };

  /// Get the downloaded and validated storage-release.json for a concrete release tag.
  public func storageReleaseManifestParsed(store : Store, releaseTag : Text) : Result.Result<StorageReleaseManifest, Text> {
    let ?release = findReleaseByTag(store.releases, releaseTag) else return #err("No release found for tag " # releaseTag);
    let assets = configuredAssets(store);
    let (manifest, manifestError) = getReleaseManifest(store, release, assets);

    switch (manifestError) {
      case (?message) return #err(message);
      case null {};
    };

    let ?parsedManifest = manifest else return #err("storage-release.json is not downloaded");
    switch (ManifestPolicy.validate(release, parsedManifest, assets)) {
      case (?message) #err(message);
      case null #ok(parsedManifest);
    };
  };

  /// Get the frontend asset-tree hash declared by storage-release.json.
  public func storageFrontendAssetTreeHash(store : Store, releaseTag : Text) : Result.Result<Blob, Text> {
    let ?release = findReleaseByTag(store.releases, releaseTag) else return #err("No release found for tag " # releaseTag);
    let (manifest, manifestError) = getReleaseManifest(store, release, configuredAssets(store));

    switch (manifestError) {
      case (?message) return #err(message);
      case null {};
    };

    switch (manifest) {
      case (?(parsedManifest)) {
        switch (parsedManifest.frontendAssetTreeHash) {
          case (?hash) #ok(hash);
          case null #err("storage-release.json missing frontendAssetTreeHash");
        };
      };
      case null #err("storage-release.json is not downloaded");
    };
  };

  /// Resolve a selector against the currently fetched GitHub releases.
  public func getReleaseTagName(store : Store, selector : ReleaseSelector) : ?Text {
    Option.map(findReleaseBySelector(store.releases, selector), func(r : Types.Release) : Text = r.tagName);
  };

  /// Get the tag name of the latest release
  ///
  /// Returns the tag for `#Latest` selector, or the first available selector's release
  public func getLatestReleaseTagName(store : Store) : ?Text {
    // First, try to find #Latest selector
    let optRelease = switch (Iter.fromArray(store.assets) |> Iter.find<(ReleaseSelector, [GithubAsset])>(_, func(sel : ReleaseSelector, _ : [GithubAsset]) : Bool = switch (sel) { case (#Latest) true; case _ false })) {
      case (?(_selector, _assets)) findReleaseBySelector(store.releases, #Latest);
      case null {
        // If #Latest not found, take the first available selector
        switch (Iter.fromArray(store.assets) |> _.next()) {
          case (?(selector, _assets)) findReleaseBySelector(store.releases, selector);
          case null null;
        };
      };
    };
    Option.map(optRelease, func(r : Types.Release) : Text = r.tagName);
  };

  /// Get all downloaded storage frontend archive details.
  public func downloadedStorageFrontends(store : Store) : [(Text, HttpDownloader.DownloadDetails)] {
    let frontends = Vector.new<(Text, HttpDownloader.DownloadDetails)>();
    let ?assetName = configuredAssetName(store, #StorageFrontend) else return [];

    for (release in sortedReleasesDesc(store.releases).vals()) {
      let key = release.tagName # "/" # assetName;
      switch (HttpDownloader.get(store.downloaderStore, key)) {
        case (#ok(details)) Vector.add(frontends, (release.tagName, details));
        case (#err(_)) {};
      };
    };

    Vector.toArray(frontends);
  };

  /// Get all downloaded storage WASM archive details.
  public func downloadedStorageWasms(store : Store) : [(Text, HttpDownloader.DownloadDetails)] {
    let wasms = Vector.new<(Text, HttpDownloader.DownloadDetails)>();
    let ?assetName = configuredAssetName(store, #StorageWASM) else return [];

    for (release in sortedReleasesDesc(store.releases).vals()) {
      let key = release.tagName # "/" # assetName;
      switch (HttpDownloader.get(store.downloaderStore, key)) {
        case (#ok(details)) Vector.add(wasms, (release.tagName, details));
        case (#err(_)) {};
      };
    };

    Vector.toArray(wasms);
  };

  // -- Status Query Functions --

  // Get the download status of a specific asset by key
  func getAssetDownloadStatus(store : Store, key : Text) : AssetDownloadStatus {
    switch (HttpDownloader.find(store.downloaderStore, key)) {
      case null #NotStarted;
      case (?download) {
        // Check if download is completed (hash is set when all chunks are merged)
        switch (download.hash) {
          case (?_hash) #Completed({ size = download.size });
          case null {
            // Download is in progress, count chunk statuses
            var chunksTotal : Nat = 0;
            var chunksCompleted : Nat = 0;
            var chunksError : Nat = 0;
            var firstError : ?Text = null;

            for ((_, status) in Map.entries(download.chunkStatuses)) {
              chunksTotal += 1;
              switch (status) {
                case (#Downloaded _) chunksCompleted += 1;
                case (#Error message) {
                  chunksError += 1;
                  if (firstError == null) firstError := ?message;
                };
                case _ {};
              };
            };

            if (chunksError > 0) {
              #Error("Some chunks failed to download: " # Option.get(firstError, "unknown error"));
            } else {
              #Downloading({
                chunksTotal;
                chunksCompleted;
                chunksError;
              });
            };
          };
        };
      };
    };
  };

  /// Get status summary of all releases and their download progress
  public func getStatus(store : Store) : ReleasesStatus {
    var pendingDownloads : Nat = 0;
    var completedDownloads : Nat = 0;

    let releaseInfos = Vector.new<ReleaseInfo>();

    for (release in sortedReleasesDesc(store.releases).vals()) {
      let assetInfos = Vector.new<AssetInfo>();

      for (asset in release.assets.vals()) {
        let key = release.tagName # "/" # asset.name;
        let downloadStatus = getAssetDownloadStatus(store, key);

        switch (downloadStatus) {
          case (#Completed _) completedDownloads += 1;
          case (#Downloading _) pendingDownloads += 1;
          case (#NotStarted) {};
          case (#Error _) {};
        };

        Vector.add(
          assetInfos,
          {
            name = asset.name;
            size = asset.size;
            contentType = asset.contentType;
            downloadStatus;
          },
        );
      };

      Vector.add(
        releaseInfos,
        {
          tagName = release.tagName;
          htmlUrl = release.htmlUrl;
          name = release.name;
          draft = release.draft;
          prerelease = release.prerelease;
          createdAt = release.createdAt;
          publishedAt = release.publishedAt;
          assets = Vector.toArray(assetInfos);
        },
      );
    };

    {
      releasesCount = Set.size(store.releases);
      pendingDownloads;
      completedDownloads;
      releases = Vector.toArray(releaseInfos);
    };
  };

  /// Check if all configured assets for a release selector are downloaded
  public func isReleaseDownloaded(store : Store, selector : ReleaseSelector) : Bool {
    // Find the release
    let ?release = findReleaseBySelector(store.releases, selector) else return false;

    // Find configured assets for this selector
    let ?(_sel, configuredAssets) = Iter.fromArray(store.assets) |> Iter.find(
      _,
      func((sel, _) : (ReleaseSelector, [GithubAsset])) : Bool = compareSelectorsByKind(sel, selector),
    ) else return false;

    // Check each configured asset
    for (asset in configuredAssets.vals()) {
      let (assetName, _) = configuredAssetNameAndKind(asset);
      let key = release.tagName # "/" # assetName;
      let status = getAssetDownloadStatus(store, key);
      switch (status) {
        case (#Completed _) {};
        case _ return false;
      };
    };

    true;
  };

  /// Check if a release is ready for deployment
  ///
  /// A release is deployment ready when all assets are downloaded, frontend
  /// archives are fully extracted, and storage-release.json is supported.
  public func isReleaseDeploymentReady(store : Store, selector : ReleaseSelector, extractionProvider : ExtractionInfoProvider) : Bool {
    // First check if downloaded
    if (not isReleaseDownloaded(store, selector)) return false;

    // Find the release
    let ?release = findReleaseBySelector(store.releases, selector) else return false;

    // Find configured assets for this selector
    let ?(_sel, configuredAssets) = Iter.fromArray(store.assets) |> Iter.find(
      _,
      func((sel, _) : (ReleaseSelector, [GithubAsset])) : Bool = compareSelectorsByKind(sel, selector),
    ) else return false;

    // Check if frontend is extracted (if there's a frontend asset)
    for (asset in configuredAssets.vals()) {
      switch (asset) {
        case (#StorageFrontend(name)) {
          let versionKey = release.tagName # "/" # name;
          let extractionStatus = extractionProvider.getExtractionStatus(versionKey);
          switch (extractionStatus) {
            case (#Complete _) {};
            case _ return false;
          };
        };
        case _ {};
      };
    };

    Option.isNull(releaseManifestValidationError(store, release, configuredAssets, true));
  };

  /// Returns null only when the release has a downloaded, supported manifest.
  public func releaseManifestError(store : Store, releaseTag : Text) : ?Text {
    let ?release = findReleaseByTag(store.releases, releaseTag) else return ?("No release found for tag " # releaseTag);
    releaseManifestValidationError(store, release, configuredAssets(store), true);
  };

  // Compare selectors by their kind (ignoring version tag content)
  func compareSelectorsByKind(a : ReleaseSelector, b : ReleaseSelector) : Bool {
    switch (a, b) {
      case (#Latest, #Latest) true;
      case (#LatestDraft, #LatestDraft) true;
      case (#LatestPrerelease, #LatestPrerelease) true;
      case (#Version(_), #Version(_)) true;
      case _ false;
    };
  };

  /// Check if any configured release has all assets downloaded
  public func hasDownloadedRelease(store : Store) : Bool {
    for ((selector, _) in store.assets.vals()) {
      if (isReleaseDownloaded(store, selector)) return true;
    };
    false;
  };

  /// Check if any configured release is deployment ready
  public func hasDeploymentReadyRelease(store : Store, extractionProvider : ExtractionInfoProvider) : Bool {
    for ((selector, _) in store.assets.vals()) {
      if (isReleaseDeploymentReady(store, selector, extractionProvider)) return true;
    };
    false;
  };

  /// Get comprehensive status of all releases including extraction progress
  ///
  /// This is the main status function that provides complete information
  /// about downloads, extraction, and deployment readiness
  public func getFullStatus(store : Store, extractionProvider : ExtractionInfoProvider) : ReleasesFullStatus {
    var pendingDownloads : Nat = 0;
    var completedDownloads : Nat = 0;
    var hasDownloaded = false;
    var hasDeploymentReady = false;

    let releaseInfos = Vector.new<ReleaseFullStatus>();

    let configuredAssetsList = configuredAssets(store);

    for (release in sortedReleasesDesc(store.releases).vals()) {
      let assetInfos = Vector.new<AssetFullStatus>();
      var allAssetsDownloaded = true;
      var allFrontendsExtracted = true;

      for (asset in configuredAssetsList.vals()) {
        let (assetName, _) = configuredAssetNameAndKind(asset);
        let key = release.tagName # "/" # assetName;
        let downloadStatus = getAssetDownloadStatus(store, key);

        // Track download status
        switch (downloadStatus) {
          case (#Completed _) completedDownloads += 1;
          case (#Downloading _) {
            pendingDownloads += 1;
            allAssetsDownloaded := false;
          };
          case (#NotStarted) allAssetsDownloaded := false;
          case (#Error _) allAssetsDownloaded := false;
        };

        let extractionStatus : ?ExtractionStatus = switch (asset) {
          case (#StorageFrontend(name)) {
            let versionKey = release.tagName # "/" # name;
            let status = extractionProvider.getExtractionStatus(versionKey);
            switch (status) {
              case (#Complete _) {};
              case _ allFrontendsExtracted := false;
            };
            ?status;
          };
          case _ null;
        };

        let releaseAssetInfo = Iter.fromArray(release.assets) |> Iter.find(_, func(a : Types.Asset) : Bool = a.name == assetName);

        let size = switch (releaseAssetInfo) {
          case (?a) a.size;
          case null 0;
        };
        let contentType = switch (releaseAssetInfo) {
          case (?a) a.contentType;
          case null "application/octet-stream";
        };

        let sha256 : ?Blob = switch (HttpDownloader.find(store.downloaderStore, key)) {
          case (?download) download.hash;
          case null null;
        };

        Vector.add(
          assetInfos,
          {
            name = assetName;
            size;
            contentType;
            downloadStatus;
            extractionStatus;
            sha256;
          },
        );
      };

      let (manifest, manifestError) = getReleaseManifest(store, release, configuredAssetsList);
      let manifestValidationError = switch (manifestError, manifest) {
        case (?message, _) ?message;
        case (null, ?parsedManifest) ManifestPolicy.validate(release, parsedManifest, configuredAssetsList);
        case (null, null) {
          if (allAssetsDownloaded) {
            ?"storage-release.json is not downloaded";
          } else {
            null;
          };
        };
      };
      let isDownloaded = allAssetsDownloaded;
      let isDeploymentReady = allAssetsDownloaded and allFrontendsExtracted and Option.isNull(manifestValidationError);

      if (isDownloaded) hasDownloaded := true;
      if (isDeploymentReady) hasDeploymentReady := true;

      Vector.add(
        releaseInfos,
        {
          tagName = release.tagName;
          htmlUrl = release.htmlUrl;
          name = release.name;
          draft = release.draft;
          prerelease = release.prerelease;
          createdAt = release.createdAt;
          publishedAt = release.publishedAt;
          assets = Vector.toArray(assetInfos);
          manifest;
          manifestError = manifestValidationError;
          isDownloaded;
          isDeploymentReady;
        },
      );
    };

    {
      releasesCount = Set.size(store.releases);
      pendingDownloads;
      completedDownloads;
      releases = Vector.toArray(releaseInfos);
      hasDownloadedRelease = hasDownloaded;
      hasDeploymentReadyRelease = hasDeploymentReady;
    };
  };

  // -- Private Helper Functions --

  func configuredAssets(store : Store) : [Types.GithubAsset] {
    let unique = Vector.new<Types.GithubAsset>();

    for ((_, assets) in store.assets.vals()) {
      for (asset in assets.vals()) {
        let (_, assetKind) = configuredAssetNameAndKind(asset);
        let exists = Vector.vals(unique) |> Iter.any(
          _,
          func(existing : Types.GithubAsset) : Bool {
            let (_, existingKind) = configuredAssetNameAndKind(existing);
            sameAssetKind(assetKind, existingKind);
          },
        );
        if (not exists) {
          Vector.add(unique, asset);
        };
      };
    };

    Vector.toArray(unique);
  };

  func sameAssetKind(a : Types.GithubAssetKind, b : Types.GithubAssetKind) : Bool {
    switch (a, b) {
      case (#StorageWASM, #StorageWASM) true;
      case (#StorageFrontend, #StorageFrontend) true;
      case (#StorageReleaseManifest, #StorageReleaseManifest) true;
      case _ false;
    };
  };

  func queueAssetDownload(store : Store, release : Types.Release, assetName : Text, assetKind : Types.GithubAssetKind, invalidated : Vector.Vector<InvalidatedAsset>) {
    let key = release.tagName # "/" # assetName;

    let newAssetInfo = Iter.fromArray(release.assets) |> Iter.find(_, func(a : Types.Asset) : Bool = a.name == assetName);

    switch (HttpDownloader.find(store.downloaderStore, key), newAssetInfo) {
      case (?existingDownload, ?newAsset) {
        if (HttpDownloader.hasFailedChunks(existingDownload)) {
          Vector.add(invalidated, { key; kind = assetKind });
          HttpDownloader.remove(store.downloaderStore, key);
          ignore downloadAsset(store, release.tagName, assetName);
        } else {
          switch (existingDownload.sha256, newAsset.sha256) {
            case (?oldHash, ?newHash) {
              if (oldHash != newHash) {
                Vector.add(invalidated, { key; kind = assetKind });
                HttpDownloader.remove(store.downloaderStore, key);
                ignore downloadAsset(store, release.tagName, assetName);
              };
            };
            case (null, _) {};
            case (_, null) {};
          };
        };
      };
      case (null, ?_) {
        ignore downloadAsset(store, release.tagName, assetName);
      };
      case (_, null) {};
    };
  };

  func getReleaseManifest(store : Store, release : Types.Release, configuredAssets : [Types.GithubAsset]) : (?Types.StorageReleaseManifest, ?Text) {
    let manifestName = label find : ?Text {
      for (asset in configuredAssets.vals()) {
        switch (asset) {
          case (#StorageReleaseManifest(name)) break find(?name);
          case _ {};
        };
      };
      null;
    };

    let ?assetName = manifestName else return (null, null);
    let key = release.tagName # "/" # assetName;

    switch (getAssetDownloadStatus(store, key)) {
      case (#Completed _) {};
      case (#Error message) return (null, ?message);
      case _ return (null, null);
    };

    switch (HttpDownloader.get(store.downloaderStore, key)) {
      case (#err(message)) (null, ?message);
      case (#ok(details)) {
        switch (Parser.parseStorageReleaseManifestBody(details.content)) {
          case (#ok(manifest)) (?manifest, null);
          case (#err(message)) (null, ?message);
        };
      };
    };
  };

  func releaseManifestValidationError(store : Store, release : Types.Release, configuredAssets : [Types.GithubAsset], requireDownloaded : Bool) : ?Text {
    let (manifest, manifestError) = getReleaseManifest(store, release, configuredAssets);
    switch (manifestError) {
      case (?message) return ?message;
      case null {};
    };

    switch (manifest) {
      case (?parsedManifest) ManifestPolicy.validate(release, parsedManifest, configuredAssets);
      case null {
        if (requireDownloaded) ?"storage-release.json is not downloaded" else null;
      };
    };
  };

  func storageArtifactHash(store : Store, releaseTag : Text, kind : GithubAssetKind) : Result.Result<Blob, Text> {
    let manifest = switch (storageReleaseManifestParsed(store, releaseTag)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    let artifact = switch (kind) {
      case (#StorageWASM) manifest.wasm;
      case (#StorageFrontend) manifest.frontend;
      case (#StorageReleaseManifest) null;
    };

    let ?metadata = artifact else return #err("storage-release.json missing artifact hash source");
    let ?sha256 = metadata.sha256 else return #err("storage-release.json artifact " # metadata.name # " missing sha256");
    decodeSha256(sha256, "storage-release.json artifact " # metadata.name # ".sha256");
  };

  func decodeSha256(value : Text, path : Text) : Result.Result<Blob, Text> {
    let normalized = Text.trimStart(value, #text "sha256:");
    switch (Hex.toArray(normalized)) {
      case (#ok(bytes)) {
        if (bytes.size() != 32) {
          return #err(path # " must be a 32-byte sha256 hex value");
        };
        #ok(Blob.fromArray(bytes));
      };
      case (#err(_)) #err(path # " must be a valid sha256 hex value");
    };
  };

  func configuredAssetName(store : Store, kind : GithubAssetKind) : ?Text {
    for ((_, assets) in store.assets.vals()) {
      for (asset in assets.vals()) {
        switch (kind, asset) {
          case (#StorageWASM, #StorageWASM(name)) return ?name;
          case (#StorageFrontend, #StorageFrontend(name)) return ?name;
          case (#StorageReleaseManifest, #StorageReleaseManifest(name)) return ?name;
          case _ {};
        };
      };
    };
    null;
  };

  func releaseAsset(store : Store, releaseTag : Text, kind : GithubAssetKind) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    let ?assetName = configuredAssetName(store, kind) else return #err("No configured asset of requested kind");
    let ?release = findReleaseByTag(store.releases, releaseTag) else return #err("No release found for tag " # releaseTag);
    let ?_asset = Iter.fromArray(release.assets) |> Iter.find(_, func(a : Types.Asset) : Bool = a.name == assetName) else {
      return #err("Asset " # assetName # " not found in release " # releaseTag);
    };

    HttpDownloader.get(store.downloaderStore, releaseTag # "/" # assetName);
  };

  func latestReleaseAsset(store : Store, kind : GithubAssetKind) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    // Find the first selector that has the requested asset kind
    let ?(selector, assets) = Iter.fromArray(store.assets) |> Iter.find<(ReleaseSelector, [GithubAsset])>(
      _,
      func(_ : ReleaseSelector, assets : [GithubAsset]) : Bool {
        for (asset in assets.vals()) {
          switch (kind, asset) {
            case (#StorageWASM, #StorageWASM(_)) return true;
            case (#StorageFrontend, #StorageFrontend(_)) return true;
            case _ {};
          };
        };
        false;
      },
    ) else return #err("No configured asset of requested kind");

    let ?release = findReleaseBySelector(store.releases, selector) else return #err("No release found for selector");

    let assetName = label find : Text {
      for (asset in assets.vals()) {
        switch (kind, asset) {
          case (#StorageWASM, #StorageWASM(name)) break find name;
          case (#StorageFrontend, #StorageFrontend(name)) break find name;
          case _ {};
        };
      };
      return #err("Asset not found in configured assets");
    };

    let key = release.tagName # "/" # assetName;
    HttpDownloader.get(store.downloaderStore, key);
  };

  func downloadAsset(store : Store, tagName : Text, assetName : Text) : Result.Result<(), Text> {
    let ?release = findReleaseByTag(store.releases, tagName) else return #err("Release not found: " # tagName);
    let ?asset = Iter.fromArray(release.assets) |> Iter.find(_, func(a : Types.Asset) : Bool = a.name == assetName) else return #err("Asset not found: " # assetName);

    let key = tagName # "/" # assetName;
    HttpDownloader.add(store.downloaderStore, { key; name = asset.name; contentType = asset.contentType; size = asset.size; sha256 = asset.sha256; url = asset.url });
    #ok(());
  };

  func getHeaders(githubToken : ?Text) : Set.Set<IC.HttpHeader> {
    let headers = Set.empty<IC.HttpHeader>();
    Set.add(headers, compareHeaders, { name = "Accept"; value = "application/vnd.github+json" });
    Set.add(headers, compareHeaders, { name = "X-GitHub-Api-Version"; value = "2022-11-28" });
    switch (githubToken) {
      case (?token) Set.add(headers, compareHeaders, { name = "Authorization"; value = "Bearer " # token });
      case null {};
    };
    headers;
  };

};
