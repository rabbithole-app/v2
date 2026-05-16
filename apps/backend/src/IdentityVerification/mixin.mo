import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Prim "mo:⛔";

import IdentityVerification "lib";

mixin(
  deps : {
    onVerifiedAttributes : (Principal, IdentityVerification.VerifiedIdentityAttributes) -> async Result.Result<(), IdentityVerification.IdentityAttributesSyncError>;
    resolveTrustedIdentitySigner : <system>() -> Principal;
    resolveExpectedIdentityOrigin : <system>() -> Text;
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
    let trustedIdentitySigner = deps.resolveTrustedIdentitySigner<system>();
    if (signer != trustedIdentitySigner) {
      return #err(#untrustedSigner);
    };

    let data = Prim.callerInfoData<system>();
    let ?attrsMap = decodeIcrc3ValueMap(data) else {
      return #err(#malformedPayload);
    };

    let ?dataNonce = IdentityVerification.extractBlob(attrsMap, "implicit:nonce") else {
      return #err(#malformedPayload);
    };
    if (dataNonce != nonce) {
      return #err(#nonceMismatch);
    };

    let ?origin = IdentityVerification.extractText(attrsMap, "implicit:origin") else {
      return #err(#malformedPayload);
    };
    let expectedIdentityOrigin = deps.resolveExpectedIdentityOrigin<system>();
    if (origin != expectedIdentityOrigin) {
      return #err(#invalidOrigin);
    };

    let ?issuedAt = IdentityVerification.extractNat(attrsMap, "implicit:issued_at_timestamp_ns") else {
      return #err(#malformedPayload);
    };
    if (not IdentityVerification.isFresh(issuedAt, Int.abs(Time.now()))) {
      return #err(#expired);
    };

    let email = IdentityVerification.extractScopedText(attrsMap, "email");
    let verifiedEmail = switch (IdentityVerification.extractScopedBool(attrsMap, "verified_email")) {
      case (?value) ?value;
      case null switch (IdentityVerification.extractScopedBool(attrsMap, "email_verified")) {
        case (?value) ?value;
        case null switch (IdentityVerification.extractScopedText(attrsMap, "verified_email")) {
          // II exposes `verified_email` as the verified email value, not as a Bool.
          case (?verifiedEmailText) switch (email) {
            case (?emailText) ?(Text.toLower(verifiedEmailText) == Text.toLower(emailText));
            case null ?(Text.trim(verifiedEmailText, #char ' ') != "");
          };
          case null null;
        };
      };
    };

    let attrs : IdentityVerification.VerifiedIdentityAttributes = {
      email;
      name = IdentityVerification.extractScopedText(attrsMap, "name");
      verifiedEmail;
      provider = IdentityVerification.inferProvider(attrsMap);
    };

    switch (await deps.onVerifiedAttributes(caller, attrs)) {
      case (#ok _) {
        #ok;
      };
      case (#err error) {
        #err(error);
      };
    };
  };

  func decodeIcrc3ValueMap(data : Blob) : ?AttributeMap {
    let ?val = (from_candid (data) : ?Icrc3Value) else return null;
    switch val {
      case (#Map entries) ?entries;
      case _ null;
    };
  };

};
