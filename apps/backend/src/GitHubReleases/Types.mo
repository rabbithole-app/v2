import Time "mo:core/Time";

import MemoryRegion "mo:memory-region/MemoryRegion";

module {
  // -- Core Types --

  public type GithubOptions = {
    apiUrl : Text;
    owner : Text;
    repo : Text;
    token : ?Text;
  };

  /// GitHub release information
  public type Release = {
    url : Text;
    htmlUrl : Text;
    id : Nat;
    tagName : Text;
    name : Text;
    body : Text;
    draft : Bool;
    prerelease : Bool;
    immutable : Bool;
    createdAt : Time.Time;
    publishedAt : ?Time.Time;
    assets : [Asset];
  };

  /// GitHub release asset information
  public type Asset = {
    url : Text;
    id : Nat;
    name : Text;
    _label : Text;
    contentType : Text;
    size : Nat;
    sha256 : ?Blob;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  // -- Asset Configuration --

  /// Kind of GitHub asset for type-safe configuration
  public type GithubAssetKind = {
    #StorageWASM;
    #StorageFrontend;
  };

  /// GitHub asset with associated filename
  public type GithubAsset = {
    #StorageWASM : Text;
    #StorageFrontend : Text;
  };

  // -- Release Selection --

  /// Selector for choosing which release to use
  ///
  /// Example:
  /// ```motoko
  /// let selector : ReleaseSelector = #Latest;
  /// let specific : ReleaseSelector = #Version("v1.0.0");
  /// ```
  public type ReleaseSelector = {
    #Latest;
    #LatestDraft;
    #LatestPrerelease;
    #Version : Text;
  };

  // -- Download Status --

  /// Status of an individual asset download
  public type AssetDownloadStatus = {
    #NotStarted;
    #Downloading : {
      chunksTotal : Nat;
      chunksCompleted : Nat;
      chunksError : Nat;
    };
    #Completed : { size : Nat };
    #Error : Text;
  };

  /// Basic information about an asset within a release
  public type AssetInfo = {
    name : Text;
    size : Nat;
    contentType : Text;
    downloadStatus : AssetDownloadStatus;
  };

  /// Basic information about a release and its assets
  public type ReleaseInfo = {
    tagName : Text;
    name : Text;
    draft : Bool;
    prerelease : Bool;
    createdAt : Time.Time;
    publishedAt : ?Time.Time;
    assets : [AssetInfo];
  };

  /// Summary status of GitHub releases module
  public type ReleasesStatus = {
    releasesCount : Nat;
    pendingDownloads : Nat;
    completedDownloads : Nat;
    releases : [ReleaseInfo];
  };

  // -- File Metadata & Extraction --

  /// File metadata without content (for status reporting)
  public type FileMetadata = {
    key : Text;
    contentType : Text;
    size : Nat;
    sha256 : Blob;
  };

  /// Extraction status for frontend archives
  public type ExtractionStatus = {
    #Idle;
    #Decoding : { processed : Nat; total : Nat };
    #Complete : [FileMetadata];
  };

  // -- Full Status Types --

  /// Full status of an asset including download and extraction
  public type AssetFullStatus = {
    name : Text;
    size : Nat;
    contentType : Text;
    downloadStatus : AssetDownloadStatus;
    extractionStatus : ?ExtractionStatus;
  };

  /// Full status of a release with all asset details
  public type ReleaseFullStatus = {
    tagName : Text;
    name : Text;
    draft : Bool;
    prerelease : Bool;
    createdAt : Time.Time;
    publishedAt : ?Time.Time;
    assets : [AssetFullStatus];
    isDownloaded : Bool;
    isDeploymentReady : Bool;
  };

  /// Comprehensive status of all releases
  public type ReleasesFullStatus = {
    releasesCount : Nat;
    pendingDownloads : Nat;
    completedDownloads : Nat;
    releases : [ReleaseFullStatus];
    defaultVersionKey : Text;
    hasDownloadedRelease : Bool;
    hasDeploymentReadyRelease : Bool;
  };

  // -- Extraction Provider --

  /// Interface for extraction status provider (used by orchestrator)
  public type ExtractionInfoProvider = {
    getExtractionStatus : (Text) -> ExtractionStatus;
    getDefaultVersionKey : () -> Text;
    getLatestReleaseTagName : () -> ?Text;
  };

  public type Options = {
    github : GithubOptions;
    assets : [(ReleaseSelector, [GithubAsset])];
    region : ?MemoryRegion.MemoryRegion
  };
};
