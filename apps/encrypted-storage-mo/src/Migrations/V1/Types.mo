import Time "mo:core/Time";

import CoreMap "mo:core/Map";

import VetKeys "mo:ic-vetkeys";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import Vector "mo:vector";
import MemoryRegion "mo:memory-region/MemoryRegion";
import CertifiedAssets "mo:certified-assets/Stable";

import StableTID "../../StableTID";

module {
  /* --------------------------------- Common --------------------------------- */

  public type SizedPointer = (Nat, Nat);

  public type Permission = VetKeys.AccessRights;
  public type PermissionMap = Map.Map<Principal, Permission>;

  /* ----------------------------- Content Ref ------------------------------ */

  public type ContentRef = {
    #Inline : SizedPointer;
    #BlobStorage : { blobId : Blob; size : Nat };
    #External : { uri : Text; size : Nat; sha256 : ?Blob };
  };

  public type EncryptionMode = {
    #Encrypted;
    #Plaintext;
  };

  public type FileVersion = {
    /// Each chunk is stored as a separate (address, size) pointer in MemoryRegion.
    /// getChunk(i) returns chunks[i] as-is, preserving original upload boundaries.
    /// This is critical for per-chunk encryption where each chunk is an independent AES-GCM ciphertext.
    chunks : [SizedPointer];
    sha256 : ?Blob;
    size : Nat;
    contentType : Text;
    createdAt : Time.Time;
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
    var thumbnailKey : ?Text;
    var encryptionMode : EncryptionMode;
  };

  public type DirectoryMetadataStore = {
    var color : ?DirectoryColor;
    var defaultEncryptionMode : EncryptionMode;
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
    var expiresAt : Time.Time;
    var totalBytes : Nat;
    chunkIds : Vector.Vector<ChunkId>;
  };

  public type StoredChunk = {
    pointer : SizedPointer;
    batchId : BatchId;
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
  };
};
