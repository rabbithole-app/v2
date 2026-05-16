import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import Lib "lib";
import T "Types";

module {
  public type Gates = {
    canUploadEncrypted : Nat -> Result.Result<(), Text>;
    canUseEncryption : () -> Result.Result<(), Text>;
    onAccessChanged : ?(T.StoredStorageEvent -> ());
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
    let accessHook : ?(T.StoredStorageEvent -> ()) = switch (gates) {
      case (?g) g.onAccessChanged;
      case null null;
    };

    func emitAccessEvent(event : T.StorageAccessEvent) {
      let storedEvent = Lib.recordStorageAccessEvent(store, event);
      switch (accessHook) {
        case (?hook) hook(storedEvent);
        case null {};
      };
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

    // --- Access ---

    public func isOwnerEquivalent(principal : Principal) : Bool =
      Lib.isOwnerEquivalent(store, principal);

    public func listOwnerEquivalentPrincipals(caller : Principal) : Result.Result<[T.OwnerEquivalentPrincipal], Text> =
      Lib.listOwnerEquivalentPrincipals(store, caller);

    public func getRecoveryStatus(caller : Principal) : Result.Result<T.RecoveryStatus, Text> =
      Lib.getRecoveryStatus(store, caller);

    public func registerRecoveryController(caller : Principal, principal : Principal) : Result.Result<T.RegisterRecoveryControllerResult, Text> {
      switch (Lib.registerRecoveryController(store, caller, principal)) {
        case (#ok(result)) {
          emitAccessEvent(#recoveryControllerRegistered({ principal = result.principal; previous = result.previous }));
          #ok(result);
        };
        case (#err(message)) #err(message);
      };
    };

    public func clearRecoveryController(caller : Principal) : Result.Result<Principal, Text> {
      switch (Lib.clearRecoveryController(store, caller)) {
        case (#ok(principal)) {
          emitAccessEvent(#recoveryControllerCleared({ principal }));
          #ok(principal);
        };
        case (#err(message)) #err(message);
      };
    };

    public func addRecoveryOwner(caller : Principal, principal : Principal, options : T.AddRecoveryOwnerOptions) : Result.Result<T.OwnerEquivalentPrincipal, Text> {
      switch (Lib.addRecoveryOwner(store, caller, principal, options)) {
        case (#ok(record)) {
          emitAccessEvent(#recoveryOwnerAdded({ principal = record.principal }));
          #ok(record);
        };
        case (#err(message)) #err(message);
      };
    };

    public func takeRecoveryOwnership(caller : Principal) : Result.Result<T.OwnerEquivalentPrincipal, Text> {
      switch (Lib.takeRecoveryOwnership(store, caller)) {
        case (#ok(record)) {
          emitAccessEvent(#recoveryOwnerAdded({ principal = record.principal }));
          #ok(record);
        };
        case (#err(message)) #err(message);
      };
    };

    public func activateRecoveryOwnership(caller : Principal, principal : Principal) : Result.Result<T.OwnerEquivalentPrincipal, Text> {
      switch (Lib.activateRecoveryOwnership(store, caller, principal)) {
        case (#ok(record)) {
          emitAccessEvent(#recoveryOwnerAdded({ principal = record.principal }));
          #ok(record);
        };
        case (#err(message)) #err(message);
      };
    };

    public func removeRecoveryOwner(caller : Principal, principal : Principal) : Result.Result<(), Text> {
      switch (Lib.removeRecoveryOwner(store, caller, principal)) {
        case (#ok) {
          emitAccessEvent(#recoveryOwnerRemoved({ principal }));
          #ok;
        };
        case (#err(message)) #err(message);
      };
    };

    public func createPendingAccessGrant(caller : Principal, args : T.CreatePendingAccessGrantArguments) : Result.Result<T.PendingAccessGrant, Text> {
      switch (Lib.createPendingAccessGrant(store, caller, args, shareGate)) {
        case (#ok(result)) {
          for (grant in result.revokedPrincipalGrants.vals()) {
            emitAccessEvent(#principalGrantRevoked({ principal = grant.principal; accessClass = ?grant.accessClass }));
          };
          for (grant in result.cancelled.vals()) {
            emitAccessEvent(#pendingGrantCancelled({ grantId = grant.id; ref = grant.ref }));
          };
          emitAccessEvent(#pendingGrantCreated({ grantId = result.grant.id; ref = result.grant.ref; accessClass = result.grant.accessClass; source = result.grant.source }));
          #ok(result.grant);
        };
        case (#err(message)) #err(message);
      };
    };

    public func createAccessBatch(caller : Principal, args : T.CreateAccessBatchArguments) : Result.Result<T.CreateAccessBatchResult, Text> {
      switch (Lib.createAccessBatch(store, caller, args, shareGate)) {
        case (#ok(result)) {
          for (grant in result.revokedPrincipalGrants.vals()) {
            emitAccessEvent(#principalGrantRevoked({ principal = grant.principal; accessClass = ?grant.accessClass }));
          };
          for (grant in result.cancelledPendingGrants.vals()) {
            emitAccessEvent(#pendingGrantCancelled({ grantId = grant.id; ref = grant.ref }));
          };
          for (grant in result.principalGrants.vals()) {
            emitAccessEvent(#principalGrantCreated({ grantId = ?grant.id; principal = grant.principal; accessClass = grant.accessClass; source = grant.source }));
          };
          for (grant in result.pendingGrants.vals()) {
            emitAccessEvent(#pendingGrantCreated({ grantId = grant.id; ref = grant.ref; accessClass = grant.accessClass; source = grant.source }));
          };
          #ok(result);
        };
        case (#err(message)) #err(message);
      };
    };

    public func revokeAccessBatch(caller : Principal, args : T.RevokeAccessBatchArguments) : Result.Result<T.RevokeAccessBatchResult, Text> {
      switch (Lib.revokeAccessBatch(store, caller, args)) {
        case (#ok(result)) {
          for (item in result.revoked.vals()) {
            emitAccessEvent(#principalGrantRevoked({ principal = item.principal; accessClass = null }));
          };
          #ok(result);
        };
        case (#err(message)) #err(message);
      };
    };

    func emitPendingGrantClaimed(claimed : T.ClaimedPendingAccessGrant) {
      if (claimed.created) {
        let grant = claimed.principalGrant;
        emitAccessEvent(#pendingGrantClaimed({
          grantId = claimed.pendingGrant.id;
          principal = grant.principal;
          accessClass = grant.accessClass;
          source = grant.source;
          claimOrigin = claimed.claimOrigin;
          emailClaimState = ?claimed.pendingGrant.emailClaimState;
        }));
      };
    };

    public func claimPendingAccessGrant(caller : Principal, args : T.ClaimPendingAccessGrantArguments) : Result.Result<T.PrincipalAccessGrant, Text> {
      switch (Lib.claimPendingAccessGrant(store, caller, args)) {
        case (#ok(claimed)) {
          emitPendingGrantClaimed(claimed);
          #ok(claimed.principalGrant);
        };
        case (#err(message)) #err(message);
      };
    };

    public func claimPendingAccessByVerifiedAttributes(caller : Principal, args : T.ClaimPendingAccessByVerifiedAttributesArguments) : Result.Result<[T.PrincipalAccessGrant], Text> {
      switch (Lib.claimPendingAccessByVerifiedAttributes(store, caller, args)) {
        case (#ok(claimedGrants)) {
          for (claimed in claimedGrants.vals()) {
            emitPendingGrantClaimed(claimed);
          };
          #ok(Array.map<T.ClaimedPendingAccessGrant, T.PrincipalAccessGrant>(claimedGrants, func(claimed) = claimed.principalGrant));
        };
        case (#err(message)) #err(message);
      };
    };

    public func claimPendingAccessByBackendAttestation(caller : Principal, args : T.ClaimPendingAccessByBackendAttestationArguments) : Result.Result<[T.PrincipalAccessGrant], Text> {
      switch (Lib.claimPendingAccessByBackendAttestation(store, caller, args)) {
        case (#ok(claimedGrants)) {
          for (claimed in claimedGrants.vals()) {
            emitPendingGrantClaimed(claimed);
          };
          #ok(Array.map<T.ClaimedPendingAccessGrant, T.PrincipalAccessGrant>(claimedGrants, func(claimed) = claimed.principalGrant));
        };
        case (#err(message)) #err(message);
      };
    };

    public func cancelPendingAccessGrant(caller : Principal, args : T.CancelPendingAccessGrantArguments) : Result.Result<T.PendingAccessGrant, Text> {
      switch (Lib.cancelPendingAccessGrant(store, caller, args)) {
        case (#ok(result)) {
          for (grant in result.revokedPrincipalGrants.vals()) {
            emitAccessEvent(#principalGrantRevoked({ principal = grant.principal; accessClass = ?grant.accessClass }));
          };
          emitAccessEvent(#pendingGrantCancelled({ grantId = result.grant.id; ref = result.grant.ref }));
          #ok(result.grant);
        };
        case (#err(message)) #err(message);
      };
    };

    public func listPendingAccessGrants(caller : Principal) : Result.Result<[T.PendingAccessGrant], Text> =
      Lib.listPendingAccessGrants(store, caller);

    public func listAccessGrants(caller : Principal, args : T.ListAccessGrantsArguments) : Result.Result<T.AccessGrantList, Text> =
      Lib.listAccessGrants(store, caller, args);

    public func createDurableAccessGrant(caller : Principal, args : T.CreateDurableAccessGrantArguments) : Result.Result<T.PrincipalAccessGrant, Text> {
      switch (Lib.createDurableAccessGrant(store, caller, args, shareGate)) {
        case (#ok(grant)) {
          emitAccessEvent(#principalGrantCreated({ grantId = ?grant.id; principal = grant.principal; accessClass = grant.accessClass; source = grant.source }));
          #ok(grant);
        };
        case (#err(message)) #err(message);
      };
    };

    public func hasActiveDurableGrantForKey(caller : Principal, keyId : T.KeyId) : Bool =
      Lib.hasActiveDurableGrantForKey(store, caller, keyId);

    public func createAccessRequest(caller : Principal, args : T.CreateAccessRequestArguments) : Result.Result<T.AccessRequest, Text> {
      switch (Lib.createAccessRequest(store, caller, args)) {
        case (#ok(request, created)) {
          if (created) {
            emitAccessEvent(#accessRequestCreated({ requestId = request.id; requester = request.requester }));
          };
          #ok(request);
        };
        case (#err(message)) #err(message);
      };
    };

    public func cancelAccessRequest(caller : Principal, args : T.CancelAccessRequestArguments) : Result.Result<T.AccessRequest, Text> {
      switch (Lib.cancelAccessRequest(store, caller, args)) {
        case (#ok(request)) {
          emitAccessEvent(#accessRequestCancelled({ requestId = request.id; requester = request.requester }));
          #ok(request);
        };
        case (#err(message)) #err(message);
      };
    };

    public func getMyAccessRequest(caller : Principal) : Result.Result<?T.AccessRequest, Text> =
      Lib.getMyAccessRequest(store, caller);

    public func resolveAccessRequest(caller : Principal, args : T.ResolveAccessRequestArguments) : Result.Result<T.AccessRequest, Text> {
      switch (Lib.resolveAccessRequest(store, caller, args, shareGate)) {
        case (#ok(request, grant)) {
          switch (grant) {
            case (?value) emitAccessEvent(#principalGrantCreated({ grantId = ?value.id; principal = value.principal; accessClass = value.accessClass; source = value.source }));
            case null {};
          };
          emitAccessEvent(#accessRequestResolved({ requestId = request.id; requester = request.requester; status = request.status }));
          #ok(request);
        };
        case (#err(message)) #err(message);
      };
    };

    public func listAccessRequests(caller : Principal) : Result.Result<[T.AccessRequest], Text> =
      Lib.listAccessRequests(store, caller);

    public func listStorageEvents(caller : Principal, afterId : ?Nat, limit : Nat) : Result.Result<[T.StoredStorageEvent], Text> =
      Lib.listStorageEvents(store, caller, afterId, limit);

    public func listLatestStorageEvents(caller : Principal, limit : Nat) : Result.Result<[T.StoredStorageEvent], Text> =
      Lib.listLatestStorageEvents(store, caller, limit);

    public func getStorageEventsUnreadCount(caller : Principal) : Result.Result<Nat, Text> =
      Lib.getStorageEventsUnreadCount(store, caller);

    public func markStorageEventsRead(caller : Principal, upToEventId : Nat) : Result.Result<(), Text> =
      Lib.markStorageEventsRead(store, caller, upToEventId);

    public func markAllVisibleStorageEventsRead(caller : Principal) : Result.Result<(), Text> =
      Lib.markAllVisibleStorageEventsRead(store, caller);

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

    // --- Listing ---

    public func list(caller : Principal, entry : ?T.Entry) : Result.Result<T.ListResponse, Text> =
      Lib.list(store, caller, entry);

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
