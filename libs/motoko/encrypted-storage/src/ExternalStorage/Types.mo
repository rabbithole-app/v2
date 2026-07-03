import Time "mo:core/Time";

import Map "mo:core/Map";
import IC "mo:ic/Types";

module {
  public type TargetId = Text;
  public type CredentialId = Text;
  public type RootHashHex = Text;

  public type ReadMode = {
    #PublicEncrypted;
  };

  public type WriteMode = {
    #CanisterPresigned;
  };

  public type TargetStatus = {
    #Active;
    #Disabled;
    #CredentialFailed;
  };

  public type CredentialStatus = {
    #Active;
    #ValidationFailed;
    #Removed;
  };

  public type S3CompatibleTargetConfig = {
    endpoint : Text;
    bucket : Text;
    region : Text;
    prefix : Text;
    forcePathStyle : Bool;
  };

  public type TargetKind = {
    #S3CompatiblePublicEncrypted : S3CompatibleTargetConfig;
  };

  public type Target = {
    id : TargetId;
    version : Nat;
    displayName : ?Text;
    kind : TargetKind;
    layoutVersion : Nat;
    readMode : ReadMode;
    writeMode : WriteMode;
    status : TargetStatus;
    credentialId : ?CredentialId;
    createdAt : Time.Time;
    updatedAt : Time.Time;
    lastValidatedAt : ?Time.Time;
  };

  public type Credential = {
    id : CredentialId;
    targetId : TargetId;
    accessKeyId : Text;
    secretAccessKey : Text;
    sessionToken : ?Text;
    status : CredentialStatus;
    createdAt : Time.Time;
    updatedAt : Time.Time;
    lastValidatedAt : ?Time.Time;
  };

  public type TargetView = {
    id : TargetId;
    version : Nat;
    displayName : ?Text;
    kind : TargetKind;
    layoutVersion : Nat;
    readMode : ReadMode;
    writeMode : WriteMode;
    status : TargetStatus;
    hasCredential : Bool;
    createdAt : Time.Time;
    updatedAt : Time.Time;
    lastValidatedAt : ?Time.Time;
  };

  public type ConfigureTargetArgs = {
    targetId : ?TargetId;
    displayName : ?Text;
    endpoint : Text;
    bucket : Text;
    region : Text;
    prefix : Text;
    forcePathStyle : Bool;
    accessKeyId : Text;
    secretAccessKey : Text;
    sessionToken : ?Text;
  };

  /// Validated configure request that has not touched the store yet.
  /// The capability probe runs against these values first; only a successful
  /// probe commits them (`commitConfigureTarget`).
  public type PreparedConfigureTarget = {
    existingTarget : ?Target;
    displayName : ?Text;
    config : S3CompatibleTargetConfig;
    accessKeyId : Text;
    secretAccessKey : Text;
    sessionToken : ?Text;
  };

  public type DisableTargetArgs = {
    targetId : TargetId;
  };

  public type BlobLocatorArgs = {
    prefix : Text;
    rootHashHex : RootHashHex;
  };

  public type BlobLocator = {
    layoutVersion : Nat;
    treeKey : Text;
    blobKey : Text;
  };

  public type TargetBlobLocatorArgs = {
    targetId : ?TargetId;
    rootHashHex : RootHashHex;
  };

  public type TargetBlobLocator = {
    target : TargetView;
    locator : BlobLocator;
  };

  public type PresignedHttpMethod = {
    #GET;
    #PUT;
    #DELETE;
    #HEAD;
  };

  public type PresignedUrl = {
    method : Text;
    url : Text;
    key : Text;
    expiresAt : Time.Time;
    signedHeaders : [(Text, Text)];
    requestHeaders : [(Text, Text)];
  };

  public type PresignBlobUploadArgs = {
    targetId : ?TargetId;
    rootHashHex : RootHashHex;
    expiresSeconds : Nat;
  };

  public type PresignBlobUploadResult = {
    target : TargetView;
    locator : BlobLocator;
    treeUpload : PresignedUrl;
    blobUpload : PresignedUrl;
  };

  public type BlobReplicaStatus = {
    #Active;
    #DeletePending;
    #Deleted;
    /// A delete task was cancelled by a concurrent re-upload of the same
    /// content, but the objects were already removed from the bucket.
    /// The content must be re-uploaded; surfaced to the owner as a repair item.
    #Missing;
  };

  public type BlobReplica = {
    id : Text;
    targetId : TargetId;
    rootHashHex : RootHashHex;
    locator : BlobLocator;
    size : Nat;
    sha256 : ?Blob;
    status : BlobReplicaStatus;
    pendingDeleteTaskId : ?Nat;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  public type DeleteTaskStatus = {
    #Pending;
    #Running;
    #Done;
    #Cancelled;
  };

  public type DeleteTask = {
    id : Nat;
    targetId : TargetId;
    rootHashHex : RootHashHex;
    /// Owning replica; null for orphaned-upload cleanup tasks that have no replica.
    replicaId : ?Text;
    keys : [Text];
    var attempts : Nat;
    var status : DeleteTaskStatus;
    var nextAttemptAt : Time.Time;
    var leaseExpiresAt : Time.Time;
    var lastError : ?Text;
    createdAt : Time.Time;
    var updatedAt : Time.Time;
  };

  public type DeleteTaskView = {
    id : Nat;
    targetId : TargetId;
    rootHashHex : RootHashHex;
    replicaId : ?Text;
    keys : [Text];
    attempts : Nat;
    status : DeleteTaskStatus;
    nextAttemptAt : Time.Time;
    lastError : ?Text;
    createdAt : Time.Time;
    updatedAt : Time.Time;
  };

  /// Presigned PUT issued but not yet committed. Expired sessions are swept
  /// into delete tasks so aborted uploads never leak objects in the bucket.
  public type UploadSession = {
    targetId : TargetId;
    rootHashHex : RootHashHex;
    keys : [Text];
    createdAt : Time.Time;
    expiresAt : Time.Time;
  };

  public type CleanupStatus = {
    pendingTasks : Nat;
    runningTasks : Nat;
    doneTasks : Nat;
    cancelledTasks : Nat;
    nextAttemptAt : ?Time.Time;
    credentialBlockedTargetIds : [TargetId];
    activeReplicas : Nat;
    deletePendingReplicas : Nat;
    deletedReplicas : Nat;
    missingReplicas : Nat;
    pendingUploadSessions : Nat;
  };

  public type HttpTransformArg = {
    context : Blob;
    response : IC.HttpRequestResult;
  };

  public type HttpTransform = {
    function : shared query HttpTransformArg -> async IC.HttpRequestResult;
    context : Blob;
  };

  public type Store = {
    var activeTargetId : ?TargetId;
    var nextTargetSequence : Nat;
    var nextCredentialSequence : Nat;
    var nextDeleteTaskId : Nat;
    targets : Map.Map<TargetId, Target>;
    credentials : Map.Map<CredentialId, Credential>;
    replicas : Map.Map<Text, BlobReplica>;
    deleteTasks : Map.Map<Nat, DeleteTask>;
    uploadSessions : Map.Map<Text, UploadSession>;
  };
};
