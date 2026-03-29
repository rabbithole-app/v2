import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import { setTimer; recurringTimer } "mo:core/Timer";
import Error "mo:core/Error";

import Liminal "mo:liminal";
import JWTMiddleware "mo:liminal/Middleware/JWT";
import Route "mo:liminal/Route";
import Router "mo:liminal/Router";
import RouteContext "mo:liminal/RouteContext";
import RouterMiddleware "mo:liminal/Middleware/Router";

import AuthJWT "";

shared ({ caller = owner }) persistent actor class AuthJWTCanister() = self {
  transient let canisterId = Principal.fromActor(self);

  let authJWT = AuthJWT.new({
    canisterId;
    keyName = "dfx_test_key";
  });

  transient let routerConfig : RouterMiddleware.Config = {
    prefix = ?"/api";
    identityRequirement = ?#custom(
      func(identity) {
        if (identity.isAuthenticated()) {
          let #jwt(token) = identity.kind else return false;
          return not AuthJWT.isBlacklisted(authJWT, token);
        };

        false;
      }
    );
    routes = [
      Router.getQuery(
        "/whoami",
        func(context : RouteContext.RouteContext) : Route.HttpResponse {
          // Get authenticated identity
          switch (context.getIdentity()) {
            case (?identity) switch (identity.isAuthenticated(), identity.getId()) {
              case (true, ?id) return context.buildResponse(#ok, #json(#object_([("caller", #string id)])));
              case _ {};
            };
            case null {};
          };

          context.buildResponse(#unauthorized, #error(#message("Not logged in")));
        },
      )
    ];
  };

  // Http App
  transient let app = Liminal.App({
    middleware = [
      JWTMiddleware.new({
        locations = JWTMiddleware.defaultLocations;
        validation = {
          audience = #skip;
          issuer = #skip;
          signature = #resolver(
            func(issuer) = switch (AuthJWT.getEcdsaPublicKey(authJWT)) {
              case (?publicKey) Iter.singleton(#ecdsa(publicKey));
              case null Iter.empty();
            }
          );
          notBefore = true;
          expiration = true;
        };
      }),
      RouterMiddleware.new(routerConfig),
    ];
    errorSerializer = Liminal.defaultJsonErrorSerializer;
    candidRepresentationNegotiator = Liminal.defaultCandidRepresentationNegotiator;
    logger = Liminal.buildDebugLogger(#info);
  });

  // Http server methods

  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public shared ({ caller }) func authorize() : async Result.Result<AuthJWT.Tokens, Text> {
    await AuthJWT.get(authJWT, caller);
  };

  public shared ({ caller }) func refreshToken(token : Text) : async Result.Result<AuthJWT.Tokens, Text> {
    await AuthJWT.refresh(authJWT, caller, token);
  };

  // for testing JWT
  public query func getEcdsaPublicKey() : async Text {
    switch (AuthJWT.getEcdsaPublicKey(authJWT)) {
      case (?publicKey) publicKey.toText(#jwk);
      case null throw Error.reject("ECDSA key haven't initialized");
    };
  };

  ignore setTimer<system>(
    #seconds 0,
    func() : async () {
      await AuthJWT.init(authJWT);
    },
  );

  ignore recurringTimer<system>(
    #hours 1,
    func() : async () {
      AuthJWT.check(authJWT);
    },
  );
};
