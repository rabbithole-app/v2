import Array "mo:core/Array";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Debug "mo:core/Debug";
import Option "mo:core/Option";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Map "mo:map/Map";
import BaseX "mo:base-x-encoder";
import CertifiedAssets "mo:certified-assets/Stable";
import HttpParser "mo:http-parser";
import Path "mo:url-kit/Path";
import Vector "mo:vector";
import TID "mo:tid";

import T "Types";
import Utils "Utils";
import FileSystem "FileSystem";
import File "FileSystem/File";
import ErrorMessages "ErrorMessages";

module {
  public func buildOkResponse(
    self : T.StableStore,
    path : Text,
    keyId : T.KeyId,
    file : T.FileMetadataStore,
    chunkIndex : Nat,
    etags : [Text],
    httpReq : T.HttpRequest,
  ) : Result.Result<T.HttpResponse, Text> {
    let headers = switch (file.sha256) {
      case (?hash) {
        let hex = BaseX.toHex(hash.vals(), { isUpper = false; prefix = #none });
        let etagValue = "\"" # hex # "\"";
        [("etag", etagValue)];
      };
      case null [];
    };

    let nextToken : T.CustomStreamingToken = {
      keyId;
      index = chunkIndex + 1;
      sha256 = file.sha256;
    };

    let ?callback : ?T.StreamingCallback = self.streamingCallback else return #err("Streaming callback not set");
    let streamingStrategy : T.StreamingStrategy = #Callback({
      token = to_candid (nextToken);
      callback;
    });

    let contentChunk = Option.get<Blob>(File.getChunk(self.fs, file, chunkIndex), "");

    assert contentChunk.size() <= 2 * (1024 ** 2);
    let (statusCode, body, optBodyHash) : (Nat16, Blob, ?Blob) = (200, contentChunk, file.sha256);
    let headersVector = Vector.fromArray<(Text, Text)>(headers);

    let httpRes = {
      status_code = statusCode;
      headers = Vector.toArray(headersVector);
      body;
      upgrade = null;
      streaming_strategy = null;
    };

    switch (
      CertifiedAssets.get_certificate(
        self.certs,
        httpReq,
        httpRes,
        optBodyHash,
      )
    ) {
      case (#ok(certifiedHeaders)) {
        for ((key, value) in certifiedHeaders.vals()) {
          Vector.add(headersVector, (key, value));
        };

        let numChunks = File.getChunksSize(file);

        let certifiedRes : T.HttpResponse = {
          httpRes with headers = Vector.toArray(headersVector);
          streaming_strategy = if (numChunks > 1 and statusCode != 304) ?streamingStrategy else null;
        };

        return #ok(certifiedRes);
      };
      case (#err message) return #err("CertifiedAssets.get_certificate failed: " # message # "\n" # debug_show { httpReq; httpRes = { httpRes with streaming_strategy = null } });
    };
  };

  public func redirectToCertifiedDomain(self : T.StableStore, url : HttpParser.URL) : T.HttpResponse {
    let canisterId = self.canisterId;

    let path = url.path.original;
    let domain = url.host.original;
    let location = if (Text.contains(domain, #text("ic0.app"))) {
      "https://" # Principal.toText(canisterId) # ".ic0.app" # path;
    } else {
      "https://" # Principal.toText(canisterId) # ".icp0.io" # path;
    };

    return {
      status_code = 308; // Permanent Redirect
      headers = [("Location", location)];
      body = "";
      upgrade = null;
      streaming_strategy = null;
    };
  };

  public func buildHttpResponse(self : T.StableStore, _req : T.HttpRequest, url : HttpParser.URL) : Result.Result<T.HttpResponse, Text> {
    let path = url.path.original;
    var req = _req;

    let keyId : T.KeyId = switch (Path.fromText(path)) {
      case (#ok segments) {
        let list = List.fromArray(segments);
        switch (List.size(list), List.get(list, 0), List.get(list, 1), List.get(list, 2)) {
          case (3, ?"encrypted", ?keyOwner, ?keyName) (Principal.fromText(keyOwner), Text.encodeUtf8(keyName));
          case _ return #err("Failed to parse path '" # path # "' into keyId");
        };
      };
      case (#err message) return #err message;
    };

    let file = switch (FileSystem.get(self.fs, #keyId(keyId))) {
      case (?{ metadata = #File(file) }) file;
      case (?{ metadata = #Directory _ }) return #err(ErrorMessages.badArgs());
      case null return #err(ErrorMessages.keyIdNotFound(keyId));
    };

    let certVersion : Nat16 = Option.get<Nat16>(req.certificate_version, 2);

    let etagValue = Array.find(
      req.headers,
      func(header : (Text, Text)) : Bool {
        header.0 == "if-none-match";
      },
    );

    let etagValues = switch (etagValue) {
      case (?(field, val)) [val];
      case (_) [];
    };

    buildOkResponse(self, path, keyId, file, 0, etagValues, req);

    // #err("No encoding found for " # debug_show url.path.original);
  };

  public func httpRequestStreamingCallback(self : T.StableStore, rawToken : T.StreamingToken) : Result.Result<T.StreamingCallbackResponse, Text> {
    let ?token : ?T.CustomStreamingToken = from_candid (rawToken) else return #err("httpRequestStreamingCallback(): Invalid token");

    let file = switch (FileSystem.get(self.fs, #keyId(token.keyId))) {
      case (?{ metadata = #File(file) }) file;
      case (?{ metadata = #Directory _ }) return #err(ErrorMessages.badArgs());
      case null return #err(ErrorMessages.keyIdNotFound(token.keyId));
    };

    switch (token.sha256, file.sha256) {
      case (?providedHash, ?hash) {
        if (hash != providedHash) {
          return #err(ErrorMessages.sha256HashMismatch(providedHash, hash));
        };
      };
      case _ {};
    };

    let numChunks = File.getChunksSize(file);
    let chunk = Option.get<Blob>(File.getChunk(self.fs, file, token.index), "");

    let nextToken : T.CustomStreamingToken = {
      keyId = token.keyId;
      index = token.index + 1;
      sha256 = file.sha256;
    };

    let response : T.StreamingCallbackResponse = {
      body = chunk;
      token = if (nextToken.index < numChunks) ?to_candid (nextToken) else (null);
    };

    #ok(response);
  };

  public func processHttpRequest(self : T.StableStore, req : T.HttpRequest) : Result.Result<T.HttpResponse, Text> {
    let headers = HttpParser.Headers(req.headers);
    let url = HttpParser.URL(req.url, headers);
    buildHttpResponse(self, req, url);
  };
};
