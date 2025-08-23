import Principal "mo:core/Principal";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat8 "mo:core/Nat8";
import JWT "mo:jwt";
import ECDSA "mo:ecdsa";
import BaseX "mo:base-x-encoder";
import Option "mo:core/Option";
import Map "mo:map/Map";
import Set "mo:map/Set";
import Runtime "mo:core/Runtime";
import IC "mo:ic";

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

  public let hash_tokens : Map.HashUtils<JWT.Token> = (
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
    var keyPairBytes : ?([Nat8], [Nat8]);
    var refreshTokens : Map.Map<Text, RefreshToken>;
    var blacklist : Set.Set<JWT.Token>;
    canisterId : Principal;
  };

  public func new(canisterId : Principal) : Store {
    {
      var id = 0;
      var keyPairBytes = null;
      var refreshTokens = Map.new<Text, RefreshToken>();
      var blacklist = Set.new<JWT.Token>();
      canisterId;
    };
  };

  public func init(self : Store) : async () {
    ignore generateEcdsaKey(self);
  };

  func generateEcdsaKey(self : Store) : async Result.Result<(), Text> {
    if (Option.isSome(self.keyPairBytes)) return #ok;

    let random = await ic.raw_rand();
    let curve = ECDSA.prime256v1Curve();
    switch (ECDSA.generatePrivateKey(random.vals(), curve)) {
      case (#ok privateKey) {
        let publicKey = privateKey.getPublicKey().toBytes(#spki);
        self.keyPairBytes := ?(privateKey.toBytes(#sec1), publicKey);
        #ok;
      };
      case (#err message) #err(message);
    };
  };

  public func getEcdsaPublicKey(self : Store) : ?ECDSA.PublicKey {
    let ?keyPairBytes = self.keyPairBytes else return null;
    let #ok(publicKey) = ECDSA.publicKeyFromBytes(keyPairBytes.1.vals(), #spki) else return null;
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
        ("alg", #string("ES256")),
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
          ignore Set.put(self.blacklist, hash_tokens, value.token);
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
    self.blacklist := Set.filter<JWT.Token>(self.blacklist, hash_tokens, func(token) = Result.isOk(JWT.validate(token, unsafeValidationOptions)));
  };

  public func isBlacklisted(self : Store, accessToken : Text) : Bool {
    let #ok(token) = JWT.parse(accessToken) else return false;
    Set.has(self.blacklist, hash_tokens, token);
  };

  func sign(self : Store, unsignedToken : JWT.UnsignedToken) : async Result.Result<JWT.Token, Text> {
    let privateKey = do {
      let keyPairBytes = switch (self.keyPairBytes) {
        case (?v) v;
        case null {
          ignore generateEcdsaKey(self);
          let ?keyPairBytes = self.keyPairBytes else return #err("ECDSA key haven't initialized");
          keyPairBytes;
        };
      };
      let curve = ECDSA.prime256v1Curve();
      let #ok(key) = ECDSA.privateKeyFromBytes(keyPairBytes.0.vals(), #sec1({ curve })) else Runtime.unreachable();
      key;
    };
    let message = JWT.toBlobUnsigned(unsignedToken);
    let random = await ic.raw_rand();
    let signatureResult = privateKey.sign(message.vals(), random.vals());
    switch (signatureResult) {
      case (#ok signature) {
        let signatureInfo : JWT.SignatureInfo = {
          algorithm = "ES256";
          value = Blob.fromArray(signature.toBytes(#raw));
          message;
        };
        #ok({ unsignedToken with signature = signatureInfo });
      };
      case (#err message) #err message;
    };
  };
};
