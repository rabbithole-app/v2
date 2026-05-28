import Blob "mo:core/Blob";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";

import CertifiedAssets "mo:certified-assets/Stable";

import T "Types";
import Utils "Utils";

module {
  public type ContentHashArguments = {
    keyId : T.KeyId;
    hash : Blob;
  };

  public type BlobInfoEndpointArguments = {
    keyId : T.KeyId;
    bodyHash : Blob;
  };

  public type FileVersionArguments = {
    keyId : T.KeyId;
    version : T.FileVersion;
  };

  public func contentEndpoint(args : ContentHashArguments) : CertifiedAssets.Endpoint {
    let { keyId; hash } = args;
    let ?tid = Text.decodeUtf8(keyId.1) else Runtime.unreachable();
    let key = "/" # Text.join(Iter.fromArray(["encrypted", Principal.toText(keyId.0), tid]), "/");
    CertifiedAssets.Endpoint(key, null)
    // request certification is not supported in this context
    .no_request_certification()
    // the content's hash is inserted directly instead of computing it from the content
    .hash(hash).status(200);
  };

  public func blobInfoEndpoint(args : BlobInfoEndpointArguments) : CertifiedAssets.Endpoint {
    let { keyId; bodyHash } = args;
    let ?tid = Text.decodeUtf8(keyId.1) else Runtime.unreachable();
    let key = "/" # Text.join(Iter.fromArray(["blob-info", Principal.toText(keyId.0), tid]), "/");
    CertifiedAssets.Endpoint(key, null)
    .no_request_certification()
    .response_header("content-type", "application/json")
    .hash(bodyHash)
    .status(200);
  };

  public func certifyContentHash(self : T.StableStore, args : ContentHashArguments) {
    CertifiedAssets.certify(self.certs, contentEndpoint(args));
  };

  public func removeContentHash(self : T.StableStore, args : ContentHashArguments) {
    CertifiedAssets.remove(self.certs, contentEndpoint(args));
  };

  public func decertifyBlobInfo(self : T.StableStore, args : FileVersionArguments) {
    let { keyId; version } = args;
    switch (version.chunks[0]) {
      case (#BlobStorage { blobId; size }) {
        let ?hash = Text.decodeUtf8(blobId) else return;
        let (_, jsonHash) = Utils.blobInfoJson(hash, version.contentType, size);
        CertifiedAssets.remove(self.certs, blobInfoEndpoint({ keyId; bodyHash = jsonHash }));
      };
      case _ {};
    };
  };

  public func certifyBlobInfo(self : T.StableStore, args : FileVersionArguments) {
    let { keyId; version } = args;
    switch (version.chunks[0]) {
      case (#BlobStorage { blobId; size }) {
        let ?hash = Text.decodeUtf8(blobId) else return;
        let (_, jsonHash) = Utils.blobInfoJson(hash, version.contentType, size);
        CertifiedAssets.certify(self.certs, blobInfoEndpoint({ keyId; bodyHash = jsonHash }));
      };
      case _ {};
    };
  };
};
