import Blob "mo:core/Blob";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Vector "mo:vector";

import GitHubReleases "GitHubReleases";
import ReleaseTags "ReleaseTags";
import SemVer "SemVer";
import Types "Types";

module StorageReleasePlanner {
  public type StorageReleaseStateInput = {
    releaseTag : Text;
    wasmHash : ?Blob;
    frontendAssetTreeHash : ?Blob;
    manifestHash : ?Blob;
  };

  public type StorageReleaseState = {
    schemaVersion : Nat;
    releaseTag : ?Text;
    wasmHash : ?Blob;
    frontendAssetTreeHash : ?Blob;
    manifestHash : ?Blob;
    installedAt : ?Time.Time;
  };

  public func releaseWasmHash(store : GitHubReleases.Store, releaseTag : Text) : Result.Result<Blob, Text> {
    GitHubReleases.storageWasmHash(store, releaseTag);
  };

  public func releaseFrontendHash(store : GitHubReleases.Store, releaseTag : Text) : Result.Result<Blob, Text> {
    GitHubReleases.storageFrontendAssetTreeHash(store, releaseTag);
  };

  public func releaseManifestHash(store : GitHubReleases.Store, releaseTag : Text) : ?Blob {
    switch (GitHubReleases.storageReleaseManifest(store, releaseTag)) {
      case (#ok(details)) ?details.sha256;
      case (#err(_)) null;
    };
  };

  public func buildStateInput(store : GitHubReleases.Store, releaseTag : Text) : Result.Result<StorageReleaseStateInput, Text> {
    let wasmHash = switch (releaseWasmHash(store, releaseTag)) {
      case (#ok(hash)) ?hash;
      case (#err(message)) return #err("Release " # releaseTag # " WASM hash is not ready: " # message);
    };
    let frontendAssetTreeHash = switch (releaseFrontendHash(store, releaseTag)) {
      case (#ok(hash)) ?hash;
      case (#err(message)) return #err("Release " # releaseTag # " frontend asset tree hash is not ready: " # message);
    };

    #ok({
      releaseTag;
      wasmHash;
      frontendAssetTreeHash;
      manifestHash = releaseManifestHash(store, releaseTag);
    });
  };

  public func currentRecordReleaseTag(record : Types.StorageCreationRecord) : Text {
    switch (record.installedReleaseTag) {
      case (?tag) tag;
      case null record.releaseTag;
    };
  };

  public func releaseCompatibleWithRecord(record : Types.StorageCreationRecord, manifest : GitHubReleases.StorageReleaseManifest) : Bool {
    let currentVersion = currentRecordReleaseVersion(record);
    for (version in manifest.upgrade.compatibleFrom.vals()) {
      if (Text.equal(ReleaseTags.version(version), currentVersion)) {
        return true;
      };
    };
    false;
  };

  public func releaseNewerThanRecord(record : Types.StorageCreationRecord, releaseTag : Text) : Bool {
    SemVer.compareText(ReleaseTags.version(releaseTag), currentRecordReleaseVersion(record)) == #greater;
  };

  public func ensureReleaseCompatible(
    store : GitHubReleases.Store,
    record : Types.StorageCreationRecord,
    releaseTag : Text,
  ) : Result.Result<(), Types.UpgradeStorageError> {
    let manifest = switch (GitHubReleases.storageReleaseManifestParsed(store, releaseTag)) {
      case (#ok(value)) value;
      case (#err(_)) return #err(#ReleaseNotReady);
    };

    if (releaseCompatibleWithRecord(record, manifest)) {
      #ok;
    } else {
      #err(#ReleaseNotCompatible);
    };
  };

  public func getUpdateInfoForTag(
    store : GitHubReleases.Store,
    record : Types.StorageCreationRecord,
    availableReleaseTag : Text,
  ) : Result.Result<?Types.UpdateInfo, Types.UpgradeStorageError> {
    switch (record.status) {
      case (#Completed(_)) {};
      case _ return #ok(null);
    };

    switch (ensureReleaseCompatible(store, record, availableReleaseTag)) {
      case (#ok) {};
      case (#err(error)) return #err(error);
    };

    let availableWasmHash = switch (releaseWasmHash(store, availableReleaseTag)) {
      case (#ok(hash)) ?hash;
      case (#err(_)) return #err(#ReleaseNotReady);
    };

    let availableFrontendHash = switch (releaseFrontendHash(store, availableReleaseTag)) {
      case (#ok(hash)) ?hash;
      case (#err(_)) return #err(#ReleaseNotReady);
    };

    let wasmUpdateAvailable = switch (record.wasmHash, availableWasmHash) {
      case (?current, ?available) not Blob.equal(current, available);
      case (null, ?_) true;
      case _ false;
    };

    let frontendUpdateAvailable = switch (record.frontendHash, availableFrontendHash) {
      case (?current, ?available) not Blob.equal(current, available);
      case (null, ?_) true;
      case _ false;
    };

    if (not wasmUpdateAvailable and not frontendUpdateAvailable) return #ok(null);

    #ok(
      ?{
        currentWasmHash = record.wasmHash;
        availableWasmHash;
        currentReleaseTag = record.installedReleaseTag;
        availableReleaseTag = ?availableReleaseTag;
        wasmUpdateAvailable;
        frontendUpdateAvailable;
      }
    );
  };

  public func getUpdateInfo(
    store : GitHubReleases.Store,
    releases : [GitHubReleases.ReleaseFullStatus],
    record : Types.StorageCreationRecord,
  ) : ?Types.UpdateInfo {
    var selected : ?Types.UpdateInfo = null;
    var selectedTag : ?Text = null;
    var selectedAt : ?Time.Time = null;

    for (release in releases.vals()) {
      switch (getUpdateInfoForTag(store, record, release.tagName)) {
        case (#ok(?updateInfo)) {
          let releaseAt = Option.get(release.publishedAt, release.createdAt);
          switch (selectedTag, selectedAt) {
            case (?bestTag, ?bestAt) {
              let order = SemVer.compareText(ReleaseTags.version(release.tagName), ReleaseTags.version(bestTag));
              if (order == #greater or (order == #equal and releaseAt > bestAt)) {
                selected := ?updateInfo;
                selectedTag := ?release.tagName;
                selectedAt := ?releaseAt;
              };
            };
            case _ {
              selected := ?updateInfo;
              selectedTag := ?release.tagName;
              selectedAt := ?releaseAt;
            };
          };
        };
        case _ {};
      };
    };

    selected;
  };

  public func getReleaseOptionsForRecord(
    store : GitHubReleases.Store,
    releases : [GitHubReleases.ReleaseFullStatus],
    record : Types.StorageCreationRecord,
  ) : [Types.StorageReleaseOption] {
    let options = Vector.new<Types.StorageReleaseOption>();

    for (release in releases.vals()) {
      if (releaseNewerThanRecord(record, release.tagName)) {
        let updateInfo = switch (getUpdateInfoForTag(store, record, release.tagName)) {
          case (#ok(value)) value;
          case (#err(_)) null;
        };
        Vector.add(options, releaseOptionFromStatus(record, release, updateInfo));
      };
    };

    Vector.toArray(options);
  };

  public func recordMatchesReleaseState(record : Types.StorageCreationRecord, state : StorageReleaseState) : Bool {
    optionalTextMatches(currentRecordReleaseTag(record), state.releaseTag) and optionalBlobMatches(record.wasmHash, state.wasmHash) and optionalBlobMatches(record.frontendHash, state.frontendAssetTreeHash);
  };

  public func recordWithReleaseState(record : Types.StorageCreationRecord, state : StorageReleaseState) : Types.StorageCreationRecord {
    let releaseTag = switch (state.releaseTag) {
      case (?tag) tag;
      case null record.releaseTag;
    };
    let installedReleaseTag = switch (state.releaseTag) {
      case (?tag) ?tag;
      case null record.installedReleaseTag;
    };
    let wasmHash = switch (state.wasmHash) {
      case (?hash) ?hash;
      case null record.wasmHash;
    };
    let frontendHash = switch (state.frontendAssetTreeHash) {
      case (?hash) ?hash;
      case null record.frontendHash;
    };

    {
      record with
      releaseTag;
      installedReleaseTag;
      wasmHash;
      frontendHash;
    };
  };

  func currentRecordReleaseVersion(record : Types.StorageCreationRecord) : Text {
    ReleaseTags.version(currentRecordReleaseTag(record));
  };

  func joinTexts(values : [Text]) : Text {
    var result = "";
    var first = true;

    for (value in values.vals()) {
      if (first) {
        first := false;
        result #= value;
      } else {
        result #= ", " # value;
      };
    };

    result;
  };

  func optionalBlobMatches(current : ?Blob, reported : ?Blob) : Bool {
    switch (reported) {
      case (?reportedHash) switch (current) {
        case (?currentHash) Blob.equal(currentHash, reportedHash);
        case null false;
      };
      case null true;
    };
  };

  func optionalTextMatches(current : Text, reported : ?Text) : Bool {
    switch (reported) {
      case (?reportedText) Text.equal(current, reportedText);
      case null true;
    };
  };

  func releaseOptionFromStatus(
    record : Types.StorageCreationRecord,
    release : GitHubReleases.ReleaseFullStatus,
    updateInfo : ?Types.UpdateInfo,
  ) : Types.StorageReleaseOption {
    let compatibleFrom = switch (release.manifest) {
      case (?manifest) manifest.upgrade.compatibleFrom;
      case null [];
    };
    let releaseNotesSummary = switch (release.manifest) {
      case (?manifest) {
        switch (manifest.releaseNotes) {
          case (?notes) ?notes.summary;
          case null null;
        };
      };
      case null null;
    };
    let releaseNotesSections = switch (release.manifest) {
      case (?manifest) {
        switch (manifest.releaseNotes) {
          case (?notes) notes.sections;
          case null [];
        };
      };
      case null [];
    };
    let disabledReason = switch (release.manifestError) {
      case (?_) ?"Release manifest is invalid";
      case null {
        switch (release.manifest) {
          case null ?"Release metadata is not downloaded";
          case (?manifest) {
            if (not releaseCompatibleWithRecord(record, manifest)) {
              if (compatibleFrom.size() > 0) {
                ?("Compatible from " # joinTexts(compatibleFrom));
              } else {
                ?"No upgrade path declared";
              };
            } else {
              switch (updateInfo) {
                case (?_) null;
                case null ?"No changes for this storage";
              };
            };
          };
        };
      };
    };

    {
      tagName = release.tagName;
      releaseUrl = release.htmlUrl;
      version = ReleaseTags.version(release.tagName);
      releaseNotesSummary;
      releaseNotesSections;
      compatibleFrom;
      disabled = Option.isSome(disabledReason);
      disabledReason;
      updateInfo;
      wasmUpdateAvailable = switch (updateInfo) {
        case (?info) info.wasmUpdateAvailable;
        case null false;
      };
      frontendUpdateAvailable = switch (updateInfo) {
        case (?info) info.frontendUpdateAvailable;
        case null false;
      };
    };
  };
};
