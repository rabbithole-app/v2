import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

import Liminal "mo:liminal";
import ZenDB "mo:zendb";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";
import { basename } "mo:encrypted-storage/Path";
import Profiles "Profiles";

shared ({ caller = installer }) persistent actor class Rabbithole() = self {
  let zendb = ZenDB.newStableStore(null);
  transient let db = ZenDB.launchDefaultDB(zendb);
  transient let profiles = Profiles.Profiles(db);
  let canisterId = Principal.fromActor(self);
  var assetStableData = HttpAssets.init_stable_store(canisterId, installer);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  let setPermissions : HttpAssets.SetPermissions = {
    commit = [installer];
    manage_permissions = [installer];
    prepare = [installer];
  };

  transient var assetStore = HttpAssets.Assets(assetStableData, ?setPermissions);
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
  });

  // Expose standard HTTP interface
  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public shared ({ caller }) func saveAvatar(args : HttpAssets.StoreArgs) : async () {
    let avatarKey = "/" # Text.join("/", Iter.fromArray(["static", Principal.toText(caller), basename(args.key)]));
    assetCanister.store(canisterId, { args with key = avatarKey });
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
    let #err(message) = profiles.delete(caller) else return;
    throw Error.reject(message);
  };
};
