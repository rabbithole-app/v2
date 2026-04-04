import Error "mo:core/Error";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

import HttpAssets "mo:http-assets";
import Sha256 "mo:sha2/Sha256";
import ZenDB "mo:zendb";

import Profiles "lib";

mixin(
  db : ZenDB.Database,
  installer : Principal,
  deleteAsset : (Text) -> (),
  storeAsset : (Principal, HttpAssets.StoreArgs) -> (),
) {
  transient let profiles = Profiles.Profiles(db, deleteAsset);

  func resolveReferralCode(code : Text) : ?Principal {
    profiles.resolveReferralCode(code);
  };

  public shared ({ caller }) func saveAvatar({ filename; content; contentType } : Profiles.CreateProfileAvatarArgs) : async Text {
    assert not Principal.isAnonymous(caller);
    let args : HttpAssets.StoreArgs = {
      key = "/" # Text.join(Iter.fromArray(["static", Principal.toText(caller), filename]), "/");
      content;
      sha256 = ?Sha256.fromBlob(#sha256, content);
      content_type = contentType;
      content_encoding = "identity";
      is_aliased = null;
    };
    storeAsset(installer, args);
    profiles.trackAvatar(caller, args.key);
    args.key;
  };

  public shared ({ caller }) func createProfile(args : Profiles.CreateProfileArgs) : async Blob {
    assert not Principal.isAnonymous(caller);
    switch (profiles.create(caller, args)) {
      case (#ok docId) docId;
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
