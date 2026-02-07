import Map "mo:core/Map";
import Set "mo:core/Set";
import Queue "mo:core/Queue";
import Text "mo:core/Text";
import Order "mo:core/Order";
import Result "mo:core/Result";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Error "mo:core/Error";
import Option "mo:core/Option";

import MemoryRegion "mo:memory-region/MemoryRegion";
import IC "mo:ic";
import Sha256 "mo:sha2/Sha256";

import Types "HttpDownloaderTypes";

module {
  // -- Re-exported Types --

  public type SizedPointer = Types.SizedPointer;
  public type DownloadKey = Types.DownloadKey;
  public type AddDownloadArgs = Types.AddDownloadArgs;
  public type DownloadRequest = Types.DownloadRequest;
  public type DownloadState = Types.DownloadState;
  public type DownloadDetails = Types.DownloadDetails;
  public type ChunkStatus = Types.ChunkStatus;
  public type Store = Types.Store;

  let HTTP_OUTCALL_CYCLES : Nat = 50_000_000_000; // 50B cycles per HTTP request
  let MAX_CHUNK_SIZE : Nat = 1_950_000; // 1.95MB per HTTP outcall (50KB buffer for headers)
  let MAX_HTTP_REQUEST_ATTEMPTS : Nat = 3;

  func compareHeaders(a : IC.HttpHeader, b : IC.HttpHeader) : Order.Order = Text.compare(a.name, b.name);

  func compareDownloads(a : DownloadState, b : DownloadState) : Order.Order = Text.compare(a.key, b.key);

  // -- Public Functions --

  /// Create a new HTTP downloader store
  public func new({ httpHeaders; region } : { httpHeaders : [IC.HttpHeader]; region : ?MemoryRegion.MemoryRegion }) : Store {
    {
      downloads = Set.empty();
      requests = Queue.empty();
      region = Option.get(region, MemoryRegion.new());
      httpHeaders = Set.fromIter(httpHeaders.vals(), compareHeaders);
      var nextChunkId = 0;
    };
  };

  /// Add a default HTTP header to all requests
  public func addHeader(store : Store, header : IC.HttpHeader) : () {
    ignore Set.insert(store.httpHeaders, compareHeaders, header);
  };

  /// Add a file to the download queue
  public func add(store : Store, args : AddDownloadArgs) {
    if (has(store, args.key)) return;
    var offset : Nat = 0;
    let chunkStatuses = Map.empty<Nat, ChunkStatus>();
    let headers = Set.clone(store.httpHeaders);
    Set.add(headers, compareHeaders, { name = "Accept"; value = "application/octet-stream" });
    while (offset < args.size) {
      let rangeEnd = Nat.min(offset + MAX_CHUNK_SIZE - 1, args.size - 1);
      let rangeHeader = "bytes=" # Nat.toText(offset) # "-" # Nat.toText(rangeEnd);
      Set.add(headers, compareHeaders, { name = "Range"; value = rangeHeader });
      let request : IC.HttpRequestArgs = {
        url = args.url;
        max_response_bytes = null;
        headers = Set.values(headers) |> Iter.toArray(_);
        body = null;
        method = #get;
        transform = null;
        is_replicated = null;
      };
      let chunkId = store.nextChunkId;
      store.nextChunkId += 1;
      Queue.pushBack(store.requests, { key = args.key; request; chunkId; attempts = 0 });
      Map.add(chunkStatuses, Nat.compare, chunkId, #Pending);
      offset += MAX_CHUNK_SIZE;
    };
    let download : DownloadState = {
      key = args.key;
      name = args.name;
      contentType = args.contentType;
      sha256 = args.sha256;
      size = args.size;
      chunkStatuses;
      var pointer = (0, 0);
      var hash = null;
    };
    Set.add(store.downloads, compareDownloads, download);
  };

  /// Find a download by its key
  public func find(store : Store, key : DownloadKey) : ?DownloadState {
    for (item in Set.values(store.downloads)) {
      if (item.key == key) return ?item;
    };
    null;
  };

  /// Find a download by its content hash
  public func findByHash(store : Store, hash : Blob) : ?DownloadState {
    for (item in Set.values(store.downloads)) {
      if (item.hash == ?hash) return ?item;
    };
    null;
  };

  /// Check if a download exists
  public func has(store : Store, key : DownloadKey) : Bool = Option.isSome(find(store, key));

  /// Get completed download details including content
  public func get(store : Store, key : DownloadKey) : Result.Result<DownloadDetails, Text> {
    let ?download = find(store, key) else return #err("Download with key " # key # " not found");

    let hash = switch (download.sha256, download.hash) {
      case (?providedHash, ?hash) {
        if (hash != providedHash) {
          return #err("Provided hash does not match computed hash: " # debug_show ({ providedHash; hash }));
        };
        hash;
      };
      case (_, null) return #err("Download with key " # key # " is not completed");
      case (_, ?hash) hash;
    };
    let content = MemoryRegion.loadBlob(store.region, download.pointer.0, download.pointer.1);

    #ok({
      key;
      name = download.name;
      contentType = download.contentType;
      sha256 = hash;
      size = content.size();
      content;
    });
  };

  /// Process the next pending download request
  public func runRequests(store : Store) : async () {
    switch (Queue.popFront(store.requests)) {
      case (?{ request; attempts; chunkId; key }) {
        let ?download = find(store, key) else return;
        let prevStatus = Option.get(Map.get(download.chunkStatuses, Nat.compare, chunkId), #Pending);
        ignore Map.insert(download.chunkStatuses, Nat.compare, chunkId, #Downloading);
        let (status, nextRequest) = label exit : (ChunkStatus, ?{ #Back : DownloadRequest; #Front : DownloadRequest }) {
          try {
            let response = await (with cycles = HTTP_OUTCALL_CYCLES) IC.ic.http_request(request);

            if (response.status >= 300 and response.status < 400) {
              let redirectUrl = label headersLoop : ?Text {
                for ({ name; value } in response.headers.vals()) {
                  if (Text.toLower(name) == "location") break headersLoop(?value);
                };
                null;
              };

              switch (redirectUrl, prevStatus) {
                case (?newUrl, #Redirecting) {
                  if (attempts < MAX_HTTP_REQUEST_ATTEMPTS) {
                    let nextRequest = ?#Back({
                      request = { request with url = newUrl };
                      chunkId;
                      key;
                      attempts = attempts + 1;
                    });
                    break exit(#Redirecting, nextRequest);
                  } else {
                    break exit(#Error("Too many redirect attempts"), null);
                  };
                };
                case (?newUrl, _) {
                  let nextRequest = ?#Front({
                    request = { request with url = newUrl };
                    chunkId;
                    key;
                    attempts;
                  });
                  break exit(#Redirecting, nextRequest);
                };
                case (null, _) {
                  break exit(#Error("Redirect status " # Nat.toText(response.status) # " but no Location header found"), null);
                };
              };
            } else if (response.status < 200 or response.status >= 300) {
              break exit(#Error("HTTP request failed with status " # Nat.toText(response.status)), null);
            };

            let contentSize = response.body.size();
            let chunkAddress = MemoryRegion.addBlob(store.region, response.body);
            (#Downloaded(chunkAddress, contentSize), null);
          } catch (error) {
            if (attempts < MAX_HTTP_REQUEST_ATTEMPTS) {
              let nextRequest = ?#Back({
                request;
                chunkId;
                key;
                attempts = attempts + 1;
              });
              (#Retrying({ attempts = attempts + 1; error = "HTTP request failed: " # Error.message(error) }), nextRequest);
            } else {
              (#Error("HTTP request failed after " # Nat.toText(MAX_HTTP_REQUEST_ATTEMPTS) # " attempts: " # Error.message(error)), null);
            };
          };
        };
        switch (nextRequest) {
          case (?#Back(request)) {
            Queue.pushBack(store.requests, request);
          };
          case (?#Front(request)) {
            Queue.pushFront(store.requests, request);
          };
          case null {};
        };
        ignore Map.insert(download.chunkStatuses, Nat.compare, chunkId, status);
        checkDownloads(store);
      };
      case null {};
    };
  };

  func deallocate(region : MemoryRegion.MemoryRegion, download : DownloadState) {
    switch (download.pointer) {
      case (0, 0) {};
      case (address, size) {
        MemoryRegion.deallocate(region, address, size);
        return;
      };
    };

    for ((chunkId, status) in Map.entries(download.chunkStatuses)) {
      switch (status) {
        case (#Downloaded(pointer)) {
          MemoryRegion.deallocate(region, pointer.0, pointer.1);
        };
        case _ {};
      };
    };
  };

  /// Remove a download and deallocate its memory
  public func remove(store : Store, key : DownloadKey) : () {
    let ?download = find(store, key) else return;
    deallocate(store.region, download);
    Set.remove(store.downloads, compareDownloads, download);
  };

  /// Clear all downloads and deallocate memory
  public func clearDownloads(store : Store) : () {
    for (download in Set.values(store.downloads)) {
      deallocate(store.region, download);
    };

    Set.clear(store.downloads);
  };

  /// Clear all pending download requests
  public func clearRequests(store : Store) : () {
    Queue.clear(store.requests);
  };

  func checkDownloads(store : Store) : () {
    for (download in Set.values(store.downloads)) {
      let isEmpty = Map.isEmpty(download.chunkStatuses);
      let isDownloaded = not isEmpty and Map.all(download.chunkStatuses, func(k : Nat, v : ChunkStatus) : Bool = switch (v) { case (#Downloaded _) true; case _ false });
      if (isDownloaded) {
        // get pointers for downloaded chunks
        let pointers = Map.entries(download.chunkStatuses) |> Iter.filterMap<(Nat, ChunkStatus), (Nat, SizedPointer)>(_, func(k : Nat, v : ChunkStatus) : ?(Nat, SizedPointer) = switch (k, v) { case (chunkId, #Downloaded(pointer)) ?(chunkId, pointer); case _ null }) |> Iter.toArray(_);
        // load chunks from memory region
        let chunks = pointers.vals() |> Iter.sort<(Nat, SizedPointer)>(_, func(a : (Nat, SizedPointer), b : (Nat, SizedPointer)) : Order.Order = Nat.compare(a.0, b.0)) |> Iter.map<(Nat, SizedPointer), Blob>(_, func((_, (address, size))) : Blob = MemoryRegion.loadBlob(store.region, address, size));
        // deallocate old chunks
        var totalLength : Nat = 0;
        for ((_, (address, size)) in pointers.vals()) {
          MemoryRegion.deallocate(store.region, address, size);
          totalLength += size;
        };
        // allocate new space for the new content
        let newContentAddress = MemoryRegion.allocate(store.region, totalLength);
        var offset = 0;
        let sha256 = Sha256.Digest(#sha256);
        for (chunk in chunks) {
          MemoryRegion.storeBlob(store.region, newContentAddress + offset, chunk);
          offset += chunk.size();
          sha256.writeBlob(chunk);
        };
        download.hash := ?sha256.sum();
        download.pointer := (newContentAddress, totalLength);
        Map.clear(download.chunkStatuses);
      };
    };
  };
};
