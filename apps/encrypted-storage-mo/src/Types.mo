import Time "mo:core/Time";

import VetKeys "mo:ic-vetkeys";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import MemoryRegion "mo:memory-region/MemoryRegion";
import CertifiedAssets "mo:certified-assets/Stable";

import V1 "Migrations/V1/Types";
import Migrations "Migrations/lib";

module {
  /* -------------- Versioned stable store (migration support) --------------- */

  public type VersionedStableStore = Migrations.VersionedStableStore;

  /* -------------- Re-exports from V1 (current stable types) --------------- */

  public type StableStore = V1.StableStore;
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
  public type StreamingCallback = V1.StreamingCallback;
  public type StreamingToken = V1.StreamingToken;
  public type StreamingCallbackResponse = V1.StreamingCallbackResponse;
  public type BatchId = V1.BatchId;
  public type ChunkId = V1.ChunkId;

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

  public type DirectoryMetadata = {
    color : ?DirectoryColor;
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
    overwrite : Bool;
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

  public type CreateBatchArguments = {
    entry : Entry;
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

  public type ChunkContent = {
    content : Blob;
  };

  public type Chunk = ChunkContent and {
    batchId : BatchId;
  };

  public type CreateChunkResponse = {
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
};
