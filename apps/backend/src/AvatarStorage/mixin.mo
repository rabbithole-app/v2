import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Prim "mo:prim";

import CaffeineStorage "mo:caffeineai-object-storage/Storage";
import ZenDB "mo:zendb";

import BlobStorageCashier "../BlobStorage/CashierAccount";
import Users "../Users/lib";

mixin(
  canisterId : Principal,
  db : ZenDB.Database,
) {
  let avatarUploadReservations : Map.Map<Principal, Users.AvatarUploadReservation> = Map.empty();
  let avatarDrafts : Map.Map<Principal, Users.AvatarRef> = Map.empty();
  transient let avatarObjectStorageState : CaffeineStorage.State = CaffeineStorage.new();
  transient let avatarObjectStorageCashier : BlobStorageCashier.Store = BlobStorageCashier.new(avatarObjectStorageState);
  transient let avatarUsers = Users.Users(db, avatarUploadReservations, avatarDrafts);

  public shared ({ caller }) func prepareAvatarUpload(args : Users.PrepareAvatarUploadArgs) : async Users.PrepareAvatarUploadResult {
    assert not Principal.isAnonymous(caller);
    switch (avatarUsers.prepareAvatarUpload(caller, args)) {
      case (#ok(result)) {
        await ensureAvatarBlobStorageCashierActivated();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  func hasPendingAvatarUpload(caller : Principal, rootHash : Text) : Bool {
    avatarUsers.hasPendingAvatarUpload(caller, rootHash);
  };

  public shared ({ caller }) func commitAvatarUpload(rootHash : Text) : async Users.AvatarRef {
    assert not Principal.isAnonymous(caller);
    switch (avatarUsers.commitAvatarUpload(caller, rootHash)) {
      case (#ok(avatarRef)) avatarRef;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clearAvatar() : async () {
    assert not Principal.isAnonymous(caller);
    let #err(message) = avatarUsers.clearAvatar(caller) else return;
    throw Error.reject(message);
  };

  // --- Caffeine Blob Storage protocol for backend-owned avatars ---

  type ImmutableObjectStorageRefillInformation = BlobStorageCashier.RefillInformation;

  type ImmutableObjectStorageRefillResult = BlobStorageCashier.RefillResult;

  type ImmutableObjectStorageCreateCertificateResult = {
    method : Text;
    blob_hash : Text;
  };

  func ensureAvatarBlobStorageCashierActivated() : async () {
    await BlobStorageCashier.ensureActivated(avatarObjectStorageCashier);
  };

  func grantAvatarBlobStorageCashierFullAccess(delegate : Principal) : async () {
    await BlobStorageCashier.grantFullAccess(avatarObjectStorageCashier, delegate);
  };

  func revokeAvatarBlobStorageCashierFullAccess(delegate : Principal) : async () {
    await BlobStorageCashier.revokeFullAccess(delegate);
  };

  func syncAvatarBlobStorageCashierFullAccessDelegates(delegates : [Principal]) : async () {
    await BlobStorageCashier.syncExactFullAccessDelegates(avatarObjectStorageCashier, delegates);
  };

  public shared ({ caller }) func _immutableObjectStorageCreateCertificate(blobHash : Text) : async ImmutableObjectStorageCreateCertificateResult {
    assert not Principal.isAnonymous(caller);
    if (not hasPendingAvatarUpload(caller, blobHash)) {
      throw Error.reject("avatar upload was not prepared");
    };
    {
      method = "upload";
      blob_hash = blobHash;
    };
  };

  public query func _immutableObjectStorageBlobsAreLive(hashes : [Blob]) : async [Bool] {
    Array.map<Blob, Bool>(hashes, func(hash) = Prim.isStorageBlobLive(hash));
  };

  public query ({ caller }) func _immutableObjectStorageBlobsToDelete() : async [Blob] {
    if (not CaffeineStorage.isAuthorized(avatarObjectStorageState, caller)) {
      Runtime.trap("Unauthorized access");
    };
    switch (Prim.getDeadBlobs()) {
      case null [];
      case (?deadBlobs) deadBlobs.sliceToArray(0, 10000);
    };
  };

  public shared ({ caller }) func _immutableObjectStorageConfirmBlobDeletion(blobs : [Blob]) : async () {
    if (not CaffeineStorage.isAuthorized(avatarObjectStorageState, caller)) {
      Runtime.trap("Unauthorized access");
    };
    Prim.pruneConfirmedDeadBlobs(blobs);
    type GC = actor {
      __motoko_gc_trigger : () -> async ();
    };
    let gc = actor (Principal.toText(canisterId)) : GC;
    await gc.__motoko_gc_trigger();
  };

  public shared func _immutableObjectStorageUpdateGatewayPrincipals() : async () {
    await CaffeineStorage.updateGatewayPrincipals(avatarObjectStorageState);
  };

  public shared ({ caller }) func _immutableObjectStorageRefillCashier(refillInformation : ?ImmutableObjectStorageRefillInformation) : async ImmutableObjectStorageRefillResult {
    let cashier = await CaffeineStorage.getCashierPrincipal();
    if (cashier != caller) {
      Runtime.trap("Unauthorized access");
    };
    await BlobStorageCashier.refill(avatarObjectStorageCashier, refillInformation);
  };
};
