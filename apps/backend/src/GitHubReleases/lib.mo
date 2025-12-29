import Result "mo:core/Result";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Error "mo:core/Error";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Time "mo:core/Time";
import Set "mo:core/Set";
import Order "mo:core/Order";
import Iter "mo:core/Iter";
import Option "mo:core/Option";
import List "mo:core/List";
import Int "mo:core/Int";

import IC "mo:ic";
import Json "mo:json";
import Vector "mo:vector";
import DateTime "mo:datetime/DateTime";
import Hex "mo:hex";

import Types "Types";
import HttpDownloader "../HttpDownloader";

module {
  let GITHUB_API_BASE = "https://api.github.com";
  let HTTP_OUTCALL_CYCLES : Nat = 50_000_000_000; // 50B cycles per HTTP request
  let MAX_RESPONSE_BYTES : Nat64 = 1_500_000; // 1.5MB response limit (buffer for headers)
  let ISO_8601_FORMAT = "YYYY-MM-DDTHH:mm:ssZ";

  func compareHeaders(a : IC.HttpHeader, b : IC.HttpHeader) : Order.Order = Text.compare(a.name, b.name);
  func compareReleases(a : Types.Release, b : Types.Release) : Order.Order = Text.compare(a.tagName, b.tagName);
  func comparePublishedAt(a : Types.Release, b : Types.Release) : Order.Order = Int.compare(Option.get(a.publishedAt, a.createdAt), Option.get(b.publishedAt, b.createdAt));

  public type GithubAssetKind = { #StorageWASM; #StorageFrontend };
  public type GithubAsset = {
    #StorageWASM : Text;
    #StorageFrontend : Text;
  };

  public type ReleaseSelector = {
    #Latest; // Latest published release (not draft, not prerelease)
    #LatestDraft; // Latest draft release
    #LatestPrerelease; // Latest prerelease release
    #Version : Text; // Specific tag (e.g., "v0.1.0" or "main")
  };

  func findRelease(releases : Set.Set<Types.Release>, draft : Bool, prerelease : Bool) : ?Types.Release {
    Set.values(releases) |> Iter.filterMap(
      _,
      func release = if (release.draft == draft and release.prerelease == prerelease) ?release else null,
    ) |> Iter.sort(_, comparePublishedAt) |> Iter.reverse(_) |> _.next();
  };

  // Find release by specific tag
  func findReleaseByTag(releases : Set.Set<Types.Release>, tagName : Text) : ?Types.Release {
    Set.values(releases) |> Iter.find(_, func release = release.tagName == tagName);
  };

  // Find release by selector
  func findReleaseBySelector(releases : Set.Set<Types.Release>, selector : ReleaseSelector) : ?Types.Release {
    switch (selector) {
      case (#Latest) findRelease(releases, false, false);
      case (#LatestDraft) findRelease(releases, true, false);
      case (#LatestPrerelease) findRelease(releases, false, true);
      case (#Version(tag)) findReleaseByTag(releases, tag);
    };
  };

  public type Store = {
    owner : Text;
    repo : Text;
    releases : Set.Set<Types.Release>;
    assets : [(ReleaseSelector, [GithubAsset])]; // (release selector, (storage wasm asset, storage frontend asset))
    downloaderStore : HttpDownloader.Store;
    var githubToken : ?Text;
  };
  public type Release = Types.Release;

  public func new({ owner; repo; githubToken; assets } : { owner : Text; repo : Text; githubToken : ?Text; assets : [(ReleaseSelector, [GithubAsset])] }) : Store {
    {
      owner;
      repo;
      releases = Set.empty();
      downloaderStore = HttpDownloader.new({
        httpHeaders = getHeaders(githubToken) |> Set.values(_) |> Iter.toArray(_);
        region = null;
      });
      assets;
      var githubToken = githubToken;
    };
  };

  public func listReleases(store : Store) : async Result.Result<[Types.Release], Text> {
    let url = GITHUB_API_BASE # "/repos/" # store.owner # "/" # store.repo # "/releases";
    let headers = getHeaders(store.githubToken) |> Set.values(_) |> Iter.toArray(_);

    // Make HTTP request
    let request : IC.HttpRequestArgs = {
      url;
      max_response_bytes = ?MAX_RESPONSE_BYTES;
      headers;
      body = null;
      method = #get;
      transform = null;
      is_replicated = null;
    };

    try {
      let response = await (with cycles = HTTP_OUTCALL_CYCLES) IC.ic.http_request(request);

      // Check status code
      if (response.status < 200 or response.status >= 300) {
        return #err("GitHub API returned status " # Nat.toText(response.status));
      };

      let releases = switch (parseReleasesBody(response.body)) {
        case (#ok(releases)) releases;
        case (#err(message)) return #err(message);
      };
      let allReleases = releases.vals() |> Set.fromIter(_, compareReleases);
      Set.addAll(store.releases, compareReleases, Set.values(allReleases));
      for ((selector, assets) in store.assets.vals()) {
        switch (findReleaseBySelector(store.releases, selector)) {
          case (?release) {
            for (asset in assets.vals()) {
              let assetName = switch (asset) {
                case (#StorageWASM name or #StorageFrontend name) name;
              };
              let key = release.tagName # "/" # assetName;
              if (not HttpDownloader.has(store.downloaderStore, key)) {
                ignore downloadAsset(store, release.tagName, assetName);
              };
            };
          };
          case null {};
        };
      };
      #ok(releases);
    } catch (error) {
      #err("HTTP request failed: " # Error.message(error));
    };
  };

  public func latestStorageWasm(store : Store) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    latestReleaseAsset(store, #StorageWASM);
  };

  public func latestStorageFrontend(store : Store) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    latestReleaseAsset(store, #StorageFrontend);
  };

  func latestReleaseAsset(store : Store, ghAssetKind : GithubAssetKind) : Result.Result<HttpDownloader.DownloadDetails, Text> {
    let ?(selector, assets) = label exit : ?(ReleaseSelector, [GithubAsset]) {
      // First, try to find #Latest
      switch (Iter.fromArray(store.assets) |> Iter.find(_, func(sel, _) = switch (sel) { case (#Latest) true; case _ false })) {
        case (?v) ?v;
        case null {
          // If #Latest not found, take the first available
          Iter.fromArray(store.assets) |> _.next();
        };
      };
    } else return #err("Release not found");
    let ?release = findReleaseBySelector(store.releases, selector) else return #err("Release not found for selector");
    let key = Iter.fromArray(assets) |> Iter.filterMap(
      _,
      func(ghAsset) = switch (ghAsset, ghAssetKind) {
        case (#StorageWASM name, #StorageWASM) ?name;
        case (#StorageFrontend name, #StorageFrontend) ?name;
        case _ null;
      },
    ) |> List.fromIter(_) |> List.first(_) |> Option.map(_, func name = Text.join("/", [release.tagName, name].vals()));
    switch (key) {
      case (?k) HttpDownloader.get(store.downloaderStore, k);
      case null #err("Release asset is not provided");
    };
  };

  func downloadAsset(store : Store, releaseTagName : Text, assetName : Text) : Result.Result<(), Text> {
    let optAsset = label exit : ?Types.Asset {
      label releasesLoop for (release in Set.values(store.releases)) {
        if (release.tagName != releaseTagName) continue releasesLoop;
        for (asset in release.assets.vals()) {
          if (asset.name == assetName) break exit(?asset);
        };
      };
      null;
    };
    let ?asset = optAsset else return #err("Asset not found");
    let { name; contentType; sha256; size; url } = asset;
    HttpDownloader.add(store.downloaderStore, { key = releaseTagName # "/" # assetName; name; contentType; sha256; size; url });
    #ok;
  };

  func getHeaders(token : ?Text) : Set.Set<IC.HttpHeader> {
    let headers = Set.empty<IC.HttpHeader>();
    Set.add(headers, compareHeaders, { name = "Accept"; value = "application/vnd.github+json" });
    Set.add(headers, compareHeaders, { name = "X-GitHub-Api-Version"; value = "2022-11-28" });
    switch (token) {
      case (?token) {
        Set.add(headers, compareHeaders, { name = "Authorization"; value = "Bearer " # token });
      };
      case null {};
    };
    headers;
  };

  func parseReleasesBody(body : Blob) : Result.Result<[Types.Release], Text> {
    let jsonText = switch (Text.decodeUtf8(body)) {
      case (?text) text;
      case null return #err("Failed to decode response body as UTF-8");
    };
    switch (Json.parse(jsonText)) {
      case (#ok(#array(parsed))) {
        let releases = Vector.new<Types.Release>();
        label releasesLoop for (releaseJson in parsed.vals()) {
          let ?release = parseRelease(releaseJson) |> Result.toOption(_) else return #err("Failed to parse release");
          Vector.add(releases, release);
        };
        #ok(Vector.toArray(releases));
      };
      case (#ok(_)) #err("Failed to parse releases: unexpected JSON structure");
      case (#err(err)) #err("Failed to parse releases: " # Json.errToText(err));
    };
  };

  func parseTimeField(json : Json.Json, field : Text) : Result.Result<Time.Time, Text> {
    switch (parseTextField(json, field)) {
      case (#ok(text)) switch (DateTime.fromText(text, ISO_8601_FORMAT)) {
        case (?dateTime) #ok(dateTime.toTime());
        case null #err("Failed to parse time field " # field # " as ISO 8601 timestamp");
      };
      case (#err(message)) #err(message);
    };
  };

  func parseTextField(json : Json.Json, field : Text) : Result.Result<Text, Text> {
    Json.getAsText(json, field) |> Result.mapErr(
      _,
      func e = switch (e) {
        case (#pathNotFound) "Failed to get text field " # field # ": path not found";
        case (#typeMismatch) "Failed to get text field " # field # ": type mismatch";
      },
    );
  };

  func parseBoolField(json : Json.Json, field : Text) : Result.Result<Bool, Text> {
    Json.getAsBool(json, field) |> Result.mapErr(
      _,
      func e = switch (e) {
        case (#pathNotFound) "Failed to get bool field " # field # ": path not found";
        case (#typeMismatch) "Failed to get bool field " # field # ": type mismatch";
      },
    );
  };

  func parseNatField(json : Json.Json, field : Text) : Result.Result<Nat, Text> {
    Json.getAsNat(json, field) |> Result.mapErr(
      _,
      func e = switch (e) {
        case (#pathNotFound) "Failed to get nat field " # field # ": path not found";
        case (#typeMismatch) "Failed to get nat field " # field # ": type mismatch";
      },
    );
  };

  func parseRelease(json : Json.Json) : Result.Result<Types.Release, Text> {
    let id = switch (parseNatField(json, "id")) {
      case (#ok(id)) id;
      case (#err(message)) return #err(message);
    };
    let name = switch (parseTextField(json, "name")) {
      case (#ok(name)) name;
      case (#err(message)) return #err(message);
    };
    let tagName = switch (parseTextField(json, "tag_name")) {
      case (#ok(tagName)) tagName;
      case (#err(message)) return #err(message);
    };
    let body = switch (parseTextField(json, "body")) {
      case (#ok(body)) body;
      case (#err(message)) return #err(message);
    };
    let url = switch (parseTextField(json, "url")) {
      case (#ok(url)) url;
      case (#err(message)) return #err(message);
    };
    let htmlUrl = switch (parseTextField(json, "html_url")) {
      case (#ok(htmlUrl)) htmlUrl;
      case (#err(message)) return #err(message);
    };
    let draft = switch (parseBoolField(json, "draft")) {
      case (#ok(draft)) draft;
      case (#err(message)) return #err(message);
    };
    let prerelease = switch (parseBoolField(json, "prerelease")) {
      case (#ok(prerelease)) prerelease;
      case (#err(message)) return #err(message);
    };
    let immutable = switch (parseBoolField(json, "immutable")) {
      case (#ok(immutable)) immutable;
      case (#err(message)) return #err(message);
    };
    let createdAt : Time.Time = switch (parseTimeField(json, "created_at")) {
      case (#ok(createdAt)) createdAt;
      case (#err(message)) return #err(message);
    };
    let publishedAt : ?Time.Time = parseTimeField(json, "published_at") |> Result.toOption(_);
    let assets = switch (Json.getAsArray(json, "assets")) {
      case (#ok(v)) {
        let assets = Vector.new<Types.Asset>();
        label assetsLoop for (assetJson in v.vals()) {
          let ?asset = parseAsset(assetJson) |> Result.toOption(_) else return #err("Failed to parse asset");
          Vector.add(assets, asset);
        };
        Vector.toArray(assets);
      };
      case (#err(#pathNotFound)) return #err("Failed to get assets array: path not found");
      case (#err(#typeMismatch)) return #err("Failed to get assets array: type mismatch");
    };
    #ok({
      id;
      name;
      tagName;
      url;
      body;
      htmlUrl;
      draft;
      prerelease;
      immutable;
      createdAt;
      publishedAt;
      assets;
    });
  };

  func parseAsset(json : Json.Json) : Result.Result<Types.Asset, Text> {
    let id = switch (parseNatField(json, "id")) {
      case (#ok(id)) id;
      case (#err(message)) return #err(message);
    };
    let name = switch (parseTextField(json, "name")) {
      case (#ok(name)) name;
      case (#err(message)) return #err(message);
    };
    let url = switch (parseTextField(json, "url")) {
      case (#ok(url)) url;
      case (#err(message)) return #err(message);
    };
    let _label = switch (parseTextField(json, "label")) {
      case (#ok(v)) v;
      case (#err(message)) return #err(message);
    };
    let contentType = switch (parseTextField(json, "content_type")) {
      case (#ok(contentType)) contentType;
      case (#err(message)) return #err(message);
    };
    let size = switch (parseNatField(json, "size")) {
      case (#ok(size)) size;
      case (#err(message)) return #err(message);
    };
    let sha256 = label exit : ?Blob {
      let ?hash = parseTextField(json, "digest") |> Result.mapOk(
        _,
        func(digest) = Text.trimStart(digest, #text "sha256:"),
      ) |> Result.toOption(_) else break exit null;
      Hex.toArray(hash) |> Result.toOption(_) |> Option.map(_, func bytes = Blob.fromArray(bytes));
    };
    let createdAt : Time.Time = switch (parseTimeField(json, "created_at")) {
      case (#ok(createdAt)) createdAt;
      case (#err(message)) return #err(message);
    };
    let updatedAt : Time.Time = switch (parseTimeField(json, "updated_at")) {
      case (#ok(updatedAt)) updatedAt;
      case (#err(message)) return #err(message);
    };
    #ok({
      id;
      name;
      url;
      _label;
      contentType;
      size;
      sha256;
      createdAt;
      updatedAt;
    });
  };
};
