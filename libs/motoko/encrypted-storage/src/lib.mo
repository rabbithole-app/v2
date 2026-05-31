import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Order "mo:core/Order";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Nat8 "mo:core/Nat8";
import Time "mo:core/Time";

import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Map "mo:map/Map";
import MemoryRegion "mo:memory-region/MemoryRegion";
import Sha256 "mo:sha2/Sha256";
import Vector "mo:vector";
import CertifiedAssets "mo:certified-assets/Stable";

import T "Types";
import Access "Access/lib";
import StorageEvents "StorageEvents/lib";
import Migrations "Migrations/lib";
import Utils "Utils";
import FileSystem "FileSystem";
import Upload "Upload";
import ErrorMessages "ErrorMessages";
import File "FileSystem/File";
import Node "FileSystem/Node";
import Permissions "FileSystem/Permissions";
import Common "FileSystem/Common";
import Thumbnail "Thumbnail";
import Const "Const";
import Http "Http";
import Certification "Certification";
import StorageAccounting "StorageAccounting";
import UploadSession "UploadSession";
import UploadStaging "UploadSession/Staging";

module EncryptedFileStorage {
  public type StableStore = T.StableStore;
  public type VersionedStableStore = T.VersionedStableStore;
  public type ActiveUploadSession = Upload.ActiveSession;
  public type UploadCommitMeasurement = UploadSession.CommitMeasurement;
  /// Creates a new versioned stable store. Called once during initial canister deployment.
  /// On subsequent upgrades, the existing stable variable is preserved and migrated
  /// via `upgradeStableStore`.
  ///
  /// Example:
  /// ```motoko
  /// stable var versionedStore = EncryptedStorage.initStableStore({
  ///   canisterId;
  ///   accountOwner = owner;
  ///   vetKdKeyId = keyId;
  ///   domainSeparator = "file_storage_dapp";
  ///   region = MemoryRegion.new();
  ///   rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
  ///   certs = null;
  /// });
  /// versionedStore := EncryptedStorage.upgradeStableStore(versionedStore);
  /// let storage = EncryptedStorage.fromVersion(versionedStore);
  /// ```
  public func initStableStore({ accountOwner; region; rootPermissions; canisterId; vetKdKeyId; domainSeparator; certs; backendId; storageBackendType } : T.EncryptedStorageInitArgs) : T.VersionedStableStore {
    let fs = FileSystem.new({
      region;
      rootPermissions;
    });
    let upload = Upload.new(region);

    #v1({
      canisterId;
      region;
      fs;
      upload;
      staging = Map.new();
      certs = Option.get(certs, CertifiedAssets.init_stable_store());
      vetKdKeyId;
      domainSeparatorBytes = Text.encodeUtf8(domainSeparator);
      var streamingCallback = null;

      // Subscription & Backend
      var backendId = backendId;
      var subscriptionCache = null;
      var storedBytesUsed = 0;
      var cachedModuleHash = null;
      var lastCycleAlertAt = 0;
      var lastCycleAlertLevel = null;
      var cachedIdleBurnPerDay = null;

      // Caffeine Blob Storage
      storageBackendType;

      // Access foundation
      access = Access.new(accountOwner);
      storageEvents = StorageEvents.new();
      storageEventReadState = StorageEvents.newReadState();
    });
  };

  /// Migrates the versioned store to the current version.
  /// Safe to call on every upgrade — if already at the latest version, returns as-is.
  /// `options.backendId` updates backendId on each upgrade (from initArgs).
  public func upgradeStableStore(store : T.VersionedStableStore, options : T.UpgradeOptions) : T.VersionedStableStore {
    Migrations.upgrade(store, options);
  };

  /// Extracts the current-version StableStore from a VersionedStableStore.
  /// Must be called after `upgradeStableStore`.
  public func fromVersion(store : T.VersionedStableStore) : T.StableStore {
    Migrations.getCurrentState(store);
  };

  /// Returns canister status summary (cycle balance filled by caller).
  public func getStatus(self : T.StableStore, cycleBalance : Nat) : T.StorageStatus {
    {
      cycleBalance;
      subscriptionStatus = switch (self.subscriptionCache) {
        case (?cache) ?cache.status;
        case null null;
      };
      storedBytesUsed = self.storedBytesUsed;
      backendId = self.backendId;
      storageBackendType = self.storageBackendType;
    };
  };

  /* -------------------------------- Access -------------------------------- */

  public func recordStorageAccessEvent(self : T.StableStore, event : T.StorageAccessEvent) : T.StoredStorageEvent {
    let correlationId = "storage:" # Principal.toText(self.canisterId) # ":event:" # Nat.toText(self.storageEvents.nextEventId);
    StorageEvents.emit(self.storageEvents, ?correlationId, storageAccessEventVisibleTo(event), #access(event));
  };

  public func listStorageEvents(self : T.StableStore, caller : Principal, afterId : ?Nat, limit : Nat) : Result.Result<[T.StoredStorageEvent], Text> {
    #ok(StorageEvents.listVisible(self.storageEvents, caller, Access.isOwnerEquivalent(self.access, caller), afterId, limit));
  };

  public func listLatestStorageEvents(self : T.StableStore, caller : Principal, limit : Nat) : Result.Result<[T.StoredStorageEvent], Text> {
    #ok(StorageEvents.listLatestVisible(self.storageEvents, caller, Access.isOwnerEquivalent(self.access, caller), limit));
  };

  public func getStorageEventsUnreadCount(self : T.StableStore, caller : Principal) : Result.Result<Nat, Text> {
    #ok(StorageEvents.getUnreadCount(self.storageEvents, self.storageEventReadState, caller, Access.isOwnerEquivalent(self.access, caller)));
  };

  public func markStorageEventsRead(self : T.StableStore, caller : Principal, upToEventId : Nat) : Result.Result<(), Text> {
    StorageEvents.markRead(self.storageEventReadState, self.storageEvents, caller, upToEventId);
    #ok();
  };

  public func markAllVisibleStorageEventsRead(self : T.StableStore, caller : Principal) : Result.Result<(), Text> {
    StorageEvents.markAllVisibleRead(self.storageEventReadState, self.storageEvents, caller, Access.isOwnerEquivalent(self.access, caller));
    #ok();
  };

  func storageAccessEventVisibleTo(event : T.StorageAccessEvent) : [Principal] {
    switch (event) {
      case (#pendingGrantCreated({ ref })) principalAccessRefVisibleTo(ref);
      case (#pendingGrantClaimed({ principal })) [principal];
      case (#pendingGrantCancelled({ ref })) principalAccessRefVisibleTo(ref);
      case (#principalGrantCreated({ principal })) [principal];
      case (#principalGrantRevoked({ principal })) [principal];
      case (#recoveryControllerRegistered({ principal })) [principal];
      case (#recoveryControllerCleared({ principal })) [principal];
      case (#recoveryOwnerAdded({ principal })) [principal];
      case (#recoveryOwnerRemoved({ principal })) [principal];
      case (#accessRequestCreated({ requester })) [requester];
      case (#accessRequestResolved({ requester })) [requester];
      case (#accessRequestCancelled({ requester })) [requester];
      case (#ownerActivityRecorded({ principal })) [principal];
      case (#durablePolicyCreated(_)) [];
      case (#durablePolicyGraceStarted(_)) [];
      case (#durablePolicyMatured(_)) [];
      case (#durablePolicyReleased(_)) [];
      case (#durablePolicyCancelled(_)) [];
    };
  };

  func principalAccessRefVisibleTo(ref : T.AccessRef) : [Principal] {
    switch (ref) {
      case (#principal(principal)) [principal];
      case (#email(_)) [];
      case (#emailCommitment(_)) [];
    };
  };

  public func isOwnerEquivalent(self : T.StableStore, principal : Principal) : Bool {
    Access.isOwnerEquivalent(self.access, principal);
  };

  public func recordOwnerActivity(self : T.StableStore, caller : Principal, args : T.RecordOwnerActivityArguments) : Result.Result<T.OwnerActivityRecord, Text> {
    Access.recordOwnerActivity(self.access, caller, args.origin);
  };

  public func getOwnerActivityState(self : T.StableStore, caller : Principal) : Result.Result<T.OwnerActivityState, Text> {
    Access.getOwnerActivityState(self.access, caller);
  };

  public func listOwnerEquivalentPrincipals(self : T.StableStore, caller : Principal) : Result.Result<[T.OwnerEquivalentPrincipal], Text> {
    if (not Access.isOwnerEquivalent(self.access, caller)) {
      return #err("caller is not owner-equivalent");
    };
    #ok(Access.listOwnerEquivalentPrincipals(self.access));
  };

  public func getRecoveryStatus(self : T.StableStore, caller : Principal) : Result.Result<T.RecoveryStatus, Text> {
    if (not Access.isOwnerEquivalent(self.access, caller)) {
      return #err("caller is not owner-equivalent");
    };
    #ok(Access.getRecoveryStatus(self.access));
  };

  public func registerRecoveryController(
    self : T.StableStore,
    caller : Principal,
    principal : Principal,
  ) : Result.Result<T.RegisterRecoveryControllerResult, Text> {
    Access.registerRecoveryController(self.access, caller, principal);
  };

  public func clearRecoveryController(self : T.StableStore, caller : Principal) : Result.Result<Principal, Text> {
    Access.clearRecoveryController(self.access, caller);
  };

  public func addRecoveryOwner(
    self : T.StableStore,
    caller : Principal,
    principal : Principal,
    options : T.AddRecoveryOwnerOptions,
  ) : Result.Result<T.OwnerEquivalentPrincipal, Text> {
    Access.addRecoveryOwner(self.access, caller, principal, {
      controllerRecovery = options.controllerRecovery;
      rootPermissionBeforeRecovery = null;
    });
  };

  func restoreRecoveryRootPermission(self : T.StableStore, record : T.OwnerEquivalentPrincipal) {
    switch (record.rootPermissionBeforeRecovery) {
      case (?permission) ignore Map.put(self.fs.rootPermissions, Map.phash, record.principal, permission);
      case null Map.delete(self.fs.rootPermissions, Map.phash, record.principal);
    };
  };

  public func takeRecoveryOwnership(self : T.StableStore, caller : Principal) : Result.Result<T.OwnerEquivalentPrincipal, Text> {
    let rootPermissionBeforeRecovery = Map.get(self.fs.rootPermissions, Map.phash, caller);
    switch (Access.takeRecoveryOwnership(self.access, caller, rootPermissionBeforeRecovery)) {
      case (#err(message)) #err(message);
      case (#ok({ current; previous })) {
        switch (previous) {
          case (?record) if (record.principal != current.principal) restoreRecoveryRootPermission(self, record);
          case _ {};
        };
        ignore Map.put(self.fs.rootPermissions, Map.phash, current.principal, #ReadWriteManage);
        #ok(current);
      };
    };
  };

  public func activateRecoveryOwnership(self : T.StableStore, caller : Principal, principal : Principal) : Result.Result<T.OwnerEquivalentPrincipal, Text> {
    let rootPermissionBeforeRecovery = Map.get(self.fs.rootPermissions, Map.phash, principal);
    switch (Access.activateRecoveryOwnership(self.access, caller, principal, rootPermissionBeforeRecovery)) {
      case (#err(message)) #err(message);
      case (#ok({ current; previous })) {
        switch (previous) {
          case (?record) if (record.principal != current.principal) restoreRecoveryRootPermission(self, record);
          case _ {};
        };
        ignore Map.put(self.fs.rootPermissions, Map.phash, current.principal, #ReadWriteManage);
        #ok(current);
      };
    };
  };

  public func removeRecoveryOwner(self : T.StableStore, caller : Principal, principal : Principal) : Result.Result<(), Text> {
    switch (Access.removeRecoveryOwner(self.access, caller, principal)) {
      case (#err(message)) #err(message);
      case (#ok(record)) {
        restoreRecoveryRootPermission(self, record);
        #ok;
      };
    };
  };

  func scopeToFindBy(scope : T.AccessScope) : T.FindBy {
    switch (scope) {
      case (#root) #root;
      case (#entry(entry)) #entry(entry);
      case (#keyId(keyId)) #keyId(keyId);
    };
  };

  func resolveExistingEntry(self : T.StableStore, (kind, path) : T.Entry) : ?T.NodeStore {
    let segments = Text.split(path, #char '/') |> Vector.fromIter<Text>(_);
    let cleaned = Vector.new<Text>();
    for (segment in Vector.vals(segments)) {
      if (segment != "") Vector.add(cleaned, segment);
    };

    if (Vector.size(cleaned) == 0) {
      return null;
    };

    let nodeName = switch (Vector.removeLast(cleaned)) {
      case (?value) value;
      case null return null;
    };
    let filename : ?Text = if (kind == #File) ?nodeName else null;
    var parentId : ?Nat64 = null;

    for (name in Vector.vals(cleaned)) {
      let ?{ id } = Map.get(self.fs.nodes, Utils.hashNodes, (#Directory, parentId, name)) else return null;
      parentId := ?id;
    };

    let nodeKey : T.NodeKey = switch (filename) {
      case (?name) (#File, parentId, name);
      case null (#Directory, parentId, nodeName);
    };
    Map.get(self.fs.nodes, Utils.hashNodes, nodeKey);
  };

  func resolveAccessScope(self : T.StableStore, scope : T.AccessScope) : Result.Result<(T.AccessScope, T.FindBy), Text> {
    switch (scope) {
      case (#root) #ok(#root, #root);
      case (#keyId(keyId)) {
        let ?_node = Common.findNodeByKeyId(self.fs, keyId) else return #err("access scope not found");
        #ok(#keyId(keyId), #keyId(keyId));
      };
      case (#entry(entry)) {
        let ?node = resolveExistingEntry(self, entry) else return #err("access scope not found");
        #ok(#keyId(node.keyId), #keyId(node.keyId));
      };
    };
  };

  func accessScopeFromFindBy(self : T.StableStore, findBy : T.FindBy) : Result.Result<T.AccessScope, Text> {
    switch (findBy) {
      case (#root) #ok(#root);
      case (#keyId(keyId)) #ok(#keyId(keyId));
      case (#nodeKey(nodeKey)) {
        let ?node = Map.get(self.fs.nodes, Utils.hashNodes, nodeKey) else return #err("access scope not found");
        #ok(#keyId(node.keyId));
      };
      case (#entry(entry)) {
        let ?node = resolveExistingEntry(self, entry) else return #err("access scope not found");
        #ok(#keyId(node.keyId));
      };
    };
  };

  func accessScopeFromEntry(entry : ?T.Entry) : T.AccessScope {
    switch (entry) {
      case (?value) #entry(value);
      case null #root;
    };
  };

  func scopeEqual(a : T.AccessScope, b : T.AccessScope) : Bool {
    switch (a, b) {
      case (#root, #root) true;
      case (#entry(aEntry), #entry(bEntry)) aEntry == bEntry;
      case (#keyId(aKeyId), #keyId(bKeyId)) aKeyId == bKeyId;
      case _ false;
    };
  };

  func containsGrantId(grantIds : [Nat], grantId : Nat) : Bool {
    for (id in grantIds.vals()) {
      if (id == grantId) return true;
    };
    false;
  };

  func vectorContainsGrantId(grants : Vector.Vector<T.PrincipalAccessGrant>, grantId : Nat) : Bool {
    for (grant in Vector.vals(grants)) {
      if (grant.id == grantId) return true;
    };
    false;
  };

  func highestPermission(a : ?T.Permission, b : T.Permission) : T.Permission {
    switch (a) {
      case (?value) {
        if (Order.isLess(Utils.permissionCompare(value, b))) b else value;
      };
      case null b;
    };
  };

  func strongestActivePermissionForPrincipalScopeExcluding(
    self : T.StableStore,
    principal : Principal,
    scope : T.AccessScope,
    excludedGrantIds : [Nat],
  ) : ?T.Permission {
    var permission : ?T.Permission = null;
    for (grant in Access.listPrincipalAccessGrants(self.access).vals()) {
      if (
        grant.principal == principal and
        grant.revokedAt == null and
        scopeEqual(grant.scope, scope) and
        not containsGrantId(excludedGrantIds, grant.id)
      ) {
        permission := ?highestPermission(permission, grant.permission);
      };
    };
    permission;
  };

  func reconcilePrincipalAccessAfterRevokes(
    self : T.StableStore,
    caller : Principal,
    revokedGrants : [T.PrincipalAccessGrant],
  ) : Result.Result<(), Text> {
    let revokedIds = Array.map<T.PrincipalAccessGrant, Nat>(revokedGrants, func(grant) = grant.id);
    for (grant in revokedGrants.vals()) {
      let (_, findBy) = switch (resolveAccessScope(self, grant.scope)) {
        case (#err(message)) return #err(message);
        case (#ok(value)) value;
      };
      switch (strongestActivePermissionForPrincipalScopeExcluding(self, grant.principal, grant.scope, revokedIds)) {
        case (?permission) {
          switch (Permissions.setUserRights(self.fs, caller, findBy, grant.principal, permission)) {
            case (#err(message)) return #err(message);
            case (#ok) {};
          };
        };
        case null {
          switch (Permissions.removeUserRights(self.fs, caller, findBy, grant.principal)) {
            case (#err(message)) return #err(message);
            case (#ok) {};
          };
        };
      };
    };
    #ok;
  };

  func claimedPrincipalGrantsForPendingReplacements(
    self : T.StableStore,
    ref : T.AccessRef,
    scope : T.AccessScope,
    accessClass : T.AccessClass,
  ) : [T.PrincipalAccessGrant] {
    let grants = Vector.new<T.PrincipalAccessGrant>();
    for (pending in Access.getActivePendingAccessGrantsToReplace(self.access, ref, scope, accessClass).vals()) {
      for (grant in Access.getClaimedPrincipalAccessGrantsForPending(self.access, pending).vals()) {
        if (not vectorContainsGrantId(grants, grant.id)) {
          Vector.add(grants, grant);
        };
      };
    };
    Vector.toArray(grants);
  };

  func canonicalScopeForList(self : T.StableStore, scope : T.AccessScope) : ?T.AccessScope {
    switch (resolveAccessScope(self, scope)) {
      case (#ok((canonicalScope, _))) ?canonicalScope;
      case (#err(_)) null;
    };
  };

  func isAncestorScope(self : T.StableStore, ancestorScope : T.AccessScope, targetScope : T.AccessScope) : Bool {
    switch (ancestorScope, targetScope) {
      case (#root, _) true;
      case (_, #root) false;
      case (#keyId(ancestorKeyId), #keyId(targetKeyId)) {
        let ?_ancestor = Common.findNodeByKeyId(self.fs, ancestorKeyId) else return false;
        var current = Common.findNodeByKeyId(self.fs, targetKeyId);
        label parents while (true) {
          switch (current) {
            case null return false;
            case (?node) {
              if (node.keyId == ancestorKeyId) return true;
              switch (node.parentId) {
                case (?parentId) current := Common.findNodeById(self.fs, parentId);
                case null return false;
              };
            };
          };
        };
        false;
      };
      case _ false;
    };
  };

  func grantScopeMatch(
    self : T.StableStore,
    targetScope : T.AccessScope,
    mode : T.AccessGrantListMode,
    grantScope : T.AccessScope,
  ) : ?{ canonicalScope : T.AccessScope; inheritedFrom : ?T.AccessScope } {
    let ?canonicalGrantScope = canonicalScopeForList(self, grantScope) else return null;
    if (scopeEqual(canonicalGrantScope, targetScope)) {
      return ?{ canonicalScope = canonicalGrantScope; inheritedFrom = null };
    };
    switch (mode) {
      case (#exact) null;
      case (#effective) {
        if (isAncestorScope(self, canonicalGrantScope, targetScope)) {
          ?{ canonicalScope = canonicalGrantScope; inheritedFrom = ?canonicalGrantScope };
        } else {
          null;
        };
      };
    };
  };

  func pendingGrantIsActive(grant : T.PendingAccessGrant) : Bool {
    if (grant.claimedAt != null or grant.cancelledAt != null) return false;
    switch (grant.expiresAt) {
      case (?expiresAt) Time.now() <= expiresAt;
      case null true;
    };
  };

  type ValidatedAccessBatchItem = {
    #principal : {
      principal : Principal;
      accessClass : T.AccessClass;
      scope : T.AccessScope;
      findBy : T.FindBy;
      permission : T.Permission;
      source : T.AccessSource;
    };
    #pending : T.CreatePendingAccessGrantArguments;
  };

  type ValidatedRevokeAccessBatchItem = {
    original : T.RevokeAccessBatchItem;
    scope : T.AccessScope;
    findBy : T.FindBy;
  };

  type ValidatedPendingAccessMaterialization = {
    pending : T.PendingAccessGrant;
    scope : T.AccessScope;
    findBy : T.FindBy;
  };

  type ValidatedDurablePolicyGrant = {
    scope : T.AccessScope;
    findBy : T.FindBy;
    permission : T.Permission;
  };

  func validateCreateAccessBatchItem(
    self : T.StableStore,
    caller : Principal,
    item : T.CreateAccessBatchItem,
  ) : Result.Result<ValidatedAccessBatchItem, Text> {
    let (canonicalScope, findBy) = switch (resolveAccessScope(self, item.scope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
      case (#err(message)) return #err(message);
      case (#ok(_)) {};
    };

    switch (item.ref) {
      case (#principal(principal)) {
        switch (item.accessClass) {
          case (#ownerEquivalent) return #err("owner-equivalent access cannot be granted through access batch");
          case (#ordinary or #durable) {};
        };
        if (Principal.equal(principal, caller)) {
          return #err("caller cannot grant access to self in access batch");
        };
        switch (Access.validatePrincipalAccessGrant(principal, item.accessClass, item.source)) {
          case (#err(message)) return #err(message);
          case (#ok) {};
        };
        #ok(#principal({
          principal;
          accessClass = item.accessClass;
          scope = canonicalScope;
          findBy;
          permission = item.permission;
          source = item.source;
        }));
      };
      case (#email(_) or #emailCommitment(_)) {
        switch (item.accessClass) {
          case (#ownerEquivalent) return #err("owner-equivalent access cannot be pending");
          case (#ordinary or #durable) {};
        };
        #ok(#pending({ item with scope = canonicalScope }));
      };
    };
  };

  func validateRevokeAccessBatchItem(
    self : T.StableStore,
    caller : Principal,
    item : T.RevokeAccessBatchItem,
  ) : Result.Result<ValidatedRevokeAccessBatchItem, Text> {
    if (Principal.equal(item.principal, caller)) {
      return #err("caller cannot revoke access from self in access batch");
    };
    let (canonicalScope, findBy) = switch (resolveAccessScope(self, item.scope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
      case (#err(message)) return #err(message);
      case (#ok(_)) {};
    };
    #ok({ original = item; scope = canonicalScope; findBy });
  };

  func validatePendingAccessMaterialization(
    self : T.StableStore,
    caller : Principal,
    pending : T.PendingAccessGrant,
  ) : Result.Result<ValidatedPendingAccessMaterialization, Text> {
    let (canonicalScope, findBy) = switch (resolveAccessScope(self, pending.scope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    switch (Access.validatePrincipalAccessGrant(caller, pending.accessClass, pending.source)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    if (not sourceIsDurablePolicy(pending.source)) {
      switch (Permissions.getUserRights(self.fs, pending.createdBy, findBy, pending.createdBy)) {
        case (#err(message)) return #err(message);
        case (#ok(_)) {};
      };
    };
    #ok({ pending; scope = canonicalScope; findBy });
  };

  public func emailCommitmentForCanister(canisterId : Principal, email : Text) : Blob {
    let normalizedEmail = Text.toLower(Text.trim(email, #char ' '));
    let sha256 = Sha256.Digest(#sha256);
    sha256.writeBlob(Text.encodeUtf8("rabbithole:storage-access:v1"));
    sha256.writeBlob(Principal.toBlob(canisterId));
    sha256.writeBlob(Text.encodeUtf8(normalizedEmail));
    sha256.sum();
  };

  public func emailCommitment(self : T.StableStore, email : Text) : Blob {
    emailCommitmentForCanister(self.canisterId, email);
  };

  func ensureCanManageScope(self : T.StableStore, caller : Principal, scope : T.AccessScope) : Result.Result<(), Text> {
    let (_, findBy) = switch (resolveAccessScope(self, scope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    // getUserRights internally requires ReadWriteManage for the requested scope.
    switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
      case (#err(message)) #err(message);
      case (#ok(_)) #ok;
    };
  };

  func ensureCanManageRoot(self : T.StableStore, caller : Principal) : Result.Result<(), Text> {
    if (Access.isOwnerEquivalent(self.access, caller)) {
      return #ok;
    };
    ensureCanManageScope(self, caller, #root);
  };

  func sourceIsDurablePolicy(source : T.AccessSource) : Bool {
    switch (source) {
      case (#durablePolicy(_)) true;
      case _ false;
    };
  };

  func materializePendingAccessGrant(self : T.StableStore, caller : Principal, pending : T.PendingAccessGrant) : Result.Result<T.ClaimedPendingAccessGrant, Text> {
    let validated = switch (validatePendingAccessMaterialization(self, caller, pending)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    applyPendingAccessMaterialization(self, caller, validated, null);
  };

  func existingEmailClaimGrant(
    self : T.StableStore,
    principal : Principal,
    pending : T.PendingAccessGrant,
    origin : T.EmailClaimOrigin,
  ) : Result.Result<?T.PrincipalAccessGrant, Text> {
    switch (Access.getEmailClaimForOrigin(pending, origin)) {
      case (?claim) {
        if (claim.principal != principal) {
          return #err("pending access grant origin already claimed");
        };
        switch (Access.getPrincipalAccessGrant(self.access, claim.principalGrantId)) {
          case (?grant) {
            if (grant.revokedAt != null) {
              return #err("claimed principal grant is revoked");
            };
            #ok(?grant);
          };
          case null #err("claimed principal grant not found");
        };
      };
      case null #ok(null);
    };
  };

  func applyPendingAccessMaterialization(
    self : T.StableStore,
    principal : Principal,
    validated : ValidatedPendingAccessMaterialization,
    claimOrigin : ?T.EmailClaimOrigin,
  ) : Result.Result<T.ClaimedPendingAccessGrant, Text> {
    let pending = validated.pending;
    switch (claimOrigin) {
      case (?origin) {
        switch (existingEmailClaimGrant(self, principal, pending, origin)) {
          case (#err(message)) return #err(message);
          case (#ok(?grant)) return #ok({ pendingGrant = pending; principalGrant = grant; claimOrigin; created = false });
          case (#ok(null)) {};
        };
      };
      case null {};
    };
    let setRightsResult = if (sourceIsDurablePolicy(pending.source)) {
      Permissions.setUserRightsUnchecked(self.fs, validated.findBy, principal, pending.permission);
    } else {
      Permissions.setUserRights(self.fs, pending.createdBy, validated.findBy, principal, pending.permission);
    };
    switch (setRightsResult) {
      case (#err(message)) #err(message);
      case (#ok) {
        switch (Access.createPrincipalAccessGrant(self.access, pending.createdBy, principal, pending.accessClass, validated.scope, pending.permission, pending.source)) {
          case (#err(message)) #err(message);
          case (#ok(result)) {
            let nextPending = switch (claimOrigin) {
              case (?origin) {
                switch (Access.markPendingAccessGrantEmailClaimed(self.access, principal, result.grant.id, origin, pending)) {
                  case (#err(message)) return #err(message);
                  case (#ok(value)) value;
                };
              };
              case null Access.markPendingAccessGrantClaimed(self.access, principal, pending);
            };
            #ok({ pendingGrant = nextPending; principalGrant = result.grant; claimOrigin; created = true });
          };
        };
      };
    };
  };

  public func createPendingAccessGrant(self : T.StableStore, caller : Principal, args : T.CreatePendingAccessGrantArguments, shareGate : ?(() -> Result.Result<(), Text>)) : Result.Result<T.CreatePendingAccessGrantResult, Text> {
    let (canonicalScope, findBy) = switch (resolveAccessScope(self, args.scope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
      case (#err(message)) return #err(message);
      case (#ok(_)) {};
    };
    switch (shareGate) {
      case (?gate) switch (gate()) {
        case (#ok) {};
        case (#err(message)) return #err(message);
      };
      case null {};
    };
    let pendingArgs = { args with scope = canonicalScope };
    let revokedPrincipalGrants = claimedPrincipalGrantsForPendingReplacements(self, pendingArgs.ref, pendingArgs.scope, pendingArgs.accessClass);
    switch (reconcilePrincipalAccessAfterRevokes(self, caller, revokedPrincipalGrants)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (Access.createPendingAccessGrant(self.access, caller, pendingArgs)) {
      case (#err(message)) #err(message);
      case (#ok(result)) {
        for (grant in revokedPrincipalGrants.vals()) {
          ignore Access.revokePrincipalAccessGrantById(self.access, grant.id);
        };
        #ok({ result with revokedPrincipalGrants });
      };
    };
  };

  public func createAccessBatch(self : T.StableStore, caller : Principal, args : T.CreateAccessBatchArguments, shareGate : ?(() -> Result.Result<(), Text>)) : Result.Result<T.CreateAccessBatchResult, Text> {
    if (args.items.size() == 0) {
      return #ok({
        principalGrants = [];
        pendingGrants = [];
        revokedPrincipalGrants = [];
        cancelledPendingGrants = [];
      });
    };
    if (args.items.size() > 100) {
      return #err("access batch cannot contain more than 100 items");
    };
    switch (shareGate) {
      case (?gate) switch (gate()) {
        case (#ok) {};
        case (#err(message)) return #err(message);
      };
      case null {};
    };

    let validated = Vector.new<ValidatedAccessBatchItem>();
    for (item in args.items.vals()) {
      switch (validateCreateAccessBatchItem(self, caller, item)) {
        case (#err(message)) return #err(message);
        case (#ok(value)) Vector.add(validated, value);
      };
    };

    let principalGrants = Vector.new<T.PrincipalAccessGrant>();
    let pendingGrants = Vector.new<T.PendingAccessGrant>();
    let revokedPrincipalGrants = Vector.new<T.PrincipalAccessGrant>();
    let cancelledPendingGrants = Vector.new<T.PendingAccessGrant>();
    for (item in Vector.vals(validated)) {
      switch (item) {
        case (#principal(value)) {
          switch (Permissions.setUserRights(self.fs, caller, value.findBy, value.principal, value.permission)) {
            case (#err(message)) return #err("access batch apply failed after validation: " # message);
            case (#ok) {};
          };
          switch (Access.createPrincipalAccessGrant(self.access, caller, value.principal, value.accessClass, value.scope, value.permission, value.source)) {
            case (#err(message)) return #err("access batch metadata failed after validation: " # message);
            case (#ok(result)) {
              for (grant in result.revoked.vals()) {
                Vector.add(revokedPrincipalGrants, grant);
              };
              Vector.add(principalGrants, result.grant);
            };
          };
        };
        case (#pending(value)) {
          let pendingRevokedGrants = claimedPrincipalGrantsForPendingReplacements(self, value.ref, value.scope, value.accessClass);
          switch (reconcilePrincipalAccessAfterRevokes(self, caller, pendingRevokedGrants)) {
            case (#err(message)) return #err("access batch pending revoke failed after validation: " # message);
            case (#ok) {};
          };
          switch (Access.createPendingAccessGrant(self.access, caller, value)) {
            case (#err(message)) return #err("access batch pending grant failed after validation: " # message);
            case (#ok(result)) {
              for (grant in pendingRevokedGrants.vals()) {
                ignore Access.revokePrincipalAccessGrantById(self.access, grant.id);
                Vector.add(revokedPrincipalGrants, grant);
              };
              for (grant in result.cancelled.vals()) {
                Vector.add(cancelledPendingGrants, grant);
              };
              Vector.add(pendingGrants, result.grant);
            };
          };
        };
      };
    };
    #ok({
      principalGrants = Vector.toArray(principalGrants);
      pendingGrants = Vector.toArray(pendingGrants);
      revokedPrincipalGrants = Vector.toArray(revokedPrincipalGrants);
      cancelledPendingGrants = Vector.toArray(cancelledPendingGrants);
    });
  };

  public func revokeAccessBatch(self : T.StableStore, caller : Principal, args : T.RevokeAccessBatchArguments) : Result.Result<T.RevokeAccessBatchResult, Text> {
    if (args.items.size() == 0) {
      return #ok({ revoked = [] });
    };
    if (args.items.size() > 100) {
      return #err("access batch cannot contain more than 100 items");
    };

    let validated = Vector.new<ValidatedRevokeAccessBatchItem>();
    for (item in args.items.vals()) {
      switch (validateRevokeAccessBatchItem(self, caller, item)) {
        case (#err(message)) return #err(message);
        case (#ok(value)) Vector.add(validated, value);
      };
    };

    let revoked = Vector.new<T.RevokeAccessBatchItem>();
    for (item in Vector.vals(validated)) {
      switch (Permissions.removeUserRights(self.fs, caller, item.findBy, item.original.principal)) {
        case (#err(message)) return #err("access batch revoke failed after validation: " # message);
        case (#ok) {};
      };
      Access.revokePrincipalAccessGrants(self.access, item.original.principal, item.scope, null);
      Vector.add(revoked, item.original);
    };
    #ok({ revoked = Vector.toArray(revoked) });
  };

  public func claimPendingAccessGrant(self : T.StableStore, caller : Principal, args : T.ClaimPendingAccessGrantArguments) : Result.Result<T.ClaimedPendingAccessGrant, Text> {
    switch (Access.getClaimablePendingAccessGrant(self.access, caller, args)) {
      case (#err(message)) #err(message);
      case (#ok(pending)) materializePendingAccessGrant(self, caller, pending);
    };
  };

  func claimPendingEmailAccess(
    self : T.StableStore,
    principal : Principal,
    args : T.ClaimPendingAccessByVerifiedAttributesArguments,
    origin : T.EmailClaimOrigin,
  ) : Result.Result<[T.ClaimedPendingAccessGrant], Text> {
    let pendingGrants = Access.getClaimablePendingAccessGrantsByVerifiedAttributes(self.access, principal, args, origin);
    let validatedGrants = Vector.new<ValidatedPendingAccessMaterialization>();
    for (pending in pendingGrants.vals()) {
      switch (validatePendingAccessMaterialization(self, principal, pending)) {
        case (#err(message)) return #err(message);
        case (#ok(validated)) Vector.add(validatedGrants, validated);
      };
    };
    let grants = Vector.new<T.ClaimedPendingAccessGrant>();
    for (validated in Vector.vals(validatedGrants)) {
      switch (applyPendingAccessMaterialization(self, principal, validated, ?origin)) {
        case (#err(message)) return #err(message);
        case (#ok(grant)) Vector.add(grants, grant);
      };
    };
    #ok(Vector.toArray(grants));
  };

  public func claimPendingAccessByVerifiedAttributes(
    self : T.StableStore,
    caller : Principal,
    args : T.ClaimPendingAccessByVerifiedAttributesArguments,
  ) : Result.Result<[T.ClaimedPendingAccessGrant], Text> {
    claimPendingEmailAccess(self, caller, args, #storage);
  };

  public func claimPendingAccessByBackendAttestation(
    self : T.StableStore,
    caller : Principal,
    args : T.ClaimPendingAccessByBackendAttestationArguments,
  ) : Result.Result<[T.ClaimedPendingAccessGrant], Text> {
    let ?backendId = self.backendId else return #err("storage backend is not configured");
    if (not Principal.equal(caller, backendId)) {
      return #err("caller is not trusted backend");
    };
    if (Principal.isAnonymous(args.principal)) {
      return #err("anonymous principal cannot claim email access");
    };
    claimPendingEmailAccess(self, args.principal, { emailCommitments = args.emailCommitments }, #rabbithole);
  };

  public func cancelPendingAccessGrant(self : T.StableStore, caller : Principal, args : T.CancelPendingAccessGrantArguments) : Result.Result<T.CancelPendingAccessGrantResult, Text> {
    let ?pending = Access.getPendingAccessGrant(self.access, args.grantId) else return #err("pending access grant not found");
    switch (Access.validatePendingAccessGrantCancellation(self.access, caller, pending)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    let revokedPrincipalGrants = Access.getClaimedPrincipalAccessGrantsForPending(self.access, pending);
    switch (reconcilePrincipalAccessAfterRevokes(self, caller, revokedPrincipalGrants)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (Access.cancelPendingAccessGrant(self.access, caller, args)) {
      case (#err(message)) #err(message);
      case (#ok(result)) #ok({ result with revokedPrincipalGrants });
    };
  };

  public func listPendingAccessGrants(self : T.StableStore, caller : Principal) : Result.Result<[T.PendingAccessGrant], Text> {
    if (not Access.isOwnerEquivalent(self.access, caller)) {
      return #err("caller is not owner-equivalent");
    };
    #ok(Access.listPendingAccessGrants(self.access));
  };

  public func listAccessGrants(self : T.StableStore, caller : Principal, args : T.ListAccessGrantsArguments) : Result.Result<T.AccessGrantList, Text> {
    let requestedScope = Option.get(args.scope, #root);
    let (targetScope, _) = switch (resolveAccessScope(self, requestedScope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    switch (ensureCanManageScope(self, caller, targetScope)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };

    let principalGrants = Vector.new<T.ListedPrincipalAccessGrant>();
    for (grant in Access.listPrincipalAccessGrants(self.access).vals()) {
      switch (grantScopeMatch(self, targetScope, args.mode, grant.scope)) {
        case (?match) {
          Vector.add(principalGrants, {
            grant = { grant with scope = match.canonicalScope };
            inheritedFrom = match.inheritedFrom;
          });
        };
        case null {};
      };
    };

    let pendingGrants = Vector.new<T.ListedPendingAccessGrant>();
    for (grant in Access.listPendingAccessGrants(self.access).vals()) {
      if (pendingGrantIsActive(grant)) {
        switch (grantScopeMatch(self, targetScope, args.mode, grant.scope)) {
          case (?match) {
            Vector.add(pendingGrants, {
              grant = { grant with scope = match.canonicalScope };
              inheritedFrom = match.inheritedFrom;
            });
          };
          case null {};
        };
      };
    };

    #ok({
      scope = targetScope;
      mode = args.mode;
      principalGrants = Vector.toArray(principalGrants);
      pendingGrants = Vector.toArray(pendingGrants);
    });
  };

  public func createDurableAccessGrant(self : T.StableStore, caller : Principal, args : T.CreateDurableAccessGrantArguments, shareGate : ?(() -> Result.Result<(), Text>)) : Result.Result<T.PrincipalAccessGrant, Text> {
    let (canonicalScope, findBy) = switch (resolveAccessScope(self, args.scope)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
      case (#err(message)) return #err(message);
      case (#ok(_)) {};
    };
    switch (shareGate) {
      case (?gate) switch (gate()) {
        case (#ok) {};
        case (#err(message)) return #err(message);
      };
      case null {};
    };
    switch (Access.validatePrincipalAccessGrant(args.principal, #durable, args.source)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    switch (Permissions.setUserRights(self.fs, caller, findBy, args.principal, args.permission)) {
      case (#err(message)) #err(message);
      case (#ok) Access.createPrincipalAccessGrant(self.access, caller, args.principal, #durable, canonicalScope, args.permission, args.source) |> Result.mapOk(_, func(result) = result.grant);
    };
  };

  func validateDurablePolicyGrants(
    self : T.StableStore,
    caller : Principal,
    grants : [T.DurablePolicyGrantTemplate],
    requireManage : Bool,
  ) : Result.Result<[ValidatedDurablePolicyGrant], Text> {
    if (grants.size() == 0) {
      return #err("durable policy must contain at least one grant");
    };
    if (grants.size() > 100) {
      return #err("durable policy cannot contain more than 100 grants");
    };
    let validated = Vector.new<ValidatedDurablePolicyGrant>();
    for (grant in grants.vals()) {
      let (canonicalScope, findBy) = switch (resolveAccessScope(self, grant.scope)) {
        case (#err(message)) return #err(message);
        case (#ok(value)) value;
      };
      if (requireManage) {
        switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
          case (#err(message)) return #err(message);
          case (#ok(_)) {};
        };
      };
      Vector.add(validated, {
        scope = canonicalScope;
        findBy;
        permission = grant.permission;
      });
    };
    #ok(Vector.toArray(validated));
  };

  func validateDurablePolicyRecipients(recipients : [T.AccessRef]) : Result.Result<(), Text> {
    if (recipients.size() == 0) {
      return #err("durable policy must contain at least one recipient");
    };
    if (recipients.size() > 100) {
      return #err("durable policy cannot contain more than 100 recipients");
    };
    for (ref in recipients.vals()) {
      switch (ref) {
        case (#principal(principal)) {
          switch (Access.validatePrincipalAccessGrant(principal, #durable, #durablePolicy(0))) {
            case (#err(message)) return #err(message);
            case (#ok) {};
          };
        };
        case (#email(_) or #emailCommitment(_)) {};
      };
    };
    #ok;
  };

  public func createDurableAccessPolicy(self : T.StableStore, caller : Principal, args : T.CreateDurableAccessPolicyArguments, shareGate : ?(() -> Result.Result<(), Text>)) : Result.Result<T.DurableAccessPolicy, Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("anonymous caller not allowed");
    };
    switch (shareGate) {
      case (?gate) switch (gate()) {
        case (#ok) {};
        case (#err(message)) return #err(message);
      };
      case null {};
    };
    switch (validateDurablePolicyRecipients(args.recipients)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    let validatedGrants = switch (validateDurablePolicyGrants(self, caller, args.grants, true)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    let policyId = Access.nextDurablePolicyId(self.access);
    let policy : T.DurableAccessPolicy = {
      id = policyId;
      recipients = args.recipients;
      grants = Array.map<ValidatedDurablePolicyGrant, T.DurablePolicyGrantTemplate>(
        validatedGrants,
        func(grant) = { scope = grant.scope; permission = grant.permission },
      );
      trigger = args.trigger;
      status = #armed;
      createdAt = Time.now();
      createdBy = caller;
      proVerifiedAt = Time.now();
      graceStartedAt = null;
      maturedAt = null;
      releasedAt = null;
      cancelledAt = null;
      principalGrantIds = [];
      pendingGrantIds = [];
    };
    Access.putDurablePolicy(self.access, policy);
    #ok(policy);
  };

  func appendNat(ids : [Nat], value : Nat) : [Nat] {
    Array.tabulate<Nat>(
      ids.size() + 1,
      func(index) {
        if (index < ids.size()) ids[index] else value;
      },
    );
  };

  func releaseDurablePolicyUnchecked(self : T.StableStore, policy : T.DurableAccessPolicy) : Result.Result<T.DurablePolicyProcessResult, Text> {
    if (policy.status == #released) {
      return #ok({ policy; principalGrants = []; pendingGrants = [] });
    };
    if (policy.status == #cancelled) {
      return #err("durable policy is cancelled");
    };

    let validatedGrants = switch (validateDurablePolicyGrants(self, policy.createdBy, policy.grants, false)) {
      case (#err(message)) return #err(message);
      case (#ok(value)) value;
    };
    let principalGrants = Vector.new<T.PrincipalAccessGrant>();
    let pendingGrants = Vector.new<T.PendingAccessGrant>();
    var principalGrantIds = policy.principalGrantIds;
    var pendingGrantIds = policy.pendingGrantIds;

    for (recipient in policy.recipients.vals()) {
      for (grant in validatedGrants.vals()) {
        switch (recipient) {
          case (#principal(principal)) {
            switch (Permissions.setUserRightsUnchecked(self.fs, grant.findBy, principal, grant.permission)) {
              case (#err(message)) return #err(message);
              case (#ok) {};
            };
            switch (Access.createPrincipalAccessGrant(self.access, policy.createdBy, principal, #durable, grant.scope, grant.permission, #durablePolicy(policy.id))) {
              case (#err(message)) return #err(message);
              case (#ok(result)) {
                principalGrantIds := appendNat(principalGrantIds, result.grant.id);
                Vector.add(principalGrants, result.grant);
              };
            };
          };
          case (#email(_) or #emailCommitment(_)) {
            switch (Access.createPendingAccessGrant(self.access, policy.createdBy, {
              ref = recipient;
              accessClass = #durable;
              scope = grant.scope;
              permission = grant.permission;
              source = #durablePolicy(policy.id);
              expiresAt = null;
            })) {
              case (#err(message)) return #err(message);
              case (#ok(result)) {
                pendingGrantIds := appendNat(pendingGrantIds, result.grant.id);
                Vector.add(pendingGrants, result.grant);
              };
            };
          };
        };
      };
    };

    let released = {
      policy with
      status = #released;
      releasedAt = ?Time.now();
      principalGrantIds;
      pendingGrantIds;
    };
    Access.putDurablePolicy(self.access, released);
    #ok({
      policy = released;
      principalGrants = Vector.toArray(principalGrants);
      pendingGrants = Vector.toArray(pendingGrants);
    });
  };

  func inactivityDueAt(policy : T.DurableAccessPolicy, lastActivityAt : Time.Time) : ?Time.Time {
    switch (policy.trigger) {
      case (#inactivity({ inactiveForNs })) ?(lastActivityAt + Int.fromNat(inactiveForNs));
      case _ null;
    };
  };

  func shouldReleasePolicy(policy : T.DurableAccessPolicy, now : Time.Time, lastActivityAt : Time.Time) : Bool {
    switch (policy.trigger) {
      case (#manualRelease) false;
      case (#date({ releaseAt })) now >= releaseAt;
      case (#inactivity({ inactiveForNs; gracePeriodNs = null })) now >= lastActivityAt + Int.fromNat(inactiveForNs);
      case (#inactivity({ gracePeriodNs = ?gracePeriodNs })) {
        switch (policy.graceStartedAt) {
          case (?startedAt) now >= startedAt + Int.fromNat(gracePeriodNs);
          case null false;
        };
      };
    };
  };

  public func processDurableAccessPolicies(self : T.StableStore, caller : Principal) : Result.Result<[T.DurablePolicyProcessResult], Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("anonymous caller not allowed");
    };
    let results = Vector.new<T.DurablePolicyProcessResult>();
    let now = Time.now();
    for (policy in Access.listDurablePolicies(self.access).vals()) {
      switch (policy.status) {
        case (#cancelled or #released) {};
        case (#armed) {
          switch (policy.trigger) {
            case (#inactivity({ gracePeriodNs = ?_ })) {
              switch (inactivityDueAt(policy, self.access.lastOwnerActivityAt)) {
                case (?dueAt) if (now >= dueAt) {
                  let next = { policy with status = #grace; graceStartedAt = ?now };
                  Access.putDurablePolicy(self.access, next);
                  Vector.add(results, { policy = next; principalGrants = []; pendingGrants = [] });
                };
                case _ {};
              };
            };
            case _ {
              if (shouldReleasePolicy(policy, now, self.access.lastOwnerActivityAt)) {
                switch (releaseDurablePolicyUnchecked(self, policy)) {
                  case (#err(message)) return #err(message);
                  case (#ok(result)) Vector.add(results, result);
                };
              };
            };
          };
        };
        case (#grace) {
          switch (policy.graceStartedAt) {
            case (?startedAt) {
              if (self.access.lastOwnerActivityAt > startedAt) {
                let next = { policy with status = #armed; graceStartedAt = null };
                Access.putDurablePolicy(self.access, next);
                Vector.add(results, { policy = next; principalGrants = []; pendingGrants = [] });
              } else {
                switch (policy.trigger) {
                  case (#inactivity({ gracePeriodNs = ?gracePeriodNs })) {
                    if (now >= startedAt + Int.fromNat(gracePeriodNs)) {
                      switch (releaseDurablePolicyUnchecked(self, policy)) {
                        case (#err(message)) return #err(message);
                        case (#ok(result)) Vector.add(results, result);
                      };
                    };
                  };
                  case _ {};
                };
              };
            };
            case null {
              let next = { policy with status = #armed; graceStartedAt = null };
              Access.putDurablePolicy(self.access, next);
              Vector.add(results, { policy = next; principalGrants = []; pendingGrants = [] });
            };
          };
        };
        case (#matured) {
          if (shouldReleasePolicy(policy, now, self.access.lastOwnerActivityAt)) {
            switch (releaseDurablePolicyUnchecked(self, policy)) {
              case (#err(message)) return #err(message);
              case (#ok(result)) Vector.add(results, result);
            };
          };
        };
      };
    };
    #ok(Vector.toArray(results));
  };

  public func releaseDurableAccessPolicy(self : T.StableStore, caller : Principal, args : T.ReleaseDurableAccessPolicyArguments) : Result.Result<T.DurablePolicyProcessResult, Text> {
    if (not Access.isOwnerEquivalent(self.access, caller)) {
      return #err("caller is not owner-equivalent");
    };
    let ?policy = Access.getDurablePolicy(self.access, args.policyId) else return #err("durable policy not found");
    releaseDurablePolicyUnchecked(self, policy);
  };

  public func cancelDurableAccessPolicy(self : T.StableStore, caller : Principal, args : T.CancelDurableAccessPolicyArguments) : Result.Result<T.DurableAccessPolicy, Text> {
    if (not Access.isOwnerEquivalent(self.access, caller)) {
      return #err("caller is not owner-equivalent");
    };
    let ?policy = Access.getDurablePolicy(self.access, args.policyId) else return #err("durable policy not found");
    switch (policy.status) {
      case (#released) return #err("durable policy already released");
      case (#cancelled) return #err("durable policy already cancelled");
      case _ {};
    };
    let cancelled = { policy with status = #cancelled; cancelledAt = ?Time.now() };
    Access.putDurablePolicy(self.access, cancelled);
    #ok(cancelled);
  };

  public func listDurableAccessPolicies(self : T.StableStore, caller : Principal) : Result.Result<[T.DurableAccessPolicy], Text> {
    if (not Access.isOwnerEquivalent(self.access, caller)) {
      return #err("caller is not owner-equivalent");
    };
    #ok(Access.listDurablePolicies(self.access));
  };

  public func hasActiveDurableGrantForKey(self : T.StableStore, caller : Principal, keyId : T.KeyId) : Bool {
    for (grant in Access.listPrincipalAccessGrants(self.access).vals()) {
      if (grant.principal == caller and grant.accessClass == #durable and grant.revokedAt == null) {
        switch (grant.scope) {
          case (#root) return true;
          case (#keyId(grantKeyId)) {
            if (grantKeyId == keyId or isAncestorScope(self, #keyId(grantKeyId), #keyId(keyId))) {
              return true;
            };
          };
          case _ {};
        };
      };
    };
    false;
  };

  public func createAccessRequest(self : T.StableStore, caller : Principal, args : T.CreateAccessRequestArguments) : Result.Result<(T.AccessRequest, Bool), Text> {
    Access.createAccessRequest(self.access, caller, args);
  };

  public func cancelAccessRequest(self : T.StableStore, caller : Principal, args : T.CancelAccessRequestArguments) : Result.Result<T.AccessRequest, Text> {
    Access.cancelAccessRequest(self.access, caller, args);
  };

  public func getMyAccessRequest(self : T.StableStore, caller : Principal) : Result.Result<?T.AccessRequest, Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("anonymous caller not allowed");
    };
    #ok(Access.getLatestAccessRequestByRequester(self.access, caller));
  };

  public func resolveAccessRequest(self : T.StableStore, caller : Principal, args : T.ResolveAccessRequestArguments, shareGate : ?(() -> Result.Result<(), Text>)) : Result.Result<(T.AccessRequest, ?T.PrincipalAccessGrant), Text> {
    switch (args.decision) {
      case (#rejected) {
        switch (ensureCanManageRoot(self, caller)) {
          case (#err(message)) return #err(message);
          case (#ok) {};
        };
        switch (Access.resolveAccessRequest(self.access, caller, args)) {
          case (#err(message)) #err(message);
          case (#ok(request)) #ok(request, null);
        };
      };
      case (#approved({ scope; permission })) {
        switch (ensureCanManageRoot(self, caller)) {
          case (#err(message)) return #err(message);
          case (#ok) {};
        };
        let request = switch (Access.getPendingAccessRequest(self.access, args.requestId)) {
          case (#err(message)) return #err(message);
          case (#ok(value)) value;
        };
        let (canonicalScope, findBy) = switch (resolveAccessScope(self, scope)) {
          case (#err(message)) return #err(message);
          case (#ok(value)) value;
        };
        switch (Permissions.getUserRights(self.fs, caller, findBy, caller)) {
          case (#err(message)) return #err(message);
          case (#ok(_)) {};
        };
        switch (shareGate) {
          case (?gate) switch (gate()) {
            case (#ok) {};
            case (#err(message)) return #err(message);
          };
          case null {};
        };
        switch (Access.validatePrincipalAccessGrant(request.requester, #ordinary, #accessRequest(request.id))) {
          case (#err(message)) return #err(message);
          case (#ok) {};
        };
        switch (Permissions.setUserRights(self.fs, caller, findBy, request.requester, permission)) {
          case (#err(message)) #err(message);
          case (#ok) {
            switch (Access.createPrincipalAccessGrant(self.access, caller, request.requester, #ordinary, canonicalScope, permission, #accessRequest(request.id))) {
              case (#err(message)) #err(message);
              case (#ok(result)) {
                switch (Access.resolveAccessRequest(self.access, caller, args)) {
                  case (#err(message)) #err(message);
                  case (#ok(resolved)) #ok(resolved, ?result.grant);
                };
              };
            };
          };
        };
      };
    };
  };

  public func listAccessRequests(self : T.StableStore, caller : Principal) : Result.Result<[T.AccessRequest], Text> {
    switch (ensureCanManageRoot(self, caller)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    #ok(Access.listAccessRequests(self.access));
  };

  /// Handles HTTP requests.
  public func httpRequest(self : T.StableStore, req : T.HttpRequest) : Result.Result<T.HttpResponse, Text> {
    Http.processHttpRequest(self, req);
  };

  /// Handles HTTP request streaming callback.
  public func httpRequestStreamingCallback(self : T.StableStore, token : T.StreamingToken) : Result.Result<T.StreamingCallbackResponse, Text> {
    Http.httpRequestStreamingCallback(self, token);
  };

  // public func store(self : T.StableStore, caller : Principal, args : T.StoreArguments) : Result.Result<(), Text> {
  //   let #File({ path; metadata = { content; sha256; contentType; size } }) = args;

  //   switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(#File, path))) {
  //     case (#ok _) {};
  //     case (#err message) return #err message;
  //   };

  //   let hash = Sha256.fromBlob(#sha256, content);

  //   switch (sha256) {
  //     case (?providedHash) {
  //       if (hash != providedHash) {
  //         return #err(ErrorMessages.sha256HashMismatch(providedHash, hash));
  //       };
  //     };
  //     case null {};
  //   };

  //   let file : T.FileMetadataStore = switch (FileSystem.create(self.fs, caller, { entry = (#File, path) })) {
  //     case (#ok { metadata = #File(file) }) file;
  //     case (#ok { metadata = #Directory(_) }) Runtime.unreachable();
  //     case (#err message) return #err message;
  //   };

  //   File.replaceContent(self.fs, file, content, hash);
  //   file.contentType := contentType;

  //   #ok;
  // };

  public func get(self : T.StableStore, caller : Principal, args : T.GetArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {
        let ?node = FileSystem.get(self.fs, #entry(args.entry)) else return #err(ErrorMessages.entryNotFound(args.entry));
        #ok(FileSystem.getDetails(self.fs, self.storageBackendType, node));
      };
      case (#err message) #err message;
    };
  };

  public func getChunk(self : T.StableStore, caller : Principal, args : T.GetChunkArguments) : Result.Result<T.ChunkContent, Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    switch (FileSystem.get(self.fs, #entry(args.entry))) {
      case (?{ metadata = #File(file) }) {
        let numChunks = File.getChunksSize(file, args.version);

        if (args.chunkIndex >= numChunks) return #err("Chunk index out of bounds.");

        File.getChunk(self.fs, file, args.chunkIndex, args.version) |> #ok({
          content = Option.get<Blob>(_, "");
        });
      };
      case _ #err(ErrorMessages.entryNotFound(args.entry));
    };
  };

  /// Sets the streaming callback for the assets library.
  public func setStreamingCallback(self : T.StableStore, callback : T.StreamingCallback) {
    self.streamingCallback := ?callback;
  };

  /// Creates a file or directory at the specified path, creating all parent directories as needed.
  ///
  /// New files are placed in a staging area and hidden from `list()` until content is
  /// committed via `update()`. This prevents incomplete uploads from appearing in the UI.
  ///
  /// Use `#CreateNew` to create a new entry (fails if it already exists).
  /// Use `#GetOrCreate` to return an existing entry or create a new one.
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.create(storage, caller, {
  ///   entry = (#File, "dir/subdir/file.jpg");
  ///   createMode = #CreateNew;
  /// });
  /// ```
  public func create(self : T.StableStore, caller : Principal, args : T.CreateArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let { entry; createMode } = args;
    let (kind, _) = entry;

    // Check if file is currently in staging (incomplete upload)
    let nodeKey = UploadStaging.entryToNodeKey(self.fs, { entry });
    let existingNode = FileSystem.get(self.fs, #entry(entry));
    let hasExistingNode = switch (existingNode) {
      case (?_) true;
      case null false;
    };
    let inStaging = switch (nodeKey) {
      case (?nk) Map.has(self.staging, Utils.hashNodes, nk);
      case null false;
    };

    let result = switch (inStaging, existingNode, createMode, kind) {
      // File in staging with GetOrCreate → return existing node (retry upload)
      case (true, ?node, #GetOrCreate, #File) #ok(node);
      // File in staging with CreateNew → error (upload already in progress)
      case (true, _, #CreateNew, #File) #err(ErrorMessages.entryAlreadyExists(entry));
      // Normal flow: delegate to FileSystem
      case _ FileSystem.create(self.fs, caller, args, self.storageBackendType);
    };

    switch (result) {
      case (#ok(node)) {
        // Mark newly-created files in staging regardless of createMode.
        // Existing committed files returned by GetOrCreate stay visible while uploading a new version.
        let isNewFile = kind == #File and not inStaging and not hasExistingNode;
        if (isNewFile) {
          let nk : T.NodeKey = (#File, node.parentId, node.name);
          ignore Map.put(self.staging, Utils.hashNodes, nk, {
            node;
            var batchId : ?T.BatchId = null;
            createdAt = Time.now();
          });
        };
        #ok(FileSystem.getDetails(self.fs, self.storageBackendType, node));
      };
      case (#err msg) #err msg;
    };
  };

  public func listVersions(self : T.StableStore, caller : Principal, args : T.ListVersionsArguments) : Result.Result<[T.FileVersionDetails], Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };
    FileSystem.listVersions(self.fs, args.entry);
  };

  public func restoreVersion(self : T.StableStore, caller : Principal, args : T.RestoreVersionArguments) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    // Get node (for keyId) and current version BEFORE mutation
    let ?node = FileSystem.get(self.fs, #entry(args.entry)) else return #err(ErrorMessages.entryNotFound(args.entry));
    let #File(file) = node.metadata else return #err("Expected file, got directory");

    // Decertify old current version
    switch (File.getCurrentVersion(file)) {
      case (?prevVer) {
        Certification.decertifyBlobInfo(self, {
          keyId = node.keyId;
          version = prevVer;
        });
        switch (prevVer.sha256) {
          case (?sha) Certification.removeContentHash(self, {
            keyId = node.keyId;
            hash = sha;
          });
          case null {};
        };
      };
      case null {};
    };

    // Switch version
    switch (FileSystem.restoreVersion(self.fs, args.entry, args.version)) {
      case (#err msg) return #err msg;
      case (#ok) {};
    };

    // Certify new current version
    switch (File.getCurrentVersion(file)) {
      case (?newVer) {
        Certification.certifyBlobInfo(self, {
          keyId = node.keyId;
          version = newVer;
        });
        switch (newVer.sha256) {
          case (?sha) Certification.certifyContentHash(self, {
            keyId = node.keyId;
            hash = sha;
          });
          case null {};
        };
      };
      case null {};
    };

    #ok;
  };

  /// Updates data for a file or directory.
  /// To fully upload the file, follow these steps:
  /// 1. Create a file using the `create` method.
  /// 2. Start an upload session using `beginUploadSession`.
  /// 3. Upload all chunks using `appendUploadChunk`.
  /// 4. Complete the upload process using `finishUploadSession`.
  func checkStorageLimit(
    additionalBytes : Nat,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<(), Text> {
    switch (await* refreshSubscriptionStatus(onSubscriptionRefresh)) {
      case (#err msg) return #err msg;
      case (#ok) {};
    };

    switch (onFileStorage) {
      case (?check) switch (check(additionalBytes)) {
        case (#err msg) #err msg;
        case (#ok) #ok;
      };
      case null #ok;
    };
  };

  func refreshSubscriptionStatus(
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<(), Text> {
    switch (onSubscriptionRefresh) {
      case (?refresh) switch (await* refresh()) {
        case (#err msg) #err msg;
        case (#ok _) #ok;
      };
      case null #ok;
    };
  };

  public func update(
    self : T.StableStore,
    caller : Principal,
    args : T.UpdateArguments,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<(), Text> {
    let entry = switch (args) {
      case (#File { path }) (#File, path);
      case (#Directory { path }) (#Directory, path);
    };
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let ?node = FileSystem.get(self.fs, #entry(entry)) else return #err(ErrorMessages.entryNotFound(entry));

    // Check if node is in staging (incomplete upload)
    let nodeKey = UploadStaging.entryToNodeKey(self.fs, { entry });

    switch (node, args) {
      case ({ keyId; metadata = #File(file) }, #File { metadata = { sha256; chunkIds; contentType } }) {
        var committedBatchId : ?T.BatchId = null;

        for (chunkId in chunkIds.vals()) {
          let ?chunk = Upload.getChunk(self.upload, chunkId) else return #err("Chunk with id " # Nat.toText(chunkId) # " not found.");
          switch (committedBatchId) {
            case (?batchId) {
              if (batchId != chunk.batchId) {
                return #err("Invalid upload: chunks must belong to the same batch.");
              };
            };
            case null committedBatchId := ?chunk.batchId;
          };
        };

        let batchId = switch (committedBatchId) {
          case (?value) ?value;
          case null null;
        };

        switch (batchId) {
          case (?id) {
            let ?batch = Upload.getBatch(self.upload, id) else return #err(ErrorMessages.batchNotFound(id));
            if (not Principal.equal(batch.owner, caller)) {
              return #err("Batch " # Nat.toText(id) # " does not belong to caller");
            };
            if (batch.totalBytes != batch.declaredTotalBytes) {
              return #err(
                "Invalid upload: batch " #
                Nat.toText(id) #
                " has " #
                Nat.toText(batch.totalBytes) #
                " bytes uploaded but declared " #
                Nat.toText(batch.declaredTotalBytes) #
                " bytes."
              );
            };
          };
          case null {};
        };

        let chunkPointers = switch (batchId) {
          case (?id) switch (Upload.getPointersForChunkIds(self.upload, id, chunkIds)) {
            case (#ok(value)) value;
            case (#err(message)) return #err message;
          };
          case null [];
        };

        var totalLength = 0;
        for ((_, size) in chunkPointers.vals()) {
          totalLength += size;
        };

        // Size was reserved by the upload session; refresh entitlement status before commit.
        switch (await* refreshSubscriptionStatus(onSubscriptionRefresh)) {
          case (#err msg) return #err msg;
          case (#ok) {};
        };

        let hashResult = switch (batchId) {
          case (?id) switch (Upload.getBatchHash(self.upload, id)) {
            case (#ok(value)) value;
            case (#err(msg)) return #err("Failed to finalize upload hash: " # msg);
          };
          case null {
            let sha256 = Sha256.Digest(#sha256);
            {
              hash = sha256.sum();
              bytes = 0;
              chunkCount = 0;
              hashInstructions = 0;
            };
          };
        };
        let hash = hashResult.hash;

        switch (sha256) {
          case (?providedHash) {
            if (hash != providedHash) {
              return #err(ErrorMessages.sha256HashMismatch(providedHash, hash));
            };
          };
          case null {};
        };

        // Decertify stale blob-info from previous version (if BlobStorage)
        switch (File.getCurrentVersion(file)) {
          case (?prevVer) Certification.decertifyBlobInfo(self, {
            keyId;
            version = prevVer;
          });
          case null {};
        };

        let contentRefs = Array.map<T.SizedPointer, T.ContentRef>(
          chunkPointers,
          func(address : Nat, size : Nat) : T.ContentRef = #OnChain(address, size),
        );

        let storedBytesBefore = StorageAccounting.fileStoredBytes(file);
        File.addVersionRefs(self.fs, file, contentRefs, totalLength, hash, contentType);
        Certification.certifyContentHash(self, {
          keyId;
          hash;
        });
        switch (batchId) {
          case (?batchId) ignore Upload.forgetBatch(self.upload, batchId);
          case null {};
        };

        StorageAccounting.applyStoredBytesDelta(self, {
          file;
          beforeBytes = storedBytesBefore;
        });

        // Remove staging marker — file upload is now complete
        switch (nodeKey) {
          case (?nk) ignore Map.remove(self.staging, Utils.hashNodes, nk);
          case null {};
        };

        #ok;
      };
      case ({ metadata = #Directory(dir) }, #Directory { metadata }) {
        dir.color := metadata.color;
        #ok;
      };
      case _ Runtime.unreachable();
    };
  };

  /// Deletes a file or directory.
  ///
  /// Example:
  /// ```motoko
  /// let result = EncryptedStorage.delete(storage, caller, { entry = #File("dir/subdir/file.jpg"); recursive = false });
  /// switch (result) {
  ///   case (#ok) {
  ///     // the file was deleted successfully
  ///   };
  ///   case (#err message) return #err message;
  /// };
  /// ```
  ///
  /// To delete a non-empty directory, it must be called with the argument `recursive = true`
  public func delete(self : T.StableStore, caller : Principal, args : T.DeleteArguments) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    switch (FileSystem.delete(self.fs, args)) {
      case (#ok(nodes)) {
        for (node in nodes.vals()) {
          switch (node.metadata) {
            case (#File(file)) {
              // Recursive directory deletes return every removed node, so each file
              // must clean up its own chunk storage and certified endpoints here.
              switch (File.getCurrentVersion(file)) {
                case (?version) {
                  switch (version.sha256) {
                    case (?sha) Certification.removeContentHash(self, {
                      keyId = node.keyId;
                      hash = sha;
                    });
                    case null {};
                  };
                  Certification.decertifyBlobInfo(self, {
                    keyId = node.keyId;
                    version;
                  });
                };
                case null {};
              };
              let storedBytesBefore = StorageAccounting.fileStoredBytes(file);
              File.deallocateAll(self.fs, file);
              StorageAccounting.applyStoredBytesDelta(self, {
                file;
                beforeBytes = storedBytesBefore;
              });
            };
            case _ {};
          };
        };
      };
      case (#err(message)) return #err message;
    };

    #ok;
  };

  /// Preflights a Caffeine upload before the frontend encrypts and uploads
  /// chunks to the gateway. Commit still enforces the same gate.
  public func preflightCaffeineUpload(
    self : T.StableStore,
    caller : Principal,
    args : T.PreflightCaffeineUploadArgs,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<(), Text> {
    switch (self.storageBackendType) {
      case (#BlobStorage) {};
      case (#OnChain) return #err("Blob Storage is not enabled for this storage");
    };

    let entry = (#File, args.entry.1);
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let ?node = FileSystem.get(self.fs, #entry(entry)) else return #err(ErrorMessages.entryNotFound(entry));
    let #File(file) = node.metadata else return #err("Expected file, got directory");
    let _ = file;

    switch (await* checkStorageLimit(args.size, onFileStorage, onSubscriptionRefresh)) {
      case (#err msg) return #err msg;
      case (#ok) {};
    };

    #ok;
  };

  /// Commits a Caffeine upload. Called after frontend uploads encrypted chunks
  /// to the Caffeine gateway. Creates a FileVersion with #BlobStorage ref.
  public func commitCaffeineUpload(
    self : T.StableStore,
    caller : Principal,
    args : T.CommitCaffeineUploadArgs,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<(), Text> {
    let entry = (#File, args.entry.1);
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    let ?node = FileSystem.get(self.fs, #entry(entry)) else return #err(ErrorMessages.entryNotFound(entry));
    let #File(file) = node.metadata else return #err("Expected file, got directory");

    switch (await* checkStorageLimit(args.size, onFileStorage, onSubscriptionRefresh)) {
      case (#err msg) return #err msg;
      case (#ok) {};
    };

    // Decertify stale blob-info from previous version (if BlobStorage)
    switch (File.getCurrentVersion(file)) {
      case (?prevVer) Certification.decertifyBlobInfo(self, {
        keyId = node.keyId;
        version = prevVer;
      });
      case null {};
    };

    let storedBytesBefore = StorageAccounting.fileStoredBytes(file);
    File.addVersionBlobStorage(self.fs, file, Text.encodeUtf8(args.rootHash), args.size, args.sha256, args.contentType);
    Certification.certifyContentHash(self, {
      keyId = node.keyId;
      hash = args.sha256;
    });

    // Certify blob-info for new BlobStorage version
    let (_, blobInfoHash) = Utils.blobInfoJson(args.rootHash, args.contentType, args.size);
    CertifiedAssets.certify(self.certs, Certification.blobInfoEndpoint({
      keyId = node.keyId;
      bodyHash = blobInfoHash;
    }));

    StorageAccounting.applyStoredBytesDelta(self, {
      file;
      beforeBytes = storedBytesBefore;
    });

    // Remove staging marker
    let nodeKey = UploadStaging.entryToNodeKey(self.fs, { entry });
    switch (nodeKey) {
      case (?nk) ignore Map.remove(self.staging, Utils.hashNodes, nk);
      case null {};
    };

    #ok;
  };

  public func activeUploadReservationBytes(self : T.StableStore) : Nat {
    Upload.activeDeclaredBytes(self.upload);
  };

  public func activeUploadStagingBytes(self : T.StableStore) : Nat {
    Upload.activeUploadedBytes(self.upload);
  };

  public func activeUploadStagingChunkCount(self : T.StableStore) : Nat {
    Upload.activeUploadedChunkCount(self.upload);
  };

  public func activeUploadSessions(self : T.StableStore) : [ActiveUploadSession] {
    Upload.activeSessions(self.upload);
  };

  public func activeUploadSessionCount(self : T.StableStore) : Nat {
    UploadSession.activeUploadSessionCount(self);
  };

  public func memoryInfo(self : T.StableStore) : T.MemoryInfo {
    MemoryRegion.memoryInfo(self.region);
  };

  public func beginUploadSession(
    self : T.StableStore,
    caller : Principal,
    args : T.BeginUploadSessionArguments,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<T.BeginUploadSessionResponse, Text> {
    await* UploadSession.begin(self, caller, {
      request = args;
      hooks = {
        onFileStorage = onFileStorage;
        onSubscriptionRefresh = onSubscriptionRefresh;
        createTarget = func(createArgs : T.CreateArguments) : Result.Result<T.NodeDetails, Text> {
          create(self, caller, createArgs);
        };
      };
    });
  };

  public func getUploadSession(self : T.StableStore, caller : Principal, batchId : T.BatchId) : Result.Result<T.UploadSessionStatus, Text> {
    UploadSession.get(self, caller, { batchId });
  };

  public func appendUploadChunk(
    self : T.StableStore,
    caller : Principal,
    args : T.AppendUploadChunkArguments,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
  ) : Result.Result<T.AppendUploadChunkResponse, Text> {
    let _ = onFileStorage;
    // Storage quota is reserved at beginUploadSession. Per-chunk checks only
    // enforce the declared batch size inside Upload.appendChunk.
    Upload.appendChunk(self.upload, caller, args);
  };

  public func finishUploadSession(
    self : T.StableStore,
    caller : Principal,
    args : T.FinishUploadSessionArguments,
    onFileStorage : ?(Nat -> Result.Result<(), Text>),
    onSubscriptionRefresh : ?(() -> async* Result.Result<T.SubscriptionStatus, Text>),
  ) : async* Result.Result<UploadCommitMeasurement, Text> {
    await* UploadSession.finish(self, caller, {
      request = args;
      gates = {
        onFileStorage = onFileStorage;
        onSubscriptionRefresh = onSubscriptionRefresh;
      };
    });
  };

  public func abortUploadSession(self : T.StableStore, caller : Principal, batchId : T.BatchId) : Result.Result<(), Text> {
    UploadSession.abort(self, caller, { batchId });
  };

  public func rollbackBatch(self : T.StableStore, caller : Principal, batchId : T.BatchId) : Result.Result<(), Text> {
    UploadSession.rollback(self, caller, { batchId });
  };

  /// Move directories and files from one location to another. The method also recursively merges folders and files, replacing existing files and combining access rights.
  ///
  /// Example:
  /// ```motoko
  /// // before
  /// // .
  /// // ├─Documents
  /// // │ └─Books
  /// // │   └─book.pdf
  /// // └─Photos
  ///
  /// switch (EncryptedStorage.move(storage, caller, { entry = #Directory("Documents/Books"); target = null })) {
  ///   case (#ok _) {};
  ///   case (#err message) return #err message;
  /// };
  /// // after
  /// // .
  /// // ├─Documents
  /// // ├─Books
  /// // │ └─book.pdf
  /// // └─Photos
  /// ```
  public func move(self : T.StableStore, caller : Principal, args : T.MoveArguments) : Result.Result<(), Text> {
    let target = switch (args.target) {
      case (?entry) #entry(entry);
      case null #root;
    };
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry)), Permissions.ensureUserCanWrite(self.fs, caller, target)) {
      case (#ok _, #ok _) {};
      case (#err message, #ok _) return #err("Source error: " # message);
      case (_, #err message) return #err("Target error: " # message);
    };

    FileSystem.move(self.fs, args.entry, args.target);
  };

  /// Renames an entry (file or directory) without moving it
  public func rename(self : T.StableStore, caller : Principal, args : T.RenameArguments) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    FileSystem.rename(self.fs, args.entry, args.newName);
  };

  /// Clears the current storage
  public func clear(self : T.StableStore, caller : Principal) : Result.Result<(), Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #root)) {
      case (#ok _) {};
      case (#err message) return #err message;
    };

    FileSystem.clear(self.fs);
    Map.clear(self.staging);
    CertifiedAssets.clear(self.certs);

    #ok();
  };

  public func hasPermission(self : T.StableStore, caller : T.Caller, args : T.HasPermissionArguments) : Bool {
    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, args.entry)) {
      case (#ok v) v;
      case (#err _) return false;
    };

    switch (Permissions.getUserRights(self.fs, caller, findBy, args.user)) {
      case (#err _ or #ok null) false;
      case (#ok(?rights)) not Order.isLess(Utils.permissionCompare(rights, args.permission));
    };
  };

  func nodeKeyFromDetails(node : T.NodeDetails) : T.NodeKey {
    switch (node.metadata) {
      case (#File _) (#File, node.parentId, node.name);
      case (#Directory _) (#Directory, node.parentId, node.name);
    };
  };

  func getCallerPermission(fs : T.FileSystemStore, caller : Principal, node : T.NodeDetails) : ?T.Permission {
    Permissions.getMaxPermission(fs, caller, #nodeKey(nodeKeyFromDetails(node)), null);
  };

  func setCallerPermission(nodes : [T.NodeDetails], permission : ?T.Permission) : [T.NodeDetails] {
    Array.map<T.NodeDetails, T.NodeDetails>(nodes, func(node) = { node with callerPermission = permission });
  };

  func enrichSharing(fs : T.FileSystemStore, nodes : [T.NodeDetails]) : [T.NodeDetails] {
    let { hashNodes } = Utils;
    Array.map<T.NodeDetails, T.NodeDetails>(
      nodes,
      func(node) {
        let nodeKey = nodeKeyFromDetails(node);
        let count = switch (Map.get(fs.nodes, hashNodes, nodeKey)) {
          case (?raw) Map.size(raw.permissions);
          case null 0;
        };
        { node with sharing = if (count > 0) ?{ sharedWith = count } else null };
      },
    );
  };

  /// Returns a list of directories and files by the specified entry.
  /// If the user does not have the right to read the directory, it returns an array with the elements to which the user has the right to read.
  /// Each node is enriched with the caller's effective permission (callerPermission).
  /// The response also includes the caller's permission on the listed directory (directoryPermission).
  public func list(self : T.StableStore, caller : Principal, entry : ?T.Entry) : Result.Result<T.ListResponse, Text> {
    let dirFindBy = switch (FileSystem.getFilterByFromEntry(self.fs, entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };
    let directoryPermission = Permissions.getMaxPermission(self.fs, caller, dirFindBy, null);
    let canRead = directoryPermission != null;

    // Special case: when the caller cannot read the root directory,
    // we still want to show top-level directories leading to permitted resources
    // (e.g. show `Shared` if the caller has access to something under it).
    if (entry == null and not canRead) {
      let nat64hash : Map.HashUtils<Nat64> = (Map.hashNat64, Nat64.equal);

      let reachableRoots = Vector.new<T.NodeStore>();
      let seenRootIds = Map.new<Nat64, ()>();
      for (node in Map.vals(self.fs.nodes)) {
        if (Permissions.ensureUserCanRead(self.fs, caller, #keyId(node.keyId)) |> Result.isOk(_)) {
          let rootNode = Common.findRootAncestor(self.fs, node);
          if (Map.get(seenRootIds, nat64hash, rootNode.id) == null) {
            ignore Map.put(seenRootIds, nat64hash, rootNode.id, ());
            Vector.add(reachableRoots, rootNode);
          };
        };
      };

      let sortedRoots = Array.sort(Vector.toArray(reachableRoots), func(a, b) = Text.compare(a.name, b.name));
      let details = Array.map(sortedRoots, func(node : T.NodeStore) : T.NodeDetails = FileSystem.getDetails(self.fs, self.storageBackendType, node));
      let entries = Array.map<T.NodeDetails, T.NodeDetails>(
        details,
        func(node) = { node with callerPermission = getCallerPermission(self.fs, caller, node) },
      );
      return #ok({ entries; directoryPermission });
    };

    let parentId = switch (entry) {
      case (?v) {
        let ?{ id } = FileSystem.get(self.fs, #entry(v)) else return #ok({
          entries = [];
          directoryPermission;
        });
        ?id;
      };
      case null null;
    };
    let { phash } = Map;
    let rawNodes = FileSystem.listByParentId(self.fs, parentId);
    let allItems = Array.map(rawNodes, func(node : T.NodeStore) : T.NodeDetails = FileSystem.getDetails(self.fs, self.storageBackendType, node));
    // Filter out staged (incomplete upload) files
    let items = Array.filter(allItems, func(node : T.NodeDetails) : Bool = not UploadStaging.isStaged(self, { node }));

    if (not canRead) {
      // Check if caller can read the node directly OR has access to any descendant
      func hasReachableDescendant(nodeId : Nat64) : Bool {
        for (child in Map.vals(self.fs.nodes)) {
          if (child.parentId == ?nodeId) {
            if (Permissions.ensureUserCanRead(self.fs, caller, #keyId(child.keyId)) |> Result.isOk(_)) {
              return true;
            };
            // Recurse into directories
            switch (child.metadata) {
              case (#Directory _) if (hasReachableDescendant(child.id)) return true;
              case _ {};
            };
          };
        };
        false;
      };

      let filtered = Array.filter(
        items,
        func(node) {
          // Direct access
          if (Permissions.ensureUserCanRead(self.fs, caller, #nodeKey(nodeKeyFromDetails(node))) |> Result.isOk(_)) {
            return true;
          };
          // Or has reachable descendant (for directories)
          switch (node.metadata) {
            case (#Directory _) hasReachableDescendant(node.id);
            case _ false;
          };
        },
      );
      let entries = Array.map<T.NodeDetails, T.NodeDetails>(
        filtered,
        func(node) = { node with callerPermission = getCallerPermission(self.fs, caller, node) },
      );
      return #ok({ entries; directoryPermission });
    };

    // Optimization: check if any child has direct permission overrides for the caller
    // Uses raw NodeStore (which has permissions map) since NodeDetails no longer exposes it
    let hasChildOverrides = Option.isSome(
      Array.find<T.NodeStore>(
        rawNodes,
        func(node) {
          Map.has(node.permissions, phash, caller)
          or Map.has(node.permissions, phash, Principal.anonymous());
        },
      ),
    );

    let entries = if (not hasChildOverrides) {
      // Fast path: all children inherit directory permission
      setCallerPermission(items, directoryPermission);
    } else {
      // Slow path: per-node permission calculation
      Array.map<T.NodeDetails, T.NodeDetails>(
        items,
        func(node) = { node with callerPermission = getCallerPermission(self.fs, caller, node) },
      );
    };

    // Enrich sharing info for managers only
    let enrichedEntries = if (directoryPermission == ?#ReadWriteManage) {
      enrichSharing(self.fs, entries);
    } else { entries };

    #ok({ entries = enrichedEntries; directoryPermission });
  };

  /// Generates a text representation of the file system tree
  public func showTree(self : T.StableStore, caller : T.Caller, entry : ?T.Entry) : Result.Result<Text, Text> {
    let findBy = switch (FileSystem.getFilterByFromEntry(self.fs, entry)) {
      case (#ok v) v;
      case (#err message) return #err message;
    };

    Permissions.ensureUserCanRead(self.fs, caller, findBy) |> Result.mapOk(_, func v = FileSystem.showTree(self.fs, entry));
  };

  /// Returns a hierarchical file system tree with only writable directories.
  /// For owner/manager: full directory tree.
  /// For shared users: only writable roots with their subtrees.
  public func fsTree(self : T.StableStore, caller : Principal) : Result.Result<[T.TreeNode], Text> {
    // Owner/manager can see full tree
    switch (Permissions.getMaxPermission(self.fs, caller, #root, null)) {
      case (?perm) if (not Order.isLess(Utils.permissionCompare(perm, #ReadWrite))) {
        return #ok(FileSystem.tree(self.fs, null));
      };
      case _ {};
    };

    // Shared user: find all nodes with direct Write+ permission, collect writable roots
    let writableRoots = Vector.new<T.NodeStore>();

    func isWritable(permission : T.Permission) : Bool {
      not Order.isLess(Utils.permissionCompare(permission, #ReadWrite));
    };

    func hasWritableAncestor(node : T.NodeStore) : Bool {
      switch (node.parentId) {
        case null false;
        case (?pid) {
          switch (Common.findNodeById(self.fs, pid)) {
            case (?parent) {
              switch (Permissions.getMaxPermission(self.fs, caller, #keyId(parent.keyId), null)) {
                case (?perm) if (isWritable(perm)) true else hasWritableAncestor(parent);
                case null hasWritableAncestor(parent);
              };
            };
            case null false;
          };
        };
      };
    };

    for (node in Map.vals(self.fs.nodes)) {
      switch (node.metadata) {
        case (#Directory _) {
          switch (Permissions.getMaxPermission(self.fs, caller, #keyId(node.keyId), null)) {
            case (?perm) {
              if (isWritable(perm) and not hasWritableAncestor(node)) {
                Vector.add(writableRoots, node);
              };
            };
            case null {};
          };
        };
        case _ {};
      };
    };

    // Build subtree for each writable root, including full path as name
    let result = Vector.new<T.TreeNode>();
    for (root in Vector.vals(writableRoots)) {
      let path = FileSystem.getEntryPath(self.fs, root);
      let subtree = FileSystem.tree(self.fs, ?root.id);
      Vector.add(result, { name = path; children = ?subtree });
    };

    #ok(Vector.toArray(result));
  };

  /// Retrieves the vetKD verification key for this canister.
  /// This key is used to verify the authenticity of derived vetKeys.
  public func getVetkeyVerificationKey(self : T.StableStore) : async T.VetKeyVerificationKey {
    await ManagementCanister.vetKdPublicKey(?self.canisterId, self.domainSeparatorBytes, self.vetKdKeyId);
  };

  /// Retrieves an encrypted vetKey for caller and key id.
  /// The vetKey is secured using the provided transport key and can only be accessed by authorized users.
  /// Returns an error if the caller is not authorized to access the vetKey.
  /// Validates vetkey access (sync) and returns the derivation input blob.
  /// Use this from the canister actor to avoid module-level async self-calls.
  public func validateVetkeyAccess(self : T.StableStore, caller : T.Caller, keyId : T.KeyId) : Result.Result<Blob, Text> {
    switch (Permissions.ensureUserCanRead(self.fs, caller, #keyId keyId)) {
      case (#err message) #err message;
      case (#ok _) {
        let principalBytes = Blob.toArray(Principal.toBlob(keyId.0));
        let input = Array.flatten<Nat8>([
          [Nat8.fromNat(Array.size<Nat8>(principalBytes))],
          principalBytes,
          Blob.toArray(keyId.1),
        ]);
        #ok(Blob.fromArray(input));
      };
    };
  };

  /// Legacy async version — kept for backward compatibility with example canister.
  public func getEncryptedVetkey(self : T.StableStore, caller : T.Caller, keyId : T.KeyId, transportKey : T.TransportKey) : async Result.Result<T.VetKey, Text> {
    switch (validateVetkeyAccess(self, caller, keyId)) {
      case (#err message) #err message;
      case (#ok input) {
        #ok(await ManagementCanister.vetKdDeriveKey(input, self.domainSeparatorBytes, self.vetKdKeyId, transportKey));
      };
    };
  };

  public func updateDirectoryPolicy(self : T.StableStore, caller : T.Caller, args : T.UpdateDirectoryPolicyArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.getMaxPermission(self.fs, caller, #entry(args.entry), null)) {
      case (?permission) if (not Order.isLess(Utils.permissionCompare(permission, #ReadWriteManage))) {};
      case _ return #err("permission denied: " # Principal.toText(caller) # " does not have #ReadWriteManage access.");
    };

    FileSystem.setDirectoryPolicy(self.fs, self.storageBackendType, args)
    |> Result.mapOk(_, func(node : T.NodeStore) : T.NodeDetails = FileSystem.getDetails(self.fs, self.storageBackendType, node));
  };

  public func setThumbnail(self : T.StableStore, caller : T.Caller, args : T.SetThumbnailArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#err message) return #err message;
      case (#ok _) {};
    };

    let ?node = FileSystem.get(self.fs, #entry(args.entry)) else return #err(ErrorMessages.entryNotFound(args.entry));
    switch (args.thumbnailRef) {
      case (?thumbnailRef) {
        switch (Thumbnail.validateStorageBackend(FileSystem.resolveThumbnailStorageBackend(self.fs, self.storageBackendType, node), thumbnailRef)) {
          case (#ok) {};
          case (#err(message)) return #err(message);
        };
        switch (Thumbnail.validateEncryption(FileSystem.resolveThumbnailEncryption(self.fs, node), Thumbnail.encryption(thumbnailRef))) {
          case (#ok) {};
          case (#err(message)) return #err(message);
        };
      };
      case null {};
    };

    FileSystem.setThumbnail(self.fs, args) |> Result.mapOk(_, func(node : T.NodeStore) : T.NodeDetails = FileSystem.getDetails(self.fs, self.storageBackendType, node));
  };

  public func prepareThumbnailUpload(self : T.StableStore, caller : T.Caller, args : T.PrepareThumbnailUploadArguments) : Result.Result<T.PrepareThumbnailUploadResult, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#err message) return #err message;
      case (#ok _) {};
    };

    let ?node = FileSystem.get(self.fs, #entry(args.entry)) else return #err(ErrorMessages.entryNotFound(args.entry));
    let #File(_) = node.metadata else return #err("Directory does not support thumbnails");

    #ok({
      storageBackend = FileSystem.resolveThumbnailStorageBackend(self.fs, self.storageBackendType, node);
      encryption = FileSystem.resolveThumbnailEncryption(self.fs, node);
      contentType = args.contentType;
      size = args.size;
    });
  };

  public func commitThumbnailUpload(self : T.StableStore, caller : T.Caller, args : T.CommitThumbnailUploadArguments) : Result.Result<T.NodeDetails, Text> {
    switch (Permissions.ensureUserCanWrite(self.fs, caller, #entry(args.entry))) {
      case (#err message) return #err message;
      case (#ok _) {};
    };

    let ?node = FileSystem.get(self.fs, #entry(args.entry)) else return #err(ErrorMessages.entryNotFound(args.entry));
    let #File(_) = node.metadata else return #err("Directory does not support thumbnails");

    switch (FileSystem.resolveThumbnailStorageBackend(self.fs, self.storageBackendType, node)) {
      case (#BlobStorage) {};
      case (#OnChain) return #err("Blob Storage thumbnails are not enabled for this entry.");
    };

    switch (Thumbnail.validateEncryption(FileSystem.resolveThumbnailEncryption(self.fs, node), args.encryption)) {
      case (#ok) {};
      case (#err(message)) return #err(message);
    };

    let thumbnailRef : T.ThumbnailRef = #BlobStorage({
      rootHash = args.rootHash;
      blobId = Text.encodeUtf8(args.rootHash);
      sha256 = ?args.sha256;
      contentType = args.contentType;
      size = args.size;
      encryption = args.encryption;
    });

    FileSystem.setThumbnail(self.fs, { entry = args.entry; thumbnailRef = ?thumbnailRef })
    |> Result.mapOk(_, func(node : T.NodeStore) : T.NodeDetails = FileSystem.getDetails(self.fs, self.storageBackendType, node));
  };
};
