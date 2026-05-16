import Text "mo:core/Text";

module {
  public type Icrc3Value = {
    #Nat : Nat;
    #Int : Int;
    #Blob : Blob;
    #Text : Text;
    #Bool : Bool;
    #Array : [Icrc3Value];
    #Map : AttributeMap;
  };

  public type AttributeMap = [(Text, Icrc3Value)];

  public type VerifiedIdentityAttributes = {
    email : ?Text;
    name : ?Text;
    verifiedEmail : ?Bool;
    provider : ?Text;
  };

  public type IdentityAttributesSyncError = {
    #nonceNotFound;
    #nonceMismatch;
    #untrustedSigner;
    #invalidOrigin;
    #expired;
    #malformedPayload;
    #verifiedEmailRequired;
  };

  public type IdentityAttributesSyncResult = {
    #ok;
    #err : IdentityAttributesSyncError;
  };

  public let NONCE_TTL_NS : Nat = 300_000_000_000;

  public func isFresh(issuedAtNs : Nat, nowNs : Nat) : Bool {
    issuedAtNs <= nowNs and nowNs <= issuedAtNs + NONCE_TTL_NS;
  };

  public func get(entries : AttributeMap, key : Text) : ?Icrc3Value {
    for ((entryKey, value) in entries.vals()) {
      if (entryKey == key) return ?value;
    };
    null;
  };

  public func extractBlob(entries : AttributeMap, key : Text) : ?Blob {
    switch (get(entries, key)) {
      case (?#Blob value) ?value;
      case _ null;
    };
  };

  public func extractText(entries : AttributeMap, key : Text) : ?Text {
    switch (get(entries, key)) {
      case (?#Text value) ?value;
      case _ null;
    };
  };

  public func extractNat(entries : AttributeMap, key : Text) : ?Nat {
    switch (get(entries, key)) {
      case (?#Nat value) ?value;
      case _ null;
    };
  };

  public func extractScopedText(entries : AttributeMap, attrName : Text) : ?Text {
    switch (extractText(entries, attrName)) {
      case (?value) return ?value;
      case null {};
    };
    for ((key, value) in entries.vals()) {
      if (Text.startsWith(key, #text("openid:")) and Text.endsWith(key, #text(":" # attrName))) {
        switch value {
          case (#Text text) return ?text;
          case _ {};
        };
      };
    };
    null;
  };

  public func extractScopedBool(entries : AttributeMap, attrName : Text) : ?Bool {
    switch (get(entries, attrName)) {
      case (?#Bool value) return ?value;
      case _ {};
    };
    for ((key, value) in entries.vals()) {
      if (Text.startsWith(key, #text("openid:")) and Text.endsWith(key, #text(":" # attrName))) {
        switch value {
          case (#Bool bool) return ?bool;
          case _ {};
        };
      };
    };
    null;
  };

  public func inferProvider(entries : AttributeMap) : ?Text {
    for ((key, _) in entries.vals()) {
      if (Text.startsWith(key, #text("openid:"))) {
        if (Text.contains(key, #text("openid.localhost"))) return ?"dev_openid";
        if (Text.contains(key, #text("accounts.google.com"))) return ?"google";
        if (Text.contains(key, #text("appleid.apple.com"))) return ?"apple";
        if (Text.contains(key, #text("login.microsoftonline.com"))) return ?"microsoft";
        return ?"openid";
      };
      if (Text.startsWith(key, #text("sso:"))) return ?"sso";
    };
    null;
  };
};
