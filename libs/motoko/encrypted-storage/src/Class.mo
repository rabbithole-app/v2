import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Lib "lib";
import T "Types";

module {
  public type Gates = {
    canUploadEncrypted : Nat -> Result.Result<(), Text>;
    canUseEncryption : () -> Result.Result<(), Text>;
  };

  public class Storage(store : T.StableStore, gates : ?Gates) {
    let uploadGate : ?(Nat -> Result.Result<(), Text>) = switch (gates) {
      case (?g) ?g.canUploadEncrypted;
      case null null;
    };
    let shareGate : ?(() -> Result.Result<(), Text>) = switch (gates) {
      case (?g) ?g.canUseEncryption;
      case null null;
    };

    // --- Status & HTTP ---

    public func getStatus(cycleBalance : Nat) : T.StorageStatus =
      Lib.getStatus(store, cycleBalance);

    public func httpRequest(req : T.HttpRequest) : Result.Result<T.HttpResponse, Text> =
      Lib.httpRequest(store, req);

    public func httpRequestStreamingCallback(token : T.StreamingToken) : Result.Result<T.StreamingCallbackResponse, Text> =
      Lib.httpRequestStreamingCallback(store, token);

    public func setStreamingCallback(callback : T.StreamingCallback) =
      Lib.setStreamingCallback(store, callback);

    // --- CRUD ---

    public func get(caller : Principal, args : T.GetArguments) : Result.Result<T.NodeDetails, Text> =
      Lib.get(store, caller, args);

    public func getChunk(caller : Principal, args : T.GetChunkArguments) : Result.Result<T.ChunkContent, Text> =
      Lib.getChunk(store, caller, args);

    public func create(caller : Principal, args : T.CreateArguments) : Result.Result<T.NodeDetails, Text> =
      Lib.create(store, caller, args);

    public func update(caller : Principal, args : T.UpdateArguments) : async* Result.Result<(), Text> {
      await* Lib.update(store, caller, args, uploadGate);
    };

    public func delete(caller : Principal, args : T.DeleteArguments) : Result.Result<(), Text> =
      Lib.delete(store, caller, args);

    public func move(caller : Principal, args : T.MoveArguments) : Result.Result<(), Text> =
      Lib.move(store, caller, args);

    public func rename(caller : Principal, args : T.RenameArguments) : Result.Result<(), Text> =
      Lib.rename(store, caller, args);

    public func clear(caller : Principal) : Result.Result<(), Text> =
      Lib.clear(store, caller);

    // --- Batch Upload ---

    public func createBatch(caller : Principal, args : T.CreateBatchArguments) : Result.Result<T.CreateBatchResponse, Text> =
      Lib.createBatch(store, caller, args, uploadGate);

    public func createChunk(caller : Principal, args : T.Chunk) : Result.Result<T.CreateChunkResponse, Text> =
      Lib.createChunk(store, caller, args, uploadGate);

    // --- Permissions ---

    public func hasPermission(caller : T.Caller, args : T.HasPermissionArguments) : Bool =
      Lib.hasPermission(store, caller, args);

    public func grantPermission(caller : T.Caller, args : T.GrantPermissionArguments) : Result.Result<(), Text> =
      Lib.grantPermission(store, caller, args, shareGate);

    public func revokePermission(caller : T.Caller, args : T.RevokePermissionArguments) : Result.Result<(), Text> =
      Lib.revokePermission(store, caller, args);

    // --- Listing ---

    public func list(caller : Principal, entry : ?T.Entry) : Result.Result<T.ListResponse, Text> =
      Lib.list(store, caller, entry);

    public func listPermitted(caller : Principal, entry : ?T.Entry) : async* Result.Result<[(Principal, T.PermissionExt)], Text> {
      await* Lib.listPermitted(store, caller, entry);
    };

    // --- Versioning ---

    public func listVersions(caller : Principal, args : T.ListVersionsArguments) : Result.Result<[T.FileVersionDetails], Text> =
      Lib.listVersions(store, caller, args);

    public func restoreVersion(caller : Principal, args : T.RestoreVersionArguments) : Result.Result<(), Text> =
      Lib.restoreVersion(store, caller, args);

    // --- Tree ---

    public func showTree(caller : T.Caller, entry : ?T.Entry) : Result.Result<Text, Text> =
      Lib.showTree(store, caller, entry);

    public func fsTree(caller : Principal) : Result.Result<[T.TreeNode], Text> =
      Lib.fsTree(store, caller);

    // --- VetKey ---

    public func getVetkeyVerificationKey() : async T.VetKeyVerificationKey {
      await Lib.getVetkeyVerificationKey(store);
    };

    public func validateVetkeyAccess(caller : T.Caller, keyId : T.KeyId) : Result.Result<Blob, Text> =
      Lib.validateVetkeyAccess(store, caller, keyId);

    public func getEncryptedVetkey(caller : T.Caller, keyId : T.KeyId, transportKey : T.TransportKey) : async Result.Result<T.VetKey, Text> {
      await Lib.getEncryptedVetkey(store, caller, keyId, transportKey);
    };

    // --- Thumbnails ---

    public func setThumbnail(caller : T.Caller, args : T.SetThumbnailArguments) : Result.Result<T.NodeDetails, Text> =
      Lib.setThumbnail(store, caller, args);

    // --- Caffeine Blob Storage ---

    public func commitCaffeineUpload(caller : Principal, args : T.CommitCaffeineUploadArgs) : Result.Result<(), Text> =
      Lib.commitCaffeineUpload(store, caller, args);

    public func getStorageBackendType() : T.StorageBackend =
      store.storageBackendType;
  };
};
