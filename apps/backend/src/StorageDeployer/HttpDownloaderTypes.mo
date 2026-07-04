import Map "mo:core/Map";
import Set "mo:core/Set";
import Queue "mo:core/Queue";
import Blob "mo:core/Blob";
import Text "mo:core/Text";
import Nat "mo:core/Nat";

import MemoryRegion "mo:memory-region/MemoryRegion";

module {
  // -- Frozen HTTP types --
  //
  // The downloader queue lives inside the stable orchestrator store, and
  // stable containers are invariant under upgrade. These shapes mirror
  // ic@3.2.0 exactly — the layout persisted on mainnet. Do NOT replace them
  // with mo:ic imports: the 3.2.0 → 4.2.0 bump widened `method` and made the
  // 2026-07-04 mainnet upgrade memory-incompatible. Values of these types are
  // subtypes of the current mo:ic call-site types, so outcalls take them
  // directly.

  public type HttpHeader = { name : Text; value : Text };

  public type HttpRequestResult = {
    status : Nat;
    body : Blob;
    headers : [HttpHeader];
  };

  public type HttpTransform = {
    function : shared query { context : Blob; response : HttpRequestResult } -> async HttpRequestResult;
    context : Blob;
  };

  public type HttpRequestArgs = {
    url : Text;
    method : { #get; #head; #post };
    max_response_bytes : ?Nat64;
    body : ?Blob;
    transform : ?HttpTransform;
    headers : [HttpHeader];
    is_replicated : ?Bool;
  };

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
    request : HttpRequestArgs;
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
    httpHeaders : Set.Set<HttpHeader>;
    var nextChunkId : Nat;
  };
};
