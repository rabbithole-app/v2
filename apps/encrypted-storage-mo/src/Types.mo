import Time "mo:core/Time";
import Nat "mo:core/Nat";

import VetKeys "mo:ic-vetkeys";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import Vector "mo:vector";
import MemoryRegion "mo:memory-region/MemoryRegion";
import CertifiedAssets "mo:certified-assets/Stable";

import StableTID "StableTID";

module {
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

  public type Permission = VetKeys.AccessRights;

  public type PermissionExt = {
    #Read;
    #ReadWrite;
    #ReadWriteManage;
    #Controller;
  };

  public type StableStore = {
    canisterId : Principal;
    region : MemoryRegion.MemoryRegion;
    fs : FileSystemStore;
    upload : UploadStore;
    certs : CertifiedAssets.StableStore;
    vetKdKeyId : ManagementCanister.VetKdKeyid;
    domainSeparatorBytes : Blob;
    var streamingCallback : ?StreamingCallback;
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

  public type GrantPermissionArguments = {
    entry : ?Entry;
    user : Principal;
    permission : Permission;
  };

  public type RevokePermissionArguments = {
    entry : ?Entry;
    user : Principal;
  };

  public type HasPermissionArguments = GrantPermissionArguments;

  /* ---------------------------------- File ---------------------------------- */

  public type FileMetadata = {
    // A sha256 representation of the raw content calculated on the frontend side.
    // used for duplicate detection (and certification?)
    sha256 : ?Blob;
    contentType : Text;
    size : Nat;
    thumbnailKey : ?Text;
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

  public type FileMetadataStore = {
    var contentPointer : SizedPointer;
    var sha256 : ?Blob;
    var size : Nat;
    var contentType : Text;
    var locked : Bool;
    // key in the asset canister
    var thumbnailKey : ?Text;
  };

  public type NodeMetadataStore = {
    #File : FileMetadataStore;
    #Directory : DirectoryMetadataStore;
  };

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

  public type NodeDetails = NodeBase and {
    permissions : [(Principal, Permission)];
    metadata : {
      #File : FileMetadata;
      #Directory : DirectoryMetadata;
    };
  };

  public type SetThumbnailArguments = {
    entry : Entry;
    thumbnailKey : ?Text;
  };

  /* -------------------------------- Directory ------------------------------- */

  public type DirectoryColor = {
    #blue;
    #yellow;
    #orange;
    #purple;
    #pink;
    #gray;
    #green;
  };

  public type DirectoryMetadataStore = {
    var color : ?DirectoryColor;
  };

  public type DirectoryMetadata = {
    color : ?DirectoryColor;
    // size : ?Nat;
  };

  /* ------------------------------- FileSystem ------------------------------- */

  // (kind, parentId, name)
  public type NodeKey = ({ #File; #Directory }, ?Nat64, Text);

  public type NodeMetadata = {
    #File : FileMetadata;
    #Directory : DirectoryMetadata;
  };

  public type Node = NodeStore;

  public type PermissionMap = Map.Map<Principal, Permission>;

  type FileSystemStoreBase = {
    region : MemoryRegion.MemoryRegion;
  };

  public type FileSystemInitArgs = FileSystemStoreBase and {
    rootPermissions : [(Principal, Permission)];
  };

  public type FileSystemStore = FileSystemStoreBase and {
    nodes : Map.Map<NodeKey, NodeStore>;
    rootPermissions : PermissionMap;
    tid : StableTID.Store;
  };

  public type EncryptedStorageInitArgs = {
    canisterId : Principal;
    vetKdKeyId : ManagementCanister.VetKdKeyid;
    domainSeparator : Text;
    region : MemoryRegion.MemoryRegion;
    rootPermissions : [(Principal, Permission)];
    certs : ?CertifiedAssets.StableStore;
  };

  public type Entry = ({ #File; #Directory }, Text);

  public type GetArguments = {
    entry : Entry;
  };

  public type CreateArguments = {
    entry : Entry;
  };

  public type UpdateArguments = {
    #File : {
      path : Text;
      metadata : {
        // A sha256 representation of the raw content calculated on the frontend side.
        // used for duplicate detection (and certification?)
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

  public type MoveArguments = {
    entry : Entry;
    target : ?Entry;
  };

  public type DeleteArguments = {
    entry : Entry;
    recursive : Bool;
  };

  public type GetChunkArguments = {
    entry : Entry;
    chunkIndex : Nat;
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

  public type BatchId = Nat;

  public type ChunkId = Nat;

  public type Batch = {
    var expiresAt : Time.Time;
    var totalBytes : Nat;
    chunkIds : Vector.Vector<ChunkId>;
  };

  public type CreateBatchResponse = {
    batchId : BatchId;
  };

  public type CreateChunkArguments = Chunk;

  public type CreateChunksArguments = {
    batchId : BatchId;
    content : [Blob];
  };

  public type DeleteBatchArguments = {
    batchId : BatchId;
  };

  public type SizedPointer = (Nat, Nat);

  public type ChunkContent = {
    content : Blob;
  };

  public type Chunk = ChunkContent and {
    batchId : BatchId;
  };

  public type CreateChunkResponse = {
    chunkId : Nat;
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

  public type ConfigurationResponse = {
    maxBatches : ?Nat64;
    maxChunks : ?Nat64;
    maxBytes : ?Nat64;
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

  public type StreamingCallback = shared query (StreamingToken) -> async StreamingCallbackResponse;
  public type StreamingToken = Blob;
  public type CustomStreamingToken = {
    keyId : KeyId;
    sha256 : ?Blob;
    index : Nat;
  };
  public type StreamingCallbackResponse = {
    body : Blob;
    token : ?StreamingToken;
  };

  public type StreamingCallbackResponseAny = {
    body : Blob;
    token : ?Any;
  };
};
