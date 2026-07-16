import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import HttpAssets "mo:http-assets";

import FrontendPullInstaller "FrontendPullInstaller";
import FrontendPullTypes "StorageDeployer/FrontendPullTypes";

/// Storage-canister side of the pull-based frontend install: endpoints,
/// pending-install state and the self-rescheduling pull loop. The stable
/// `pendingFrontendInstall` survives self-upgrades; the loop re-arms at init.
mixin(
  deps : {
    owner : Principal;
    isReleaseStateWriter : Principal -> Bool;
    backendId : () -> ?Principal;
    assetStore : () -> HttpAssets.Assets;
    isUserAsset : Text -> Bool;
    computeTreeHash : () -> Blob;
  }
) {
  var pendingFrontendInstall : ?FrontendPullInstaller.PendingInstall = null;
  transient let frontendPullRuntime = FrontendPullInstaller.newRuntime();

  transient let frontendPullContext : FrontendPullInstaller.Context = {
    owner = deps.owner;
    backend = func() : ?FrontendPullInstaller.Backend {
      switch (deps.backendId()) {
        case (?id) ?(actor (Principal.toText(id)) : FrontendPullInstaller.Backend);
        case null null;
      };
    };
    assetStore = deps.assetStore;
    isUserAsset = deps.isUserAsset;
    computeTreeHash = deps.computeTreeHash;
    getPending = func() : ?FrontendPullInstaller.PendingInstall = pendingFrontendInstall;
    clearPending = func(versionKey : Text) {
      switch (pendingFrontendInstall) {
        case (?pending) {
          if (pending.versionKey == versionKey) pendingFrontendInstall := null;
        };
        case null {};
      };
    };
  };

  /// Start pulling the frontend from the backend. Called by the backend
  /// after WASM install/upgrade. Idempotent for the same versionKey; a
  /// different versionKey from the authorized caller supersedes a stale
  /// pending install (the in-flight run for the old version aborts on its
  /// next backend call and never clears the superseding request).
  public shared ({ caller }) func installFrontend(args : FrontendPullTypes.InstallFrontendArgs) : async Result.Result<(), Text> {
    if (not deps.isReleaseStateWriter(caller)) {
      return #err("Unauthorized");
    };
    let sameVersion = switch (pendingFrontendInstall) {
      case (?pending) pending.versionKey == args.versionKey;
      case null false;
    };
    if (not sameVersion) {
      pendingFrontendInstall := ?{
        versionKey = args.versionKey;
        expectedTreeHash = args.expectedTreeHash;
        totalFiles = args.totalFiles;
        totalBytes = args.totalBytes;
        isUpgrade = args.isUpgrade;
        requestedAt = Time.now();
      };
      frontendPullRuntime.attempts := 0;
    };
    FrontendPullInstaller.start<system>(frontendPullRuntime, frontendPullContext);
    #ok;
  };

  public query func getFrontendInstallStatus() : async ?FrontendPullInstaller.Status {
    FrontendPullInstaller.status(frontendPullRuntime, frontendPullContext);
  };

  /// Resume an interrupted frontend pull after upgrade (idempotent — the
  /// diff skips files already committed). The composing actor calls this at
  /// init: mixin bodies have no system capability of their own.
  func resumeFrontendPull<system>() : () {
    FrontendPullInstaller.start<system>(frontendPullRuntime, frontendPullContext);
  };
};
