import Nat "mo:core/Nat";
import Text "mo:core/Text";

import Types "GitHubReleasesTypes";
import ReleaseTags "ReleaseTags";
import SemVer "SemVer";

module {
  let SUPPORTED_SCHEMA_VERSION : Nat = 1;
  let SUPPORTED_ARG_STRATEGY = "reuseInstallArgV1";

  func configuredAssetName(assets : [Types.GithubAsset], kind : Types.GithubAssetKind) : ?Text {
    for (asset in assets.vals()) {
      switch (kind, asset) {
        case (#StorageWASM, #StorageWASM(name)) return ?name;
        case (#StorageFrontend, #StorageFrontend(name)) return ?name;
        case (#StorageReleaseManifest, #StorageReleaseManifest(_)) {};
        case _ {};
      };
    };
    null;
  };

  func validateRequiredArtifact(name : Text, expectedName : Text, artifact : ?Types.ReleaseArtifactManifest) : ?Text {
    let ?metadata = artifact else return ?("storage-release.json missing artifacts." # name);
    if (not Text.equal(metadata.name, expectedName)) {
      return ?("storage-release.json artifacts." # name # ".name must be " # expectedName # ", got " # metadata.name);
    };
    null;
  };

  func releaseHasAsset(release : Types.Release, expectedName : Text) : Bool {
    for (asset in release.assets.vals()) {
      if (Text.equal(asset.name, expectedName)) return true;
    };
    false;
  };

  func validateStableSignature(release : Types.Release, manifest : Types.StorageReleaseManifest) : ?Text {
    let ?metadata = manifest.stableSignature else {
      return ?"storage-release.json missing artifacts.stableSignature";
    };

    if (not Text.equal(metadata.name, "encrypted-storage.most")) {
      return ?("storage-release.json artifacts.stableSignature.name must be encrypted-storage.most, got " # metadata.name);
    };

    if (not releaseHasAsset(release, metadata.name)) {
      return ?("Storage release is missing stable signature asset " # metadata.name);
    };

    null;
  };

  public func validate(release : Types.Release, manifest : Types.StorageReleaseManifest, assets : [Types.GithubAsset]) : ?Text {
    if (manifest.schemaVersion != SUPPORTED_SCHEMA_VERSION) {
      return ?("Unsupported storage-release.json schemaVersion " # Nat.toText(manifest.schemaVersion));
    };

    if (not Text.equal(manifest.tagName, release.tagName)) {
      return ?("storage-release.json tagName " # manifest.tagName # " does not match GitHub release tag " # release.tagName);
    };

    let parsedVersion = switch (SemVer.parse(manifest.version)) {
      case (?version) version;
      case null return ?("storage-release.json version must be valid SemVer, got " # manifest.version);
    };

    if (not Text.equal(ReleaseTags.version(manifest.tagName), manifest.version)) {
      return ?("storage-release.json version " # manifest.version # " does not match tagName " # manifest.tagName);
    };

    let isPrereleaseVersion = not SemVer.isStable(parsedVersion);
    if (isPrereleaseVersion and not release.prerelease and not release.draft) {
      return ?"GitHub release must be prerelease or draft when storage-release.json version has a prerelease suffix";
    };

    if (not isPrereleaseVersion and release.prerelease) {
      return ?"GitHub prerelease must use a SemVer prerelease suffix";
    };

    let ?wasmName = configuredAssetName(assets, #StorageWASM) else {
      return ?"Storage release does not configure a WASM asset";
    };
    switch (validateRequiredArtifact("wasm", wasmName, manifest.wasm)) {
      case (?message) return ?message;
      case null {};
    };

    let ?frontendName = configuredAssetName(assets, #StorageFrontend) else {
      return ?"Storage release does not configure a frontend asset";
    };
    switch (validateRequiredArtifact("frontend", frontendName, manifest.frontend)) {
      case (?message) return ?message;
      case null {};
    };

    switch (manifest.frontendAssetTreeHash) {
      case null return ?"storage-release.json missing frontendAssetTreeHash";
      case (?_) {};
    };

    if (not Text.equal(manifest.upgrade.argStrategy, SUPPORTED_ARG_STRATEGY)) {
      return ?("Unsupported storage WASM argStrategy " # manifest.upgrade.argStrategy);
    };

    switch (validateStableSignature(release, manifest)) {
      case (?message) return ?message;
      case null {};
    };

    null;
  };
};
