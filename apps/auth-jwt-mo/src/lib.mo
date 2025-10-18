import Principal "mo:core/Principal";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Result "mo:core/Result";
import Time "mo:core/Time";
import JWT "mo:jwt";
import ECDSA "mo:ecdsa";
import BaseX "mo:base-x-encoder";
import Map "mo:map/Map";
import Set "mo:map/Set";
import Error "mo:core/Error";
import IC "mo:ic";
import Sha256 "mo:sha2/Sha256";

module AuthJWT {
  let ACCESS_TOKEN_EXPIRY_NANOS = 900_000_000_000; // 15 minutes
  let REFRESH_TOKEN_EXPIRY_NANOS = 7_200_000_000_000; // 2 hours
  let ic = actor ("aaaaa-aa") : IC.Service;
  let { thash; hashText } = Map;

  // These options are used internally to validate the validity of tokens.
  let unsafeValidationOptions : JWT.ValidationOptions = {
    expiration = true;
    notBefore = true;
    issuer = #skip;
    audience = #skip;
    signature = #skip;
  };

  public let hashTokens : Map.HashUtils<JWT.Token> = (
    func(key) = hashText(JWT.toText(key)),
    func(a, b) = Text.equal(JWT.toText(a), JWT.toText(b)),
  );

  public type RefreshToken = {
    expiresAt : Time.Time;
    token : JWT.Token;
  };

  public type Tokens = {
    accessToken : Text;
    refreshToken : Text;
  };

  public type Store = {
    var id : Int;
    var refreshTokens : Map.Map<Text, RefreshToken>;
    var blacklist : Set.Set<JWT.Token>;
    canisterId : Principal;
    keyId : { curve : IC.EcdsaCurve; name : Text };
    var publicKey : ?Blob;
  };

  public type InitArgs = {
    canisterId : Principal;
    keyName : Text;
  };

  public func new({ canisterId; keyName } : InitArgs) : Store {
    {
      var id = 0;
      var refreshTokens = Map.new<Text, RefreshToken>();
      var blacklist = Set.new<JWT.Token>();
      var publicKey = null;
      canisterId;
      keyId = {
        curve = #secp256k1;
        name = keyName;
      };
    };
  };

  public func init(self : Store) : async () {
    let { public_key } = await ic.ecdsa_public_key({
      canister_id = ?self.canisterId;
      derivation_path = [];
      key_id = self.keyId;
    });
    self.publicKey := ?public_key;
  };

  public func getEcdsaPublicKey(self : Store) : ?ECDSA.PublicKey {
    let ?blob = self.publicKey else return null;
    let #ok(publicKey) = ECDSA.publicKeyFromBytes(Iter.fromArray(Blob.toArray(blob)), #raw({ curve = ECDSA.secp256k1Curve() })) else return null;
    ?publicKey;
  };

  func random() : async Text {
    let random = await ic.raw_rand();
    BaseX.toBase64(random.vals(), #standard({ includePadding = false }));
  };

  func getUnsignedToken(self : Store, caller : Principal) : JWT.UnsignedToken {
    self.id := Int.add(self.id, 1);
    let now = Time.now();
    let unsignedToken : JWT.UnsignedToken = {
      header = [
        ("alg", #string("ES256K")),
        ("typ", #string("JWT")),
      ];
      payload = [
        ("sub", #string(Principal.toText(caller))),
        ("iat", #number(#int(now / 1_000_000_000))),
        ("exp", #number(#int((now + ACCESS_TOKEN_EXPIRY_NANOS) / 1_000_000_000))),
        ("iss", #string("https://" # Principal.toText(self.canisterId) # ".icp0.io")),
        ("jti", #number(#int(self.id))),
      ];
    };
    unsignedToken;
  };

  public func get(self : Store, caller : Principal) : async Result.Result<Tokens, Text> {
    let unsignedToken = getUnsignedToken(self, caller);
    switch (await sign(self, unsignedToken)) {
      case (#ok token) {
        let refreshToken = await random();
        ignore Map.put(self.refreshTokens, thash, refreshToken, { expiresAt = Time.now() + REFRESH_TOKEN_EXPIRY_NANOS; token });
        #ok({ accessToken = JWT.toText(token); refreshToken });
      };
      case (#err message) #err message;
    };
  };

  public func refresh(self : Store, caller : Principal, refreshToken : Text) : async Result.Result<Tokens, Text> {
    let ?value = Map.get(self.refreshTokens, thash, refreshToken) else return #err("refreshToken not found");

    if (value.expiresAt < Time.now()) {
      Map.delete(self.refreshTokens, thash, refreshToken);
      return #err("refreshToken expired");
    };

    let unsignedToken = getUnsignedToken(self, caller);
    switch (await sign(self, unsignedToken)) {
      case (#ok token) {
        if (Result.isOk(JWT.validate(value.token, unsafeValidationOptions))) {
          ignore Set.put(self.blacklist, hashTokens, value.token);
        };

        let accessToken = JWT.toText(token);
        ignore Map.put(self.refreshTokens, thash, refreshToken, { value with token });
        #ok({ accessToken; refreshToken });
      };
      case (#err message) #err message;
    };
  };

  public func check(self : Store) {
    let now = Time.now();
    self.refreshTokens := Map.filter<Text, RefreshToken>(self.refreshTokens, thash, func(_, { expiresAt }) = expiresAt > now);
    self.blacklist := Set.filter<JWT.Token>(self.blacklist, hashTokens, func(token) = Result.isOk(JWT.validate(token, unsafeValidationOptions)));
  };

  public func isBlacklisted(self : Store, token : JWT.Token) : Bool {
    Set.has(self.blacklist, hashTokens, token);
  };

  func sign(self : Store, unsignedToken : JWT.UnsignedToken) : async Result.Result<JWT.Token, Text> {
    try {
      let message = JWT.toBlobUnsigned(unsignedToken);
      let { signature } = await (with cycles = 30_000_000_000) ic.sign_with_ecdsa({
        message_hash = Sha256.fromBlob(#sha256, message);
        derivation_path = [];
        key_id = self.keyId;
      });
      let signatureInfo : JWT.SignatureInfo = {
        algorithm = "ES256K";
        value = signature;
        message;
      };
      #ok({ unsignedToken with signature = signatureInfo });
    } catch (error) {
      #err(Error.message(error));
    };
  };
};
