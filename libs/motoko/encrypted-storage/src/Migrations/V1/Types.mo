import Principal "mo:core/Principal";
import Time "mo:core/Time";

import CoreMap "mo:core/Map";

import VetKeys "mo:ic-vetkeys";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import Vector "mo:vector";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import CertifiedAssets "mo:certified-assets/Stable";

import AccessTypes "../../Access/Types";
import StorageEventTypes "../../StorageEvents/Types";
import StableTID "../../StableTID";

module {
  /* --------------------------------- Common --------------------------------- */

  public type SizedPointer = (Nat, Nat);

  public type Permission = VetKeys.AccessRights;
  public type PermissionMap = Map.Map<Principal, Permission>;

  /* ----------------------------- Storage Backend ----------------------------- */

  public type StorageBackend = { #OnChain; #BlobStorage };

  public type ContentRef = {
    #OnChain : SizedPointer;
    #BlobStorage : { blobId : Blob; size : Nat };
  };

  public type EncryptionMode = {
    #Encrypted;
    #Plaintext;
  };

  public type DirectoryEncryptionPolicy = {
    #Auto;
    #Encrypted;
    #Plaintext;
  };

  public type ThumbnailStoragePolicy = {
    #Inherit;
    #OnChain;
    #BlobStorage;
  };

  public type ThumbnailEncryptionPolicy = {
    #Inherit;
    #FollowFile;
  };

  public type ThumbnailEncryptionRef = {
    #Plaintext;
    #Encrypted : {
      scopeKeyId : VetKeys.KeyManager.KeyId;
      wrappedKey : Blob;
      blobIv : Blob;
      algorithm : Text;
    };
  };

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

  public type FileVersion = {
    /// For #OnChain: each chunk is a separate (address, size) pointer in MemoryRegion.
    /// For #BlobStorage: single entry with Caffeine blob hash.
    /// getChunk(i) preserves original upload boundaries (critical for per-chunk AES-GCM encryption).
    chunks : [ContentRef];
    sha256 : ?Blob;
    size : Nat;
    contentType : Text;
    createdAt : Time.Time;
  };

  /* ---------------------- Subscription & Cycle Types ---------------------- */

  public type Plan = {
    #Free;
    #License;
    #Pro;
  };

  public type SubscriptionStatus = {
    #active : { plan : Plan };
    #licensed : {
      includedBytes : Nat;
      maxFileBytes : Nat;
    };
    #expired;
    #free;
    #invalidWasm;
    #unknownCanister;
  };

  public type SubscriptionCache = {
    status : SubscriptionStatus;
    checkedAt : Time.Time;
  };

  public type CycleAlertLevel = {
    #warning;
    #critical;
  };

  /* ---------------------------------- Node ---------------------------------- */

  public type DirectoryColor = {
    #blue;
    #yellow;
    #orange;
    #purple;
    #pink;
    #gray;
    #green;
  };

  public type FileMetadataStore = {
    versions : CoreMap.Map<Nat, FileVersion>;
    var nextVersionId : Nat;
    var currentVersion : Nat;
    var maxVersions : ?Nat;
    var locked : Bool;
    var thumbnailRef : ?ThumbnailRef;
    var encryptionMode : EncryptionMode;
  };

  public type DirectoryMetadataStore = {
    var color : ?DirectoryColor;
    var defaultEncryptionMode : EncryptionMode;
    var encryptionPolicy : DirectoryEncryptionPolicy;
    var thumbnailStoragePolicy : ThumbnailStoragePolicy;
    var defaultThumbnailStorageBackend : StorageBackend;
    var thumbnailEncryptionPolicy : ThumbnailEncryptionPolicy;
  };

  public type NodeMetadataStore = {
    #File : FileMetadataStore;
    #Directory : DirectoryMetadataStore;
  };

  // (kind, parentId, name)
  public type NodeKey = ({ #File; #Directory }, ?Nat64, Text);

  public type NodeStore = {
    id : Nat64;
    keyId : VetKeys.KeyManager.KeyId;
    createdAt : Time.Time;
    var modifiedAt : ?Time.Time;
    var name : Text;
    var parentId : ?Nat64;
    permissions : PermissionMap;
    metadata : NodeMetadataStore;
  };

  /* -------------------------------- Staging -------------------------------- */

  public type StagingEntry = {
    node : NodeStore;
    var batchId : ?BatchId;
    createdAt : Time.Time;
  };

  /* ------------------------------- FileSystem ------------------------------- */

  type FileSystemStoreBase = {
    region : MemoryRegion.MemoryRegion;
  };

  public type FileSystemStore = FileSystemStoreBase and {
    nodes : Map.Map<NodeKey, NodeStore>;
    rootPermissions : PermissionMap;
    tid : StableTID.Store;
  };

  /* --------------------------------- Upload --------------------------------- */

  public type BatchId = Nat;
  public type ChunkId = Nat;

  public type Batch = {
    owner : Principal;
    var expiresAt : Time.Time;
    declaredTotalBytes : Nat;
    var totalBytes : Nat;
    var hashState : Sha256.StaticSha256;
    var hashedBytes : Nat;
    var hashedChunkCount : Nat;
    var hashInstructions : Nat;
    var nextHashChunkIndex : Nat;
    expectedChunkCount : Nat;
    chunkIds : Vector.Vector<ChunkId>;
    chunkIdsByIndex : [var ?ChunkId];
  };

  public type StoredChunk = {
    pointer : SizedPointer;
    batchId : BatchId;
    chunkIndex : Nat;
  };

  public type Configuration = {
    var maxBatches : ?Nat64;
    var maxChunks : ?Nat64;
    var maxBytes : ?Nat64;
  };

  public type UploadStore = {
    batches : Map.Map<BatchId, Batch>;
    var nextBatchId : BatchId;

    chunks : Map.Map<ChunkId, StoredChunk>;
    region : MemoryRegion.MemoryRegion;
    var nextChunkId : ChunkId;

    configuration : Configuration;
  };

  /* ---------------------------------- HTTP ---------------------------------- */

  public type StreamingCallback = shared query (StreamingToken) -> async StreamingCallbackResponse;
  public type StreamingToken = Blob;
  public type StreamingCallbackResponse = {
    body : Blob;
    token : ?StreamingToken;
  };

  /* ------------------------------- StableStore ------------------------------ */

  public type StableStore = {
    canisterId : Principal;
    region : MemoryRegion.MemoryRegion;
    fs : FileSystemStore;
    upload : UploadStore;
    staging : Map.Map<NodeKey, StagingEntry>;
    certs : CertifiedAssets.StableStore;
    vetKdKeyId : ManagementCanister.VetKdKeyid;
    domainSeparatorBytes : Blob;
    var streamingCallback : ?StreamingCallback;

    /* === Subscription & Backend === */
    var backendId : ?Principal;
    var subscriptionCache : ?SubscriptionCache;
    var encryptedBytesUsed : Nat;
    var cachedModuleHash : ?Blob;
    var lastCycleAlertAt : Time.Time;
    var lastCycleAlertLevel : ?CycleAlertLevel;
    var cachedIdleBurnPerDay : ?Nat;

    /* === Caffeine Blob Storage === */
    storageBackendType : StorageBackend;

    /* === Access & Storage Events === */
    access : AccessTypes.Store;
    storageEvents : StorageEventTypes.Store;
    storageEventReadState : StorageEventTypes.ReadState;
  };
};
