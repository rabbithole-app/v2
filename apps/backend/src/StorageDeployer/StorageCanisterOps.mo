import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import { ic } "mo:ic";

import FrontendPullTypes "FrontendPullTypes";
import StorageReleasePlanner "StorageReleasePlanner";

module StorageCanisterOps {
  type StorageReleaseStateCanister = actor {
    setStorageReleaseState : shared StorageReleasePlanner.StorageReleaseStateInput -> async ();
  };

  public type InstallFrontendArgs = FrontendPullTypes.InstallFrontendArgs;

  type FrontendPullCanister = actor {
    installFrontend : shared InstallFrontendArgs -> async Result.Result<(), Text>;
  };

  /// Ask a storage canister to start pulling its frontend from this backend
  public func installFrontend(canisterId : Principal, args : InstallFrontendArgs) : async Result.Result<(), Text> {
    let storageCanister = actor (Principal.toText(canisterId)) : FrontendPullCanister;
    try {
      await storageCanister.installFrontend(args);
    } catch (error) {
      #err("installFrontend call failed: " # Error.message(error));
    };
  };

  public func getInstalledWasmHash(canisterId : Principal) : async Result.Result<?Blob, Text> {
    try {
      let info = await ic.canister_info({
        canister_id = canisterId;
        num_requested_changes = ?0;
      });
      #ok(info.module_hash);
    } catch (error) {
      #err("Failed to read installed WASM hash: " # Error.message(error));
    };
  };

  public func hasInstalledWasmHash(canisterId : Principal, expectedHash : Blob) : async Bool {
    switch (await getInstalledWasmHash(canisterId)) {
      case (#ok(?installedHash)) Blob.equal(installedHash, expectedHash);
      case _ false;
    };
  };

  public func updateSettings(
    storageCanisterId : Principal,
    deployerCanisterId : Principal,
    environmentVariables : ?[{ name : Text; value : Text }],
  ) : async Result.Result<(), Text> {
    try {
      let info = await ic.canister_info({
        canister_id = storageCanisterId;
        num_requested_changes = ?0;
      });
      let controllersWithoutDeployer = Array.filter(
        info.controllers,
        func(controller : Principal) : Bool {
          not Principal.equal(controller, deployerCanisterId);
        },
      );
      if (controllersWithoutDeployer.size() == 0) {
        return #err("Refusing to remove the deployer canister because no other controllers remain");
      };

      await ic.update_settings({
        canister_id = storageCanisterId;
        sender_canister_version = null;
        settings = {
          controllers = ?controllersWithoutDeployer;
          freezing_threshold = null;
          wasm_memory_threshold = null;
          reserved_cycles_limit = null;
          log_visibility = null;
          snapshot_visibility = null;
          wasm_memory_limit = null;
          memory_allocation = null;
          compute_allocation = null;
          environment_variables = environmentVariables;
        };
      });
      #ok(());
    } catch (error) {
      #err("Failed to update settings: " # Error.message(error));
    };
  };

  public func setStorageReleaseState(
    canisterId : Principal,
    stateInput : StorageReleasePlanner.StorageReleaseStateInput,
  ) : async Result.Result<(), Text> {
    let storageCanister = actor (Principal.toText(canisterId)) : StorageReleaseStateCanister;

    try {
      await storageCanister.setStorageReleaseState(stateInput);
      #ok;
    } catch (error) {
      #err("Failed to set storage release state: " # Error.message(error));
    };
  };
};
