import Result "mo:core/Result";

/// Wire types of the frontend pull protocol, shared by both sides:
/// rabbithole-backend (serves manifest/chunks) and the storage canister
/// (pulls and installs). Keep this module dependency-free — it is compiled
/// into the storage WASM.
module FrontendPullTypes {
  public type FileMetadata = {
    key : Text;
    contentType : Text;
    size : Nat;
    sha256 : Blob;
  };

  /// Errors returned to storage canisters by the pull endpoints
  public type PullError = {
    #UnknownCanister;
    #UnknownVersion;
    #NoActiveInstall;
    #UnknownFile;
    #InvalidChunk;
    #NotReady;
  };

  /// Diff plan the storage canister reports before pulling files
  public type PullPlan = {
    filesToPull : Nat;
    bytesToPull : Nat;
    skippedFiles : Nat;
    skippedBytes : Nat;
    staleToDelete : Nat;
    changedToDelete : Nat;
  };

  /// Final stats the storage canister reports after committing
  public type PullStats = {
    pulledFiles : Nat;
    pulledBytes : Nat;
    skippedFiles : Nat;
    skippedBytes : Nat;
    staleDeletedFiles : Nat;
    changedDeletedFiles : Nat;
    treeHashMatched : ?Bool;
  };

  public type PullResult = {
    #ok : PullStats;
    #err : Text;
  };

  public type Manifest = {
    entries : [FileMetadata];
    totalFiles : Nat;
    totalBytes : Nat;
  };

  public type FileChunk = {
    content : Blob;
    chunkCount : Nat;
    totalSize : Nat;
    sha256 : Blob;
  };

  public type InstallFrontendArgs = {
    versionKey : Text;
    expectedTreeHash : ?Blob;
    totalFiles : Nat;
    totalBytes : Nat;
    isUpgrade : Bool;
  };

  /// Pull interface of rabbithole-backend as seen by storage canisters
  public type Backend = actor {
    pullFrontendManifest : shared { versionKey : Text; offset : Nat; limit : Nat } -> async Result.Result<Manifest, PullError>;
    pullFrontendFileChunk : shared { versionKey : Text; key : Text; chunkIndex : Nat } -> async Result.Result<FileChunk, PullError>;
    beginFrontendInstall : shared { versionKey : Text; plan : PullPlan } -> async Result.Result<(), PullError>;
    completeFrontendInstall : shared { versionKey : Text; result : PullResult } -> async ();
  };
};
