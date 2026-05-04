import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Prim "mo:⛔";

import IdentityVerification "lib";
import Utils "../Utils/lib";

mixin(
  deps : {
    upsertFromVerifiedAttributes : (Principal, IdentityVerification.VerifiedIdentityAttributes) -> Result.Result<(), Text>;
  }
) {
  type AttributeMap = IdentityVerification.AttributeMap;
  type Icrc3Value = IdentityVerification.Icrc3Value;
  type IdentityAttributesSyncResult = IdentityVerification.IdentityAttributesSyncResult;

  transient let pendingNonces : Map.Map<Blob, Time.Time> = Map.empty();

  func pruneExpiredNonces() {
    let now = Time.now();
    for ((nonce, createdAt) in Map.entries(pendingNonces)) {
      if (Int.abs(now - createdAt) > IdentityVerification.NONCE_TTL_NS) {
        Map.remove(pendingNonces, Blob.compare, nonce);
      };
    };
  };

  public shared func attributeNonceBegin() : async Blob {
    pruneExpiredNonces();
    let nonce = await Random.blob();
    Map.add(pendingNonces, Blob.compare, nonce, Time.now());
    nonce;
  };

  public shared ({ caller }) func syncIdentityAttributes(nonce : Blob) : async IdentityAttributesSyncResult {
    assert not Principal.isAnonymous(caller);

    let ?_createdAt = Map.get(pendingNonces, Blob.compare, nonce) else {
      return #err(#nonceNotFound);
    };
    Map.remove(pendingNonces, Blob.compare, nonce);

    let signerBlob = Prim.callerInfoSigner<system>();
    if (signerBlob.size() == 0) {
      return #err(#untrustedSigner);
    };

    let signer = Principal.fromBlob(signerBlob);
    let trustedIdentitySigner = Principal.fromText(Utils.envText<system>("PUBLIC_CANISTER_ID:internet_identity_backend", "rdmx6-jaaaa-aaaaa-aaadq-cai"));
    if (signer != trustedIdentitySigner) {
      return #err(#untrustedSigner);
    };

    let data = Prim.callerInfoData<system>();
    let ?attrsMap = decodeIcrc3ValueMap(data) else {
      return #err(#malformedPayload);
    };

    let ?dataNonce = extractBlob(attrsMap, "implicit:nonce") else {
      return #err(#malformedPayload);
    };
    if (dataNonce != nonce) {
      return #err(#nonceMismatch);
    };

    let ?origin = extractText(attrsMap, "implicit:origin") else {
      return #err(#malformedPayload);
    };
    let expectedIdentityOrigin = resolveExpectedIdentityOrigin<system>();
    if (origin != expectedIdentityOrigin) {
      return #err(#invalidOrigin);
    };

    let ?issuedAt = extractNat(attrsMap, "implicit:issued_at_timestamp_ns") else {
      return #err(#malformedPayload);
    };
    if (not IdentityVerification.isFresh(issuedAt, Int.abs(Time.now()))) {
      return #err(#expired);
    };

    let attrs : IdentityVerification.VerifiedIdentityAttributes = {
      email = extractScopedText(attrsMap, "email");
      name = extractScopedText(attrsMap, "name");
      verifiedEmail = switch (extractScopedBool(attrsMap, "verified_email")) {
        case (?value) ?value;
        case null extractScopedBool(attrsMap, "email_verified");
      };
      authProvider = inferProvider(attrsMap);
    };

    switch (deps.upsertFromVerifiedAttributes(caller, attrs)) {
      case (#ok _) #ok;
      case (#err _) #err(#malformedPayload);
    };
  };

  func decodeIcrc3ValueMap(data : Blob) : ?AttributeMap {
    let ?val = (from_candid (data) : ?Icrc3Value) else return null;
    switch val {
      case (#Map entries) ?entries;
      case _ null;
    };
  };

  func resolveExpectedIdentityOrigin<system>() : Text {
    switch (Runtime.envVar<system>("PUBLIC_AUTH_EXPECTED_ORIGIN")) {
      case (?origin) return origin;
      case null {};
    };

    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:internet_identity_backend")) {
      case (?_) return "http://localhost:4200";
      case null {};
    };

    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-frontend")) {
      case (?frontendId) return "https://" # frontendId # ".icp0.io";
      case null return "https://rabbithole.app";
    };
  };

  func get(entries : AttributeMap, key : Text) : ?Icrc3Value {
    for ((entryKey, value) in entries.vals()) {
      if (entryKey == key) return ?value;
    };
    null;
  };

  func extractBlob(entries : AttributeMap, key : Text) : ?Blob {
    switch (get(entries, key)) {
      case (?#Blob value) ?value;
      case _ null;
    };
  };

  func extractText(entries : AttributeMap, key : Text) : ?Text {
    switch (get(entries, key)) {
      case (?#Text value) ?value;
      case _ null;
    };
  };

  func extractNat(entries : AttributeMap, key : Text) : ?Nat {
    switch (get(entries, key)) {
      case (?#Nat value) ?value;
      case _ null;
    };
  };

  func extractScopedText(entries : AttributeMap, attrName : Text) : ?Text {
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

  func extractScopedBool(entries : AttributeMap, attrName : Text) : ?Bool {
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

  func inferProvider(entries : AttributeMap) : ?Text {
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
