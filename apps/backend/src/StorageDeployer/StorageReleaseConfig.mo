import Runtime "mo:core/Runtime";
import Text "mo:core/Text";

import GitHubReleases "GitHubReleases";

module {
  let INSTALL_RELEASE_TAG_ENV = "STORAGE_INSTALL_RELEASE_TAG";
  let UPDATE_RELEASE_SELECTOR_ENV = "STORAGE_UPDATE_RELEASE_SELECTOR";

  let STORAGE_RELEASE_ASSETS : [GitHubReleases.GithubAsset] = [
    #StorageWASM("encrypted-storage.wasm.gz"),
    #StorageFrontend("storage-frontend.tar"),
    #StorageReleaseManifest("storage-release.json"),
  ];

  public type Config = {
    installSelector : GitHubReleases.ReleaseSelector;
    assets : [(GitHubReleases.ReleaseSelector, [GitHubReleases.GithubAsset])];
  };

  public func fromEnv<system>() : Config {
    let installSelector = parseInstallSelector(Runtime.envVar<system>(INSTALL_RELEASE_TAG_ENV));
    let updateSelector = parseUpdateSelector(Runtime.envVar<system>(UPDATE_RELEASE_SELECTOR_ENV));
    {
      installSelector;
      assets = assetConfig(installSelector, updateSelector);
    };
  };

  func parseInstallSelector(tag : ?Text) : GitHubReleases.ReleaseSelector {
    switch (tag) {
      case (?value) #Version(value);
      case null #Latest;
    };
  };

  func parseUpdateSelector(value : ?Text) : GitHubReleases.ReleaseSelector {
    switch (value) {
      case null #Latest;
      case (?"latest") #Latest;
      case (?"latest-prerelease") #LatestPrerelease;
      case (?tag) {
        if (Text.startsWith(tag, #text "storage-")) {
          #Version(tag)
        } else {
          Runtime.trap("Unsupported " # UPDATE_RELEASE_SELECTOR_ENV # ": " # tag)
        };
      };
    };
  };

  func assetConfig(
    installSelector : GitHubReleases.ReleaseSelector,
    updateSelector : GitHubReleases.ReleaseSelector,
  ) : [(GitHubReleases.ReleaseSelector, [GitHubReleases.GithubAsset])] {
    if (selectorsEqual(updateSelector, installSelector)) {
      [(updateSelector, STORAGE_RELEASE_ASSETS)]
    } else {
      [
        (updateSelector, STORAGE_RELEASE_ASSETS),
        (installSelector, STORAGE_RELEASE_ASSETS),
      ]
    };
  };

  func selectorsEqual(a : GitHubReleases.ReleaseSelector, b : GitHubReleases.ReleaseSelector) : Bool {
    switch (a, b) {
      case (#Latest, #Latest) true;
      case (#LatestDraft, #LatestDraft) true;
      case (#LatestPrerelease, #LatestPrerelease) true;
      case (#Version(left), #Version(right)) Text.equal(left, right);
      case _ false;
    };
  };
};
