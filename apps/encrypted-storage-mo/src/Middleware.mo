import App "mo:liminal/App";
import HttpContext "mo:liminal/HttpContext";
import EncryptedStorage "EncryptedStorage";

module {
  public type Config = EncryptedStorage.Config;

  /// Creates a new static encrypted storage middleware with the specified configuration
  /// Serves encrypted files from configured storage sources
  /// - Parameter options: EncryptedStorage configuration defining sources and serving behavior
  /// - Returns: A middleware that serves encrypted files
  public func new(options : Config) : App.Middleware {
    {
      name = "EncryptedStorage";
      handleQuery = func(httpContext : HttpContext.HttpContext, next : App.Next) : App.QueryResult {
        switch (EncryptedStorage.serve(httpContext, options)) {
          case (#noMatch) next();
          case (#response(response)) {
            httpContext.log(#debug_, "Served encrypted file");
            #response(response);
          };
        };
      };
      handleUpdate = func(httpContext : HttpContext.HttpContext, next : App.NextAsync) : async* App.HttpResponse {
        // Only works with query, but possible could add support for update. TODO?
        await* next();
      };
    };
  };
};
