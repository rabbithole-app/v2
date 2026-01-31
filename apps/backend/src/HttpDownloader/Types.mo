import Map "mo:core/Map";
import Set "mo:core/Set";
import Queue "mo:core/Queue";
import Blob "mo:core/Blob";
import Text "mo:core/Text";
import Nat "mo:core/Nat";

import MemoryRegion "mo:memory-region/MemoryRegion";
import IC "mo:ic";

module {
  // -- Basic Types --

  /// Pointer to a memory region: (address, size)
  public type SizedPointer = (Nat, Nat);

  /// Unique key identifying a download
  public type DownloadKey = Text;

  type CommonAssetArgs = {
    key : DownloadKey;
    name : Text;
    contentType : Text;
    size : Nat;
  };

  // -- Download Arguments --

  /// Arguments for adding a new download to the queue
  public type AddDownloadArgs = CommonAssetArgs and {
    sha256 : ?Blob;
    url : Text;
  };

  // -- Download State --

  /// Internal request state for a download chunk
  public type DownloadRequest = {
    key : DownloadKey;
    request : IC.HttpRequestArgs;
    chunkId : Nat;
    attempts : Nat;
  };

  /// State of an in-progress download
  public type DownloadState = CommonAssetArgs and {
    sha256 : ?Blob;
    chunkStatuses : Map.Map<Nat, ChunkStatus>;
    var pointer : SizedPointer;
    var hash : ?Blob;
  };

  /// Completed download details with content
  public type DownloadDetails = CommonAssetArgs and {
    sha256 : Blob;
    content : Blob;
  };

  // -- Chunk Status --

  /// Status of an individual download chunk
  public type ChunkStatus = {
    #Pending;
    #Redirecting;
    #Retrying : { attempts : Nat; error : Text };
    #Downloading;
    #Downloaded : SizedPointer;
    #Error : Text;
  };

  // -- Store --

  /// HTTP downloader store containing all download state
  public type Store = {
    downloads : Set.Set<DownloadState>;
    requests : Queue.Queue<DownloadRequest>;
    region : MemoryRegion.MemoryRegion;
    httpHeaders : Set.Set<IC.HttpHeader>;
    var nextChunkId : Nat;
  };
};
