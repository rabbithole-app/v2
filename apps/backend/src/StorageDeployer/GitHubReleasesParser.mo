import Result "mo:core/Result";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Time "mo:core/Time";

import DateTime "mo:datetime/DateTime";
import Hex "mo:hex";
import Json "mo:json";
import Vector "mo:vector";

import Types "GitHubReleasesTypes";

module {
  let ISO_8601_FORMAT = "YYYY-MM-DDTHH:mm:ssZ";

  public func parseReleasesBody(body : Blob) : Result.Result<[Types.Release], Text> {
    let ?jsonText = Text.decodeUtf8(body) else return #err("Failed to decode body as UTF-8");
    let json = switch (Json.parse(jsonText)) {
      case (#ok(json)) json;
      case (#err(err)) return #err("Failed to parse JSON: " # Json.errToText(err));
    };
    let #array(releases) = json else return #err("Expected JSON array");
    let parsedReleases = Vector.new<Types.Release>();
    for (release in releases.vals()) {
      switch (parseRelease(release)) {
        case (#ok(release)) Vector.add(parsedReleases, release);
        case (#err(message)) return #err(message);
      };
    };
    #ok(Vector.toArray(parsedReleases));
  };

  public func parseStorageReleaseManifestBody(body : Blob) : Result.Result<Types.StorageReleaseManifest, Text> {
    let ?jsonText = Text.decodeUtf8(body) else return #err("Failed to decode storage-release.json as UTF-8");
    let json = switch (Json.parse(jsonText)) {
      case (#ok(json)) json;
      case (#err(err)) return #err("Failed to parse storage-release.json: " # Json.errToText(err));
    };
    parseStorageReleaseManifest(json);
  };

  func parseTimeField(json : Json.Json, field : Text) : Result.Result<Time.Time, Text> {
    switch (Json.getAsText(json, field)) {
      case (#ok(str)) {
        let ?dateTime = DateTime.fromText(str, ISO_8601_FORMAT) else return #err("Failed to parse date: " # str);
        #ok(dateTime.toTime());
      };
      case (#err(_)) #err("Missing field: " # field);
    };
  };

  func parseTextField(json : Json.Json, field : Text) : Result.Result<Text, Text> {
    switch (Json.getAsText(json, field)) {
      case (#ok(str)) #ok(str);
      case (#err(_)) #err("Missing field: " # field);
    };
  };

  func parseOptionalTextField(json : Json.Json, path : Text) : Result.Result<?Text, Text> {
    switch (Json.get(json, path)) {
      case null #ok(null);
      case (?#null_) #ok(null);
      case (?_) {
        switch (Json.getAsText(json, path)) {
          case (#ok(value)) #ok(?value);
          case (#err(_)) #err("Expected text field: " # path);
        };
      };
    };
  };

  func parseOptionalSha256Field(json : Json.Json, path : Text) : Result.Result<?Blob, Text> {
    switch (parseOptionalTextField(json, path)) {
      case (#err(message)) #err(message);
      case (#ok(null)) #ok(null);
      case (#ok(?value)) {
        let normalized = Text.trimStart(value, #text "sha256:");
        switch (Hex.toArray(normalized)) {
          case (#ok(bytes)) #ok(?Blob.fromArray(bytes));
          case (#err(_)) #err("Expected sha256 hex field: " # path);
        };
      };
    };
  };

  func parseBoolField(json : Json.Json, field : Text) : Result.Result<Bool, Text> {
    switch (Json.getAsBool(json, field)) {
      case (#ok(b)) #ok(b);
      case (#err(_)) #err("Missing field: " # field);
    };
  };

  func parseNatField(json : Json.Json, field : Text) : Result.Result<Nat, Text> {
    switch (Json.getAsNat(json, field)) {
      case (#ok(n)) #ok(n);
      case (#err(_)) #err("Missing field: " # field);
    };
  };

  func parseOptionalNatField(json : Json.Json, path : Text) : Result.Result<?Nat, Text> {
    switch (Json.get(json, path)) {
      case null #ok(null);
      case (?#null_) #ok(null);
      case (?_) {
        switch (Json.getAsNat(json, path)) {
          case (#ok(value)) #ok(?value);
          case (#err(_)) #err("Expected nat field: " # path);
        };
      };
    };
  };

  func parseTextArrayField(json : Json.Json, path : Text) : Result.Result<[Text], Text> {
    let values = switch (Json.getAsArray(json, path)) {
      case (#ok(values)) values;
      case (#err(_)) return #err("Expected text array field: " # path);
    };
    let parsed = Vector.new<Text>();
    for (value in values.vals()) {
      switch (value) {
        case (#string(text)) Vector.add(parsed, text);
        case _ return #err("Expected text array item in field: " # path);
      };
    };
    #ok(Vector.toArray(parsed));
  };

  func parseRelease(json : Json.Json) : Result.Result<Types.Release, Text> {
    let url = switch (parseTextField(json, "url")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let htmlUrl = switch (parseTextField(json, "html_url")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let id = switch (parseNatField(json, "id")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let tagName = switch (parseTextField(json, "tag_name")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let name = switch (parseTextField(json, "name")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };

    let body = switch (parseTextField(json, "body")) {
      case (#ok(b)) b;
      case (#err(_)) "";
    };

    let draft = switch (parseBoolField(json, "draft")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let prerelease = switch (parseBoolField(json, "prerelease")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let createdAt = switch (parseTimeField(json, "created_at")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };

    let publishedAt = switch (parseTimeField(json, "published_at")) {
      case (#ok(t)) ?t;
      case (#err(_)) null;
    };

    let assetsJson = switch (Json.getAsArray(json, "assets")) {
      case (#ok(arr)) arr;
      case (#err(_)) return #err("Missing assets");
    };

    let assets = Vector.new<Types.Asset>();
    for (assetJson in assetsJson.vals()) {
      switch (parseAsset(assetJson)) {
        case (#ok(asset)) Vector.add(assets, asset);
        case (#err(message)) return #err(message);
      };
    };

    let immutable = Text.startsWith(tagName, #text "v") or Text.contains(tagName, #text ".");

    #ok({
      url;
      htmlUrl;
      id;
      tagName;
      name;
      body;
      draft;
      prerelease;
      immutable;
      createdAt;
      publishedAt;
      assets = Vector.toArray(assets);
    });
  };

  func parseAsset(json : Json.Json) : Result.Result<Types.Asset, Text> {
    let url = switch (parseTextField(json, "url")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let id = switch (parseNatField(json, "id")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let name = switch (parseTextField(json, "name")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };

    let _label = switch (parseTextField(json, "label")) {
      case (#ok(l)) l;
      case (#err(_)) "";
    };

    let contentType = switch (parseTextField(json, "content_type")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let size = switch (parseNatField(json, "size")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let createdAt = switch (parseTimeField(json, "created_at")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };
    let updatedAt = switch (parseTimeField(json, "updated_at")) {
      case (#ok(v)) v;
      case (#err(e)) return #err(e);
    };

    let sha256 : ?Blob = switch (parseTextField(json, "digest")) {
      case (#ok(digest)) {
        let hash = Text.trimStart(digest, #text "sha256:");
        switch (Hex.toArray(hash)) {
          case (#ok(bytes)) ?Blob.fromArray(bytes);
          case (#err(_)) null;
        };
      };
      case (#err(_)) null;
    };

    #ok({
      url;
      id;
      name;
      _label;
      contentType;
      size;
      sha256;
      createdAt;
      updatedAt;
    });
  };

  func parseReleaseArtifactManifest(json : Json.Json, path : Text) : Result.Result<?Types.ReleaseArtifactManifest, Text> {
    switch (Json.get(json, path)) {
      case null #ok(null);
      case (?#null_) #ok(null);
      case (?_) {
        let name = switch (parseTextField(json, path # ".name")) {
          case (#ok(value)) value;
          case (#err(message)) return #err(message);
        };
        let size = switch (parseOptionalNatField(json, path # ".size")) {
          case (#ok(value)) value;
          case (#err(message)) return #err(message);
        };
        let sha256 = switch (parseOptionalTextField(json, path # ".sha256")) {
          case (#ok(value)) value;
          case (#err(message)) return #err(message);
        };
        #ok(?{ name; size; sha256 });
      };
    };
  };

  func parseReleaseUpgradeManifest(json : Json.Json) : Result.Result<Types.ReleaseUpgradeManifest, Text> {
    let argStrategy = switch (parseTextField(json, "upgrade.argStrategy")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let compatibleFrom = switch (parseTextArrayField(json, "upgrade.compatibleFrom")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    #ok({ argStrategy; compatibleFrom });
  };

  func parseChangelogRange(json : Json.Json) : Result.Result<Types.ChangelogRange, Text> {
    let from = switch (parseOptionalTextField(json, "changelog.range.from")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let to = switch (parseTextField(json, "changelog.range.to")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let compareUrl = switch (parseOptionalTextField(json, "changelog.range.compareUrl")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let maxCommits = switch (parseOptionalNatField(json, "changelog.range.maxCommits")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    #ok({ from; to; compareUrl; maxCommits });
  };

  func parseChangelogItem(json : Json.Json) : Result.Result<Types.ChangelogItem, Text> {
    let text = switch (parseTextField(json, "text")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let commit = switch (parseOptionalTextField(json, "commit")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let commitUrl = switch (parseOptionalTextField(json, "commitUrl")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    #ok({ text; commit; commitUrl });
  };

  func parseChangelogSection(json : Json.Json) : Result.Result<Types.ChangelogSection, Text> {
    let kind = switch (parseTextField(json, "kind")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let title = switch (parseTextField(json, "title")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let itemsJson = switch (Json.getAsArray(json, "items")) {
      case (#ok(value)) value;
      case (#err(_)) return #err("Expected changelog section items");
    };
    let items = Vector.new<Types.ChangelogItem>();
    for (itemJson in itemsJson.vals()) {
      switch (parseChangelogItem(itemJson)) {
        case (#ok(item)) Vector.add(items, item);
        case (#err(message)) return #err(message);
      };
    };
    #ok({ kind; title; items = Vector.toArray(items) });
  };

  func parseReleaseChangelog(json : Json.Json) : Result.Result<Types.ReleaseChangelog, Text> {
    let range = switch (parseChangelogRange(json)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let bump = switch (parseTextField(json, "changelog.bump")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let summary = switch (parseTextField(json, "changelog.summary")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let sectionsJson = switch (Json.getAsArray(json, "changelog.sections")) {
      case (#ok(value)) value;
      case (#err(_)) return #err("Expected changelog.sections array");
    };
    let sections = Vector.new<Types.ChangelogSection>();
    for (sectionJson in sectionsJson.vals()) {
      switch (parseChangelogSection(sectionJson)) {
        case (#ok(section)) Vector.add(sections, section);
        case (#err(message)) return #err(message);
      };
    };
    #ok({ range; bump; summary; sections = Vector.toArray(sections) });
  };

  func parseReleaseNoteSection(json : Json.Json) : Result.Result<Types.ReleaseNoteSection, Text> {
    let title = switch (parseTextField(json, "title")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let items = switch (parseTextArrayField(json, "items")) {
      case (#ok(value)) value;
      case (#err(_)) return #err("Expected releaseNotes section items");
    };
    #ok({ title; items });
  };

  func parseReleaseNotes(json : Json.Json) : Result.Result<?Types.ReleaseNotes, Text> {
    switch (Json.get(json, "releaseNotes")) {
      case null #ok(null);
      case (?#null_) #ok(null);
      case (?notesJson) {
        let source = switch (parseTextField(notesJson, "source")) {
          case (#ok(value)) value;
          case (#err(message)) return #err("releaseNotes." # message);
        };
        let summary = switch (parseTextField(notesJson, "summary")) {
          case (#ok(value)) value;
          case (#err(message)) return #err("releaseNotes." # message);
        };
        let sectionsJson = switch (Json.getAsArray(notesJson, "sections")) {
          case (#ok(value)) value;
          case (#err(_)) return #err("Expected releaseNotes.sections array");
        };
        let sections = Vector.new<Types.ReleaseNoteSection>();
        for (sectionJson in sectionsJson.vals()) {
          switch (parseReleaseNoteSection(sectionJson)) {
            case (#ok(section)) Vector.add(sections, section);
            case (#err(message)) return #err(message);
          };
        };
        #ok(?{ source; summary; sections = Vector.toArray(sections) });
      };
    };
  };

  func parseStorageReleaseManifest(json : Json.Json) : Result.Result<Types.StorageReleaseManifest, Text> {
    let schemaVersion = switch (parseNatField(json, "schemaVersion")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let version = switch (parseTextField(json, "version")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let tagName = switch (parseTextField(json, "tagName")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let commit = switch (parseTextField(json, "commit")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let frontendAssetTreeHash = switch (parseOptionalSha256Field(json, "frontendAssetTreeHash")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let wasm = switch (parseReleaseArtifactManifest(json, "artifacts.wasm")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let frontend = switch (parseReleaseArtifactManifest(json, "artifacts.frontend")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let did = switch (parseReleaseArtifactManifest(json, "artifacts.did")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let stableSignature = switch (parseReleaseArtifactManifest(json, "artifacts.stableSignature")) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let upgrade = switch (parseReleaseUpgradeManifest(json)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let changelog = switch (parseReleaseChangelog(json)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };
    let releaseNotes = switch (parseReleaseNotes(json)) {
      case (#ok(value)) value;
      case (#err(message)) return #err(message);
    };

    #ok({
      schemaVersion;
      version;
      tagName;
      commit;
      frontendAssetTreeHash;
      wasm;
      frontend;
      did;
      stableSignature;
      upgrade;
      changelog;
      releaseNotes;
    });
  };
};
