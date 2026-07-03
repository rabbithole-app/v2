import Time "mo:core/Time";

import VetKeys "mo:ic-vetkeys";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import MemoryRegion "mo:memory-region/MemoryRegion";
import CertifiedAssets "mo:certified-assets/Stable";

import AccessTypes "Access/Types";
import StorageEventTypes "StorageEvents/Types";
import ExternalStorageTypes "ExternalStorage/Types";
import ObjectStorageTypes "ObjectStorage/Types";
import V1 "Migrations/V1/Types";
import V2 "Migrations/V2/Types";
import Migrations "Migrations/lib";

module {
  /* -------------- Versioned stable store (migration support) --------------- */

  public type VersionedStableStore = Migrations.VersionedStableStore;
  public type UpgradeOptions = Migrations.UpgradeOptions;

  /* -------------- Re-exports from current stable types --------------------- */

  public type StableStore = V2.StableStore;
  public type MemoryInfo = MemoryRegion.MemoryInfo;

  /* -------------- Re-exports from Access ---------------------------------- */

  public type AccessRef = AccessTypes.AccessRef;
  public type AccessClass = AccessTypes.AccessClass;
  public type AccessSource = AccessTypes.AccessSource;
  public type AccessScope = AccessTypes.AccessScope;
  public type OwnerEquivalentPrincipal = AccessTypes.OwnerEquivalentPrincipal;
  public type PrincipalAccessGrant = AccessTypes.PrincipalAccessGrant;
  public type EmailClaimOrigin = AccessTypes.EmailClaimOrigin;
  public type EmailClaim = AccessTypes.EmailClaim;
  public type EmailClaimState = AccessTypes.EmailClaimState;
  public type PendingAccessGrant = AccessTypes.PendingAccessGrant;
  public type AccessRequestStatus = AccessTypes.AccessRequestStatus;
  public type AccessRequestDecision = AccessTypes.AccessRequestDecision;
  public type AccessRequest = AccessTypes.AccessRequest;
  public type OwnerActivityOrigin = AccessTypes.OwnerActivityOrigin;
  public type OwnerActivityRole = AccessTypes.OwnerActivityRole;
  public type OwnerActivityRecord = AccessTypes.OwnerActivityRecord;
  public type OwnerActivityState = AccessTypes.OwnerActivityState;
  public type DurablePolicyTrigger = AccessTypes.DurablePolicyTrigger;
  public type DurablePolicyStatus = AccessTypes.DurablePolicyStatus;
  public type DurablePolicyGrantTemplate = AccessTypes.DurablePolicyGrantTemplate;
  public type DurableAccessPolicy = AccessTypes.DurableAccessPolicy;
  public type DurablePolicyProcessResult = AccessTypes.DurablePolicyProcessResult;
  public type StorageAccessEvent = AccessTypes.StorageAccessEvent;
  public type StorageEvent = StorageEventTypes.StorageEvent;
  public type StoredStorageEvent = StorageEventTypes.StoredStorageEvent;
  public type AddRecoveryOwnerOptions = AccessTypes.AddRecoveryOwnerOptions;
  public type RecoveryStatus = AccessTypes.RecoveryStatus;
  public type RegisterRecoveryControllerResult = AccessTypes.RegisterRecoveryControllerResult;
  public type CreateAccessBatchItem = AccessTypes.CreateAccessBatchItem;
  public type CreateAccessBatchArguments = AccessTypes.CreateAccessBatchArguments;
  public type CreateAccessBatchResult = AccessTypes.CreateAccessBatchResult;
  public type RevokeAccessBatchItem = AccessTypes.RevokeAccessBatchItem;
  public type RevokeAccessBatchArguments = AccessTypes.RevokeAccessBatchArguments;
  public type RevokeAccessBatchResult = AccessTypes.RevokeAccessBatchResult;
  public type CreatePrincipalAccessGrantResult = AccessTypes.CreatePrincipalAccessGrantResult;
  public type CreatePendingAccessGrantResult = AccessTypes.CreatePendingAccessGrantResult;
  public type AccessGrantListMode = AccessTypes.AccessGrantListMode;
  public type ListAccessGrantsArguments = AccessTypes.ListAccessGrantsArguments;
  public type ListedPrincipalAccessGrant = AccessTypes.ListedPrincipalAccessGrant;
  public type ListedPendingAccessGrant = AccessTypes.ListedPendingAccessGrant;
  public type AccessGrantList = AccessTypes.AccessGrantList;
  public type CreatePendingAccessGrantArguments = AccessTypes.CreatePendingAccessGrantArguments;
  public type ClaimPendingAccessGrantArguments = AccessTypes.ClaimPendingAccessGrantArguments;
  public type ClaimPendingAccessByVerifiedAttributesArguments = AccessTypes.ClaimPendingAccessByVerifiedAttributesArguments;
  public type ClaimPendingAccessByBackendAttestationArguments = AccessTypes.ClaimPendingAccessByBackendAttestationArguments;
  public type ClaimedPendingAccessGrant = AccessTypes.ClaimedPendingAccessGrant;
  public type CancelPendingAccessGrantArguments = AccessTypes.CancelPendingAccessGrantArguments;
  public type CancelPendingAccessGrantResult = AccessTypes.CancelPendingAccessGrantResult;
  public type CreateDurableAccessGrantArguments = AccessTypes.CreateDurableAccessGrantArguments;
  public type CreateDurableAccessPolicyArguments = AccessTypes.CreateDurableAccessPolicyArguments;
  public type CancelDurableAccessPolicyArguments = AccessTypes.CancelDurableAccessPolicyArguments;
  public type ReleaseDurableAccessPolicyArguments = AccessTypes.ReleaseDurableAccessPolicyArguments;
  public type RecordOwnerActivityArguments = AccessTypes.RecordOwnerActivityArguments;
  public type CreateAccessRequestArguments = AccessTypes.CreateAccessRequestArguments;
  public type CancelAccessRequestArguments = AccessTypes.CancelAccessRequestArguments;
  public type ResolveAccessRequestArguments = AccessTypes.ResolveAccessRequestArguments;

  /* -------------- Re-exports from ExternalStorage ------------------------- */

  public type ExternalStorageTargetId = ExternalStorageTypes.TargetId;
  public type ExternalStorageCredentialId = ExternalStorageTypes.CredentialId;
  public type ExternalStorageReadMode = ExternalStorageTypes.ReadMode;
  public type ExternalStorageWriteMode = ExternalStorageTypes.WriteMode;
  public type ExternalStorageTargetStatus = ExternalStorageTypes.TargetStatus;
  public type ExternalStorageCredentialStatus = ExternalStorageTypes.CredentialStatus;
  public type ExternalStorageS3CompatibleTargetConfig = ExternalStorageTypes.S3CompatibleTargetConfig;
  public type ExternalStorageTargetKind = ExternalStorageTypes.TargetKind;
  public type ExternalStorageTarget = ExternalStorageTypes.Target;
  public type ExternalStorageCredential = ExternalStorageTypes.Credential;
  public type ExternalStorageTargetView = ExternalStorageTypes.TargetView;
  public type ConfigureExternalStorageTargetArgs = ExternalStorageTypes.ConfigureTargetArgs;
  public type DisableExternalStorageTargetArgs = ExternalStorageTypes.DisableTargetArgs;
  public type ExternalBlobLocatorArgs = ExternalStorageTypes.BlobLocatorArgs;
  public type ExternalBlobLocator = ExternalStorageTypes.BlobLocator;
  public type ExternalTargetBlobLocatorArgs = ExternalStorageTypes.TargetBlobLocatorArgs;
  public type ExternalTargetBlobLocator = ExternalStorageTypes.TargetBlobLocator;
  public type ExternalStoragePresignedHttpMethod = ExternalStorageTypes.PresignedHttpMethod;
  public type ExternalStoragePresignedUrl = ExternalStorageTypes.PresignedUrl;
  public type ExternalStoragePresignBlobUploadArgs = ExternalStorageTypes.PresignBlobUploadArgs;
  public type ExternalStoragePresignBlobUploadResult = ExternalStorageTypes.PresignBlobUploadResult;
  public type ExternalBlobReplicaStatus = ExternalStorageTypes.BlobReplicaStatus;
  public type ExternalBlobReplica = ExternalStorageTypes.BlobReplica;
  public type ExternalStorageDeleteTaskStatus = ExternalStorageTypes.DeleteTaskStatus;
  public type ExternalStorageDeleteTask = ExternalStorageTypes.DeleteTask;
  public type ExternalStorageDeleteTaskView = ExternalStorageTypes.DeleteTaskView;
  public type ExternalStorageUploadSession = ExternalStorageTypes.UploadSession;
  public type ExternalStorageCleanupStatus = ExternalStorageTypes.CleanupStatus;
  public type ExternalStorageHttpTransform = ExternalStorageTypes.HttpTransform;
  public type ExternalStorageHttpTransformArg = ExternalStorageTypes.HttpTransformArg;
  public type ExternalStorageStore = ExternalStorageTypes.Store;

  /* -------------- Re-exports from ObjectStorage --------------------------- */

  public type ObjectStorageWritePolicy = ObjectStorageTypes.WritePolicy;
  public type ObjectStorageStatus = ObjectStorageTypes.Status;
  public type ObjectStorageUploadRoute = ObjectStorageTypes.UploadRoute;
  public type ObjectStorageBlobReadRoute = ObjectStorageTypes.BlobReadRoute;

  /* -------------- Re-exports from V1 (filesystem/storage types) ----------- */
  public type SubscriptionStatus = V1.SubscriptionStatus;
  public type SubscriptionCache = V1.SubscriptionCache;
  public type Plan = V1.Plan;
  public type CycleAlertLevel = V1.CycleAlertLevel;
  public type FileSystemStore = V1.FileSystemStore;
  public type NodeStore = V1.NodeStore;
  public type NodeKey = V1.NodeKey;
  public type FileMetadataStore = V1.FileMetadataStore;
  public type DirectoryMetadataStore = V1.DirectoryMetadataStore;
  public type NodeMetadataStore = V1.NodeMetadataStore;
  public type UploadStore = V1.UploadStore;
  public type Batch = V1.Batch;
  public type StoredChunk = V1.StoredChunk;
  public type SizedPointer = V1.SizedPointer;
  public type Configuration = V1.Configuration;
  public type PermissionMap = V1.PermissionMap;
  public type DirectoryColor = V1.DirectoryColor;
  public type Permission = V1.Permission;
  public type StorageErrorCode = {
    #PermissionDenied;
    #NotFound;
    #Conflict;
    #QuotaExceeded;
    #FundingPending;
    #InsufficientCycles;
    #Validation;
    #Internal;
  };
  public type StorageError = {
    code : StorageErrorCode;
    message : Text;
  };
  public type StorageResult<T> = {
    #ok : T;
    #err : StorageError;
  };
  public type StreamingCallback = V1.StreamingCallback;
  public type StreamingToken = V1.StreamingToken;
  public type StreamingCallbackResponse = V1.StreamingCallbackResponse;
  public type BatchId = V1.BatchId;
  public type ChunkId = V1.ChunkId;
  public type ContentRef = V1.ContentRef;
  public type ThumbnailStoragePolicy = V1.ThumbnailStoragePolicy;
  public type FileVersion = V1.FileVersion;
  public type StagingEntry = V1.StagingEntry;

  /* ----------------------- API types (not versioned) ----------------------- */

  public type MapOwner = Principal;
  public type MapName = Blob;
  public type MapKey = Blob;
  public type MapId = (MapOwner, MapName);
  public type MetadataKey = (MapOwner, MapName, MapKey);

  /// The public verification key used to verify the authenticity of derived vetKeys.
  public type VetKeyVerificationKey = Blob;

  /// An encrypted cryptographic key derived using vetKD.
  public type VetKey = Blob;

  /// The owner of a vetKey, represented as a Principal.
  public type Owner = Principal;

  /// The caller requesting access to a vetKey, represented as a Principal.
  public type Caller = Principal;

  /// The name of a vetKey, used as part of the key identifier.
  public type KeyName = Blob;

  /// A unique identifier for a vetKey, consisting of the owner and key name.
  public type KeyId = (Owner, KeyName);

  /// The public transport key used to encrypt vetKeys for secure transmission.
  public type TransportKey = Blob;

  public type FindBy = {
    #entry : Entry;
    #nodeKey : NodeKey;
    #keyId : KeyId;
    #root;
  };

  public type PermissionExt = {
    #Read;
    #ReadWrite;
    #ReadWriteManage;
    #Controller;
  };

  public type StoreArguments = {
    #File : {
      path : Text;
      metadata : {
        sha256 : ?Blob;
        content : Blob;
        contentType : Text;
        size : Nat;
      };
    };
  };

  public type HasPermissionArguments = {
    entry : ?Entry;
    user : Principal;
    permission : Permission;
  };

  /* ---------------------------------- File ---------------------------------- */

  public type StorageBackend = { #OnChain; #BlobStorage };

  public type ThumbnailRef = {
    #OnChain : {
      key : Text;
      sha256 : ?Blob;
      contentType : Text;
      size : Nat;
      encryption : ThumbnailEncryptionRef;
    };
    #BlobStorage : {
      rootHash : Text;
      blobId : Blob;
      sha256 : ?Blob;
      contentType : Text;
      size : Nat;
      encryption : ThumbnailEncryptionRef;
    };
  };

  public type ThumbnailEncryptionRef = {
    scopeKeyId : KeyId;
    wrappedKey : Blob;
    blobIv : Blob;
    algorithm : Text;
  };

  public type ThumbnailEncryptionRequirement = {
    scopeKeyId : KeyId;
  };

  public type FileMetadata = {
    sha256 : ?Blob;
    contentType : Text;
    size : Nat;
    chunkCount : Nat;
    thumbnailRef : ?ThumbnailRef;
    versionCount : Nat;
    currentVersion : Nat;
    storageBackend : StorageBackend;
  };

  type NodeBase = {
    id : Nat64;
    keyId : VetKeys.KeyManager.KeyId;
    createdAt : Time.Time;
    modifiedAt : ?Time.Time;
    name : Text;
    parentId : ?Nat64;
  };

  public type FileDetails = NodeBase and {
    path : Text;
    permissions : [(Principal, Permission)];
  };

  public type SharingInfo = {
    sharedWith : Nat;
  };

  public type NodeDetails = NodeBase and {
    callerPermission : ?Permission;
    sharing : ?SharingInfo;
    metadata : {
      #File : FileMetadata;
      #Directory : DirectoryMetadata;
    };
  };

  public type ListResponse = {
    entries : [NodeDetails];
    directoryPermission : ?Permission;
  };

  public type SetThumbnailArguments = {
    entry : Entry;
    thumbnailRef : ?ThumbnailRef;
  };

  public type PrepareThumbnailUploadArguments = {
    entry : Entry;
    contentType : Text;
    size : Nat;
  };

  public type PrepareThumbnailUploadResult = {
    storageBackend : StorageBackend;
    encryption : ThumbnailEncryptionRequirement;
    contentType : Text;
    size : Nat;
  };

  public type CommitThumbnailUploadArguments = {
    entry : Entry;
    rootHash : Text;
    sha256 : Blob;
    contentType : Text;
    size : Nat;
    encryption : ThumbnailEncryptionRef;
  };

  /* -------------------------------- Directory ------------------------------- */

  public type DirectoryMetadata = {
    color : ?DirectoryColor;
    thumbnailStoragePolicy : ThumbnailStoragePolicy;
    defaultThumbnailStorageBackend : StorageBackend;
  };

  /* ------------------------------- FileSystem ------------------------------- */

  public type NodeMetadata = {
    #File : FileMetadata;
    #Directory : DirectoryMetadata;
  };

  public type Node = NodeStore;

  public type FileSystemInitArgs = {
    region : MemoryRegion.MemoryRegion;
    rootPermissions : [(Principal, Permission)];
  };

  public type EncryptedStorageInitArgs = {
    accountOwner : Principal;
    canisterId : Principal;
    vetKdKeyId : ManagementCanister.VetKdKeyid;
    domainSeparator : Text;
    region : MemoryRegion.MemoryRegion;
    rootPermissions : [(Principal, Permission)];
    certs : ?CertifiedAssets.StableStore;
    backendId : ?Principal;
    storageBackendType : StorageBackend;
    objectStorageWritePolicy : ?ObjectStorageWritePolicy;
  };

  public type StorageStatus = {
    cycleBalance : Nat;
    subscriptionStatus : ?SubscriptionStatus;
    storedBytesUsed : Nat;
    backendId : ?Principal;
    storageBackendType : StorageBackend;
    objectStorage : ?ObjectStorageStatus;
    fileCount : Nat;
    directoryCount : Nat;
  };

  /* ----------------------------- Caffeine API ------------------------------ */

  public type CreateCertificateResult = {
    method : Text;
    blob_hash : Text;
  };

  public type CommitCaffeineUploadArgs = {
    entry : Entry;
    sha256 : Blob;
    rootHash : Text;
    contentType : Text;
    size : Nat;
  };

  public type PreflightCaffeineUploadArgs = {
    entry : Entry;
    size : Nat;
  };

  public type ResolveUploadRouteArgs = {
    entry : Entry;
    size : Nat;
  };

  public type ResolveBlobReadRouteArgs = {
    entry : Entry;
    version : ?Nat;
  };

  public type ResolveThumbnailReadRouteArgs = {
    entry : Entry;
    rootHash : Text;
  };

  public type PrepareExternalBlobUploadArgs = {
    entry : Entry;
    targetId : ?ExternalStorageTargetId;
    rootHashHex : Text;
    size : Nat;
    expiresSeconds : ?Nat;
  };

  public type PrepareExternalBlobUploadResult = ExternalStoragePresignBlobUploadResult;

  public type CommitExternalBlobUploadArgs = {
    entry : Entry;
    targetId : ?ExternalStorageTargetId;
    sha256 : Blob;
    rootHashHex : Text;
    contentType : Text;
    size : Nat;
  };

  public type CommitExternalThumbnailUploadArgs = {
    entry : Entry;
    targetId : ?ExternalStorageTargetId;
    sha256 : Blob;
    rootHashHex : Text;
    contentType : Text;
    size : Nat;
    encryption : ThumbnailEncryptionRef;
  };

  public type Entry = ({ #File; #Directory }, Text);

  public type GetArguments = {
    entry : Entry;
  };

  public type CreateMode = {
    #CreateNew;
    #GetOrCreate;
  };

  public type CreateArguments = {
    entry : Entry;
    createMode : CreateMode;
  };

  public type UpdateArguments = {
    #File : {
      path : Text;
      metadata : {
        sha256 : ?Blob;
        chunkIds : [ChunkId];
        contentType : Text;
      };
    };
    #Directory : {
      path : Text;
      metadata : {
        color : ?DirectoryColor;
      };
    };
  };

  public type UpdateDirectoryPolicyArguments = {
    entry : Entry;
    thumbnailStoragePolicy : ?ThumbnailStoragePolicy;
  };

  public type MoveArguments = {
    entry : Entry;
    target : ?Entry;
  };

  public type RenameArguments = {
    entry : Entry;
    newName : Text;
  };

  public type DeleteArguments = {
    entry : Entry;
    recursive : Bool;
  };

  public type GetChunkArguments = {
    entry : Entry;
    chunkIndex : Nat;
    version : ?Nat;
  };

  public type CommitBatchArguments = {
    batchId : BatchId;
    operations : [CommitBatchOperation];
  };

  public type CommitBatchOperation = {
    #Create : CreateArguments;
    #Move : MoveArguments;
    #Delete : DeleteArguments;
    #Update : UpdateArguments;
  };

  public type TreeNode = {
    name : Text;
    children : ?[TreeNode];
  };

  /* --------------------------------- Upload --------------------------------- */

  public type ReserveBatchResponse = {
    batchId : BatchId;
  };

  public type BeginUploadSessionArguments = {
    entry : Entry;
    totalSize : Nat;
    declaredUploadBytes : ?Nat;
    expectedChunkCount : ?Nat;
    createMode : CreateMode;
  };

  public type BeginUploadSessionResponse = {
    batchId : BatchId;
    node : NodeDetails;
  };

  public type UploadSessionStatus = {
    batchId : BatchId;
    owner : Principal;
    declaredUploadBytes : Nat;
    uploadedBytes : Nat;
    expiresAt : Time.Time;
    chunkIds : [ChunkId];
  };

  public type FinishUploadSessionArguments = {
    batchId : BatchId;
    sha256 : ?Blob;
    contentType : Text;
  };

  public type AppendUploadChunkArguments = Chunk;

  public type AbortUploadSessionArguments = {
    batchId : BatchId;
  };

  public type ChunkContent = {
    content : Blob;
  };

  public type Chunk = ChunkContent and {
    batchId : BatchId;
    chunkIndex : ?Nat;
  };

  public type AppendUploadChunkResponse = {
    chunkId : Nat;
  };

  public type ConfigurationResponse = {
    maxBatches : ?Nat64;
    maxChunks : ?Nat64;
    maxBytes : ?Nat64;
  };

  /* ---------------------------------- HTTP ---------------------------------- */

  public type Header = (Text, Text);

  public type HttpResponse = {
    status_code : Nat16;
    headers : [Header];
    body : Blob;
    streaming_strategy : ?StreamingStrategy;
    upgrade : ?Bool;
  };

  public type HttpRequest = {
    url : Text;
    method : Text;
    headers : [Header];
    body : Blob;
    certificate_version : ?Nat16;
  };

  public type StreamingStrategy = {
    #Callback : {
      callback : StreamingCallback;
      token : StreamingToken;
    };
  };

  public type CustomStreamingToken = {
    keyId : KeyId;
    sha256 : ?Blob;
    index : Nat;
  };

  public type StreamingCallbackResponseAny = {
    body : Blob;
    token : ?Any;
  };

  /* -------------------------------- Versioning ------------------------------ */

  public type ListVersionsArguments = {
    entry : Entry;
  };

  public type FileVersionDetails = {
    index : Nat;
    sha256 : ?Blob;
    size : Nat;
    contentType : Text;
    createdAt : Time.Time;
    storageBackend : StorageBackend;
  };

  public type RestoreVersionArguments = {
    entry : Entry;
    version : Nat;
  };
};
