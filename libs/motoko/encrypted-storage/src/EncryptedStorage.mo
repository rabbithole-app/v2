import Nat "mo:core/Nat";
import Blob "mo:core/Blob";
import Nat16 "mo:core/Nat16";

import HttpContext "mo:liminal/HttpContext";
import { type HttpResponse } "mo:liminal/Types";
import EncryptedStorage "";
import T "Types";

module {
  public type Config = {
    store : T.StableStore;
  };

  // public type StreamingStrategy = {
  //   #none;
  //   #callback : shared query (Blob) -> async T.StreamingCallbackResponse;
  // };

  public type StreamResult = {
    kind : T.StreamingStrategy;
    response : HttpResponse;
  };

  /// Serves static assets through an asset canister integration.
  /// Attempts to serve the requested path from the configured asset store and returns
  /// an appropriate response or indicates no match was found.
  ///
  /// ```motoko
  /// import EncryptedStorageMiddleware "mo:encrypted-storage/Middleware";
  ///
  /// let config = {
  ///     store = encryptedStorage; // Your asset canister reference
  /// };
  ///
  /// switch (EncryptedStorageMiddleware.serve(httpContext, config)) {
  ///     case (#response(response)) {
  ///         // Asset found and served
  ///         response
  ///     };
  ///     case (#noMatch) {
  ///         // No asset found, continue to other handlers
  ///         httpContext.buildResponse(#notFound, #error(#message("Not found")))
  ///     };
  /// }
  /// ```
  public func serve(
    httpContext : HttpContext.HttpContext,
    options : Config,
  ) : {
    #response : HttpResponse;
    #noMatch;
  } {

    let request = {
      httpContext.request with
      certificate_version = httpContext.certificateVersion;
    };
    switch (EncryptedStorage.httpRequest(options.store, request)) {
      case (#err(e)) {
        httpContext.log(#error, "Error serving asset: " # debug_show (e));
        return #noMatch;
      }; // TODO handle error
      case (#ok(response)) {
        switch (response.streaming_strategy) {
          case (null) ();
          case (?streamingStrategy) switch (streamingStrategy) {
            case (#Callback(callback)) {
              return #response({
                statusCode = Nat16.toNat(response.status_code);
                headers = response.headers;
                body = ?response.body;
                streamingStrategy = ?#callback(callback);
              });
            };
          };
        };
        #response({
          statusCode = Nat16.toNat(response.status_code);
          headers = response.headers;
          body = ?response.body;
          streamingStrategy = null;
        });
      };
    };
  };

};
