import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Timer "mo:core/Timer";
import Queue "mo:core/Queue";

import Liminal "mo:liminal";
import ZenDB "mo:zendb";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";
import Sha256 "mo:sha2/Sha256";
import Profiles "Profiles";
import Canisters "Canisters";
import HttpDownloader "HttpDownloader";
import GitHubReleases "GitHubReleases";

shared ({ caller = installer }) persistent actor class Rabbithole() = self {
  let zendb = ZenDB.newStableStore(null);
  transient let db = ZenDB.launchDefaultDB(zendb);
  transient let profiles = Profiles.Profiles(db);
  let canisterId = Principal.fromActor(self);
  var assetStableData = HttpAssets.init_stable_store(canisterId, installer);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  transient var assetStore = HttpAssets.Assets(assetStableData, null);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // Create the HTTP App with middleware
  transient let app = Liminal.App({
    middleware = [
      CORSMiddleware.default(),
      AssetsMiddleware.new({
        store = assetStore;
      }),
      // RouterMiddleware.new(routerConfig),
    ];
    errorSerializer = Liminal.defaultJsonErrorSerializer;
    candidRepresentationNegotiator = Liminal.defaultCandidRepresentationNegotiator;
    logger = Liminal.buildDebugLogger(#info);
    urlNormalization = {
      pathIsCaseSensitive = false;
      preserveTrailingSlash = false;
      queryKeysAreCaseSensitive = false;
      removeEmptyPathSegments = true;
      resolvePathDotSegments = true;
      usernameIsCaseSensitive = false;
    };
  });

  // Expose standard HTTP interface
  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public query func http_request_streaming_callback(token : HttpAssets.StreamingToken) : async HttpAssets.StreamingCallbackResponse {
    switch (assetStore.http_request_streaming_callback(token)) {
      case (#err(e)) throw Error.reject(e);
      case (#ok(response)) response;
    };
  };

  assetStore.set_streaming_callback(http_request_streaming_callback);

  public shared ({ caller }) func saveAvatar({ filename; content; contentType } : Profiles.CreateProfileAvatarArgs) : async Text {
    assert not Principal.isAnonymous(caller);
    let args : HttpAssets.StoreArgs = {
      key = "/" # Text.join("/", Iter.fromArray(["static", Principal.toText(caller), filename]));
      content;
      sha256 = ?Sha256.fromBlob(#sha256, content);
      content_type = contentType;
      content_encoding = "identity";
      is_aliased = null;
    };
    assetCanister.store(installer, args);
    args.key;
  };

  public shared ({ caller }) func removeAvatar(filename : Text) : async () {
    assert not Principal.isAnonymous(caller);
    let key = "/" # Text.join("/", Iter.fromArray(["static", Principal.toText(caller), filename]));
    assetCanister.delete_asset(canisterId, { key });
  };

  public query ({ caller }) func whoami() : async Text {
    Principal.toText(caller);
  };

  public shared ({ caller }) func createProfile(args : Profiles.CreateProfileArgs) : async Nat {
    assert not Principal.isAnonymous(caller);

    switch (profiles.create(caller, args)) {
      case (#ok index) index;
      case (#err message) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getProfile() : async ?Profiles.Profile {
    assert not Principal.isAnonymous(caller);
    profiles.get(caller);
  };

  public query func listProfiles(options : Profiles.ListOptions) : async Profiles.GetProfilesResponse {
    profiles.list(options);
  };

  public query func usernameExists(username : Text) : async Bool {
    profiles.usernameExists(username);
  };

  public shared ({ caller }) func updateProfile(args : Profiles.UpdateProfileArgs) : async () {
    assert not Principal.isAnonymous(caller);
    let #err(message) = profiles.update(caller, args) else return;
    throw Error.reject(message);
  };

  public shared ({ caller }) func deleteProfile() : async () {
    assert not Principal.isAnonymous(caller);
    switch (profiles.delete(caller)) {
      case (#ok profile) {
        let ?key = profile.avatarUrl else return;
        assetCanister.delete_asset(canisterId, { key });
      };
      case (#err message) throw Error.reject(message);
    };
  };

  /* -------------------------------------------------------------------------- */
  /*                           Github Release Download                          */
  /* -------------------------------------------------------------------------- */

  let githubReleasesStore = GitHubReleases.new({
    owner = "rabbithole-app";
    repo = "v2";
    githubToken = null;
    assets = [(#LatestDraft, [#StorageWASM("encrypted-storage.wasm.gz"), #StorageFrontend("storage-frontend.tar.gz")])];
  });

  public shared ({ caller }) func listGithubReleases() : async [GitHubReleases.Release] {
    assert Principal.isController(caller);
    switch (await GitHubReleases.listReleases(githubReleasesStore)) {
      case (#ok(releases)) releases;
      case (#err(message)) throw Error.reject(message);
    };
  };

  /* -------------------------------------------------------------------------- */
  /*                               Lifecycle hooks                              */
  /* -------------------------------------------------------------------------- */

  transient var downloaderTimerId : ?Timer.TimerId = null;
  transient var githubTimerId : ?Timer.TimerId = null;

  func cancelDownloaderTimer() {
    switch (downloaderTimerId) {
      case (?id) {
        Timer.cancelTimer(id);
        downloaderTimerId := null;
      };
      case null {};
    };
  };

  func startDownloaderTimer<system>() {
    cancelDownloaderTimer();
    downloaderTimerId := ?Timer.recurringTimer<system>(
      #milliseconds 100,
      func() : async () {
        await HttpDownloader.runRequests(githubReleasesStore.downloaderStore);
        ensureDownloaderTimer<system>();
      },
    );
  };

  func ensureDownloaderTimer<system>() {
    if (Queue.isEmpty(githubReleasesStore.downloaderStore.requests)) {
      cancelDownloaderTimer();
    } else if (downloaderTimerId == null) {
      startDownloaderTimer<system>();
    };
  };

  func runGitHubTimer<system>() {
    if (githubTimerId == null) {
      githubTimerId := ?Timer.recurringTimer<system>(
        #days 1,
        githubListReleases,
      );
    };
  };

  func githubListReleases() : async () {
    switch (await GitHubReleases.listReleases(githubReleasesStore)) {
      case (#ok(_)) {
        ensureDownloaderTimer<system>();
      };
      case (#err(_)) {};
    };
  };

  func cancelGitHubTimer() {
    switch (githubTimerId) {
      case (?id) {
        Timer.cancelTimer(id);
        githubTimerId := null;
      };
      case null {};
    };
  };

  system func preupgrade() {
    cancelGitHubTimer();
    cancelDownloaderTimer();
  };

  func initGitHubReleases() : async () {
    await githubListReleases();
    runGitHubTimer<system>();
  };

  system func postupgrade() {
    ensureDownloaderTimer<system>();
  };

  ignore Timer.setTimer<system>(#seconds 0, initGitHubReleases);

  /* -------------------------------------------------------------------------- */
  /*                               User canisters                               */
  /* -------------------------------------------------------------------------- */

  let canisters = Canisters.new();

  public shared ({ caller }) func addCanister(canisterId : Principal) : async () {
    assert not Principal.isAnonymous(caller);
    Canisters.add(canisters, caller, canisterId);
  };

  public query ({ caller }) func listCanisters() : async [Principal] {
    assert not Principal.isAnonymous(caller);
    Canisters.list(canisters, caller);
  };

  public shared ({ caller }) func deleteCanister(canisterId : Principal) : async () {
    assert not Principal.isAnonymous(caller);
    Canisters.delete(canisters, caller, canisterId);
  };
};
