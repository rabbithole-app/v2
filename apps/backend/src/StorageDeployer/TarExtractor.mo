import MemoryRegion "mo:memory-region/MemoryRegion";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Order "mo:core/Order";
import Sha256 "mo:sha2/Sha256";

import Tar "mo:tar";
import IncGzipDecoder "IncGzipDecoder";
import Types "Types";

module TarExtractor {
  let extensionToContentType = [
    ("html", "text/html"),
    ("css", "text/css"),
    ("br", "application/brotli"),
    ("js", "text/javascript"),
    ("json", "application/json"),
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("svg", "image/svg+xml"),
    ("ico", "image/x-icon"),
    ("woff", "font/woff"),
    ("woff2", "font/woff2"),
    ("ttf", "font/ttf"),
    ("eot", "application/vnd.ms-fontobject"),
    ("txt", "text/plain"),
    ("xml", "application/xml"),
    ("pdf", "application/pdf"),
    ("zip", "application/zip"),
    ("wasm", "application/wasm"),
    ("gz", "application/gzip"),
  ];

  func compareFiles(a : Types.File, b : Types.File) : Order.Order = Text.compare(a.key, b.key);

  public type Status = {
    #Idle;
    #Decoding : Types.Progress;
    #Complete;
  };

  public type Store = {
    files : Set.Set<Types.File>;
    pointer : Types.SizedPointer;
    region : MemoryRegion.MemoryRegion;
    gzipDecoder : IncGzipDecoder.Store;
    isGzipped : Bool;
    var status : Status;
    var decompressedPointer : ?Types.SizedPointer; // Pointer to decompressed tar data (if gzipped)
  };

  public func new({ region; pointer; isGzipped } : { region : MemoryRegion.MemoryRegion; pointer : Types.SizedPointer; isGzipped : Bool }) : Store {
    {
      region;
      pointer;
      isGzipped;
      files = Set.empty();
      gzipDecoder = IncGzipDecoder.new(region);
      var status = #Idle;
      var decompressedPointer = null;
    };
  };

  public func extract<system>(store : Store) : () {
    store.status := #Decoding({ processed = 0; total = store.pointer.1 });

    if (store.isGzipped) {
      // Gzipped tar - use incremental decoder
      IncGzipDecoder.decode<system>(
        store.gzipDecoder,
        {
          pointer = store.pointer;
          offset = 0;
          onProgress = ?(
            func(progress) {
              store.status := #Decoding(progress);
            }
          );
          onFinish = ?(
            func(pointer) {
              // Gzip decompression complete, save pointer for later deallocation
              store.decompressedPointer := ?pointer;
              // Now extract tar entries
              extractTarEntries(store, pointer);
            }
          );
        },
      );
    } else {
      // Plain tar - extract directly without gzip decompression
      extractTarEntries(store, store.pointer);
    };
  };

  // Check if a tar entry is a macOS Apple Double resource fork file (._*)
  func isAppleDoubleFile(name : Text) : Bool {
    Text.contains(name, #text "/._") or Text.startsWith(name, #text "._");
  };

  // Extract tar entries from blob at given pointer
  func extractTarEntries(store : Store, pointer : Types.SizedPointer) : () {
    let blob = MemoryRegion.loadBlob(store.region, pointer.0, pointer.1);
    for (entry in Tar.entries(blob)) {
      if (entry.typ == #file and not isAppleDoubleFile(entry.name)) {
        let file = {
          key = Text.trimStart(entry.name, #char('.'));
          content = entry.content;
          contentType = inferContentType(entry.name);
          size = entry.size;
          sha256 = Sha256.fromBlob(#sha256, entry.content);
        };
        Set.add(store.files, compareFiles, file);
      };
    };
    store.status := #Complete;
  };

  public func cancel<system>(store : Store) : () {
    IncGzipDecoder.cancel<system>(store.gzipDecoder);
  };

  /// Clear all extracted files and deallocate memory
  /// Call this before removing the store to free memory region resources
  public func clear<system>(store : Store) : () {
    // Cancel any ongoing decoding
    IncGzipDecoder.cancel<system>(store.gzipDecoder);

    // Deallocate the decompressed tar data from memory region
    switch (store.decompressedPointer) {
      case (?(address, size)) {
        MemoryRegion.deallocate(store.region, address, size);
        store.decompressedPointer := null;
      };
      case null {};
    };

    // Clear the files set - Blob content will be garbage collected
    Set.clear(store.files);

    // Reset status
    store.status := #Idle;
  };

  public func getStatus(store : Store) : Status {
    store.status;
  };

  public func getFiles(store : Store) : [Types.File] {
    Set.toArray(store.files);
  };

  // Infer MIME type from file extension
  func inferContentType(path : Text) : Text {
    for ((extension, contentType) in extensionToContentType.vals()) {
      if (Text.endsWith(path, #text("." # extension))) return contentType;
    };
    "application/octet-stream";
  };
};
