import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Result "mo:core/Result";
import Text "mo:core/Text";

import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import Vector "mo:vector";

import Types "Types";

/// Indexes a raw (uncompressed) tar archive in place: walks 512-byte headers,
/// records per-file content offsets and computes sha256 without materializing
/// file contents on the heap. Contents stay in the MemoryRegion and are read
/// per-chunk on demand.
module TarIndexer {
  let BLOCK_SIZE : Nat = 512;
  /// Window size for incremental hashing reads from the region.
  let HASH_WINDOW : Nat = 1_048_576;

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

  public type IndexEntry = {
    key : Text;
    contentType : Text;
    size : Nat;
    sha256 : Blob;
    /// Absolute region address of the file content start
    contentOffset : Nat;
  };

  public type Index = {
    entries : [IndexEntry];
    totalBytes : Nat;
  };

  public func inferContentType(path : Text) : Text {
    for ((extension, contentType) in extensionToContentType.vals()) {
      if (Text.endsWith(path, #text("." # extension))) return contentType;
    };
    "application/octet-stream";
  };

  func isAppleDoubleFile(name : Text) : Bool {
    Text.contains(name, #text "/._") or Text.startsWith(name, #text "._");
  };

  func isZeroBlock(block : [Nat8]) : Bool {
    for (byte in block.vals()) {
      if (byte != 0) return false;
    };
    true;
  };

  func parseOctal(block : [Nat8], start : Nat, len : Nat) : Result.Result<Nat, Text> {
    // GNU base-256 extension (first byte >= 0x80) is unsupported
    if (block[start] >= 0x80) return #err("base-256 tar field is not supported");
    var value = 0;
    var i = start;
    var seenDigit = false;
    label parse while (i < start + len) {
      let byte = block[i];
      if (byte == 0x20 and not seenDigit) { i += 1; continue parse }; // leading spaces
      if (byte == 0 or byte == 0x20) break parse; // terminator
      if (byte < 0x30 or byte > 0x37) return #err("invalid octal digit in tar header");
      value := value * 8 + Nat8.toNat(byte - 0x30);
      seenDigit := true;
      i += 1;
    };
    #ok(value);
  };

  func parseName(block : [Nat8], start : Nat, len : Nat) : Result.Result<Text, Text> {
    var end = start;
    while (end < start + len and block[end] != 0) {
      end += 1;
    };
    let bytes = Array.sliceToArray<Nat8>(block, start, end);
    switch (Text.decodeUtf8(Blob.fromArray(bytes))) {
      case (?text) #ok(text);
      case null #err("invalid UTF-8 in tar entry name");
    };
  };

  /// Extract the `path` record from a pax extended header ('x' typeflag).
  /// Records have the form "<len> <key>=<value>\n" where len counts the
  /// whole record including the length field and the newline.
  func parsePaxPath(region : MemoryRegion.MemoryRegion, address : Nat, size : Nat) : Result.Result<?Text, Text> {
    let content = Blob.toArray(MemoryRegion.loadBlob(region, address, size));
    var i = 0;
    var path : ?Text = null;
    while (i < size) {
      var len = 0;
      var j = i;
      while (j < size and content[j] >= 0x30 and content[j] <= 0x39) {
        len := len * 10 + Nat8.toNat(content[j]) - 48;
        j += 1;
      };
      if (j >= size or content[j] != 0x20 or len == 0 or i + len > size) {
        return #err("invalid pax record");
      };
      let recordEnd = i + len;
      var k = j + 1;
      while (k < recordEnd and content[k] != 0x3D) k += 1; // '='
      if (k >= recordEnd) return #err("invalid pax record");
      if (Array.sliceToArray<Nat8>(content, j + 1, k) == [0x70, 0x61, 0x74, 0x68]) { // "path"
        let valueBytes = Array.sliceToArray<Nat8>(content, k + 1, recordEnd - 1);
        switch (Text.decodeUtf8(Blob.fromArray(valueBytes))) {
          case (?value) path := ?value;
          case null return #err("invalid UTF-8 in pax path");
        };
      };
      i := recordEnd;
    };
    #ok(path);
  };

  func hashContent(region : MemoryRegion.MemoryRegion, address : Nat, size : Nat) : Blob {
    let digest = Sha256.Digest(#sha256);
    var offset = 0;
    while (offset < size) {
      let window = Nat.min(HASH_WINDOW, size - offset);
      digest.writeBlob(MemoryRegion.loadBlob(region, address + offset, window));
      offset += window;
    };
    digest.sum();
  };

  /// Single pass over a raw tar at `pointer`. Handles ustar (POSIX) and GNU
  /// formats, GNU long names ('L'), skips directories, links, PAX headers and
  /// AppleDouble files. Stops at the first zero block.
  public func buildIndex(region : MemoryRegion.MemoryRegion, pointer : Types.SizedPointer) : Result.Result<Index, Text> {
    let (base, total) = pointer;
    let entries = Vector.new<IndexEntry>();
    var totalBytes = 0;
    var offset = 0;
    var pendingLongName : ?Text = null;
    var pendingPaxPath : ?Text = null;

    label walk while (offset + BLOCK_SIZE <= total) {
      let header = Blob.toArray(MemoryRegion.loadBlob(region, base + offset, BLOCK_SIZE));
      if (isZeroBlock(header)) break walk;

      // magic at 257: POSIX "ustar\0" + version "00", GNU "ustar  \0"
      if (header[257] != 0x75 or header[258] != 0x73 or header[259] != 0x74 or header[260] != 0x61 or header[261] != 0x72) {
        return #err("invalid tar header magic at offset " # Nat.toText(offset));
      };
      let isPosixUstar = header[262] == 0;

      let size = switch (parseOctal(header, 124, 12)) {
        case (#ok(size)) size;
        case (#err(e)) return #err(e # " at offset " # Nat.toText(offset));
      };
      let contentStart = offset + BLOCK_SIZE;
      if (contentStart + size > total) return #err("truncated tar entry at offset " # Nat.toText(offset));

      let typeflag = header[156];
      switch (typeflag) {
        // 'L' — GNU long name: content holds the next entry's name
        case (0x4C) {
          let nameBlock = Blob.toArray(MemoryRegion.loadBlob(region, base + contentStart, size));
          switch (parseName(nameBlock, 0, size)) {
            case (#ok(name)) pendingLongName := ?name;
            case (#err(e)) return #err(e # " at offset " # Nat.toText(offset));
          };
        };
        // 'x' — pax extended header: may override the next entry's path
        // (bsdtar emits these for long paths; also for xattrs, mtimes etc.)
        case (0x78) {
          switch (parsePaxPath(region, base + contentStart, size)) {
            case (#ok(?path)) pendingPaxPath := ?path;
            case (#ok(null)) {};
            case (#err(e)) return #err(e # " at offset " # Nat.toText(offset));
          };
        };
        // regular file: NUL or '0'
        case (0x00 or 0x30) {
          let name = switch (pendingPaxPath, pendingLongName) {
            case (?paxPath, _) paxPath;
            case (null, ?longName) longName;
            case (null, null) {
              switch (parseName(header, 0, 100)) {
                case (#err(e)) return #err(e # " at offset " # Nat.toText(offset));
                case (#ok(shortName)) {
                  // POSIX ustar splits long paths into prefix + name; GNU
                  // reuses the prefix area for other fields
                  if (isPosixUstar and header[345] != 0) {
                    switch (parseName(header, 345, 155)) {
                      case (#ok(prefix)) prefix # "/" # shortName;
                      case (#err(e)) return #err(e # " at offset " # Nat.toText(offset));
                    };
                  } else shortName;
                };
              };
            };
          };
          pendingLongName := null;
          pendingPaxPath := null;

          if (not isAppleDoubleFile(name)) {
            Vector.add(
              entries,
              {
                key = Text.trimStart(name, #char('.'));
                contentType = inferContentType(name);
                size;
                sha256 = hashContent(region, base + contentStart, size);
                contentOffset = base + contentStart;
              },
            );
            totalBytes += size;
          };
        };
        // directories, links, pax global headers ('g'), GNU long linkname ('K'), etc.
        case (_) {
          pendingLongName := null;
          pendingPaxPath := null;
        };
      };

      let contentBlocks = (size + BLOCK_SIZE - 1) / BLOCK_SIZE;
      offset := contentStart + contentBlocks * BLOCK_SIZE;
    };

    let sorted = Array.sort<IndexEntry>(
      Vector.toArray(entries),
      func(a, b) = Text.compare(a.key, b.key),
    );
    #ok({ entries = sorted; totalBytes });
  };
};
