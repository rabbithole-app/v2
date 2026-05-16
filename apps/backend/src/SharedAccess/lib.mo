import Blob "mo:core/Blob";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";

import Vector "mo:vector";

import StorageTypes "mo:encrypted-storage/Types";

import BackendEvents "../BackendEvents/lib";

module {
  public type SharedStorageAccess = {
    storageCanisterId : Principal;
    accountOwner : Principal;
    activeAccessClasses : [StorageTypes.AccessClass];
    pendingAccessClasses : [StorageTypes.AccessClass];
    pendingGrantIds : [Nat];
    lastSource : ?StorageTypes.AccessSource;
    firstSeenAt : Time.Time;
    updatedAt : Time.Time;
    lastStorageEventId : Nat;
    lastCorrelationId : ?Text;
  };

  public type PendingEmailGrantTarget = {
    storageCanisterId : Principal;
    emailCommitment : Blob;
  };

  type PendingEmailGrant = {
    storageCanisterId : Principal;
    accountOwner : Principal;
    grantId : Nat;
    emailCommitment : Blob;
    accessClass : StorageTypes.AccessClass;
    source : StorageTypes.AccessSource;
    rabbitholePrincipal : ?Principal;
    storagePrincipal : ?Principal;
    firstSeenAt : Time.Time;
    updatedAt : Time.Time;
    lastStorageEventId : Nat;
    lastCorrelationId : ?Text;
  };

  public type Store = {
    records : Map.Map<Principal, Map.Map<Principal, SharedStorageAccess>>;
    pendingEmailGrants : Map.Map<Text, PendingEmailGrant>;
  };

  public func new() : Store {
    {
      records = Map.empty<Principal, Map.Map<Principal, SharedStorageAccess>>();
      pendingEmailGrants = Map.empty<Text, PendingEmailGrant>();
    };
  };

  public func listForPrincipal(store : Store, principal : Principal) : [SharedStorageAccess] {
    let ?records = Map.get(store.records, Principal.compare, principal) else return [];
    let result = Vector.new<SharedStorageAccess>();
    for ((_, record) in Map.entries(records)) {
      Vector.add(result, record);
    };
    Vector.toArray(result);
  };

  public func listPendingEmailGrantTargets(store : Store) : [PendingEmailGrantTarget] {
    let result = Vector.new<PendingEmailGrantTarget>();
    for ((_, grant) in Map.entries(store.pendingEmailGrants)) {
      if (grant.rabbitholePrincipal == null) {
        var exists = false;
        for (target in Vector.vals(result)) {
          if (
            Principal.equal(target.storageCanisterId, grant.storageCanisterId) and
            target.emailCommitment == grant.emailCommitment
          ) {
            exists := true;
          };
        };
        if (not exists) {
          Vector.add(result, {
            storageCanisterId = grant.storageCanisterId;
            emailCommitment = grant.emailCommitment;
          });
        };
      };
    };
    Vector.toArray(result);
  };

  public func linkEmailCommitmentToPrincipal(
    store : Store,
    principal : Principal,
    storageCanisterId : Principal,
    emailCommitment : Blob,
  ) {
    for ((_, grant) in Map.entries(store.pendingEmailGrants)) {
      if (
        Principal.equal(grant.storageCanisterId, storageCanisterId) and
        grant.emailCommitment == emailCommitment and
        grant.rabbitholePrincipal == null
      ) {
        upsertPending(store, grant, principal);
      };
    };
  };

  public func applyStorageAccessChanged(store : Store, envelope : BackendEvents.StorageAccessChanged, matchedEmailRecipients : [Principal]) {
    switch (envelope.event) {
      case (#pendingGrantCreated({ grantId; recipient; emailCommitment; accessClass; source })) {
        switch (recipient) {
          case (?principal) upsertPendingFromEnvelope(store, envelope, principal, grantId, accessClass, ?source);
          case null {};
        };
        switch (emailCommitment) {
          case (?commitment) {
            let pending = upsertPendingEmailGrant(store, envelope, grantId, commitment, accessClass, source);
            for (principal in matchedEmailRecipients.vals()) {
              upsertPending(store, pending, principal);
            };
          };
          case null {};
        };
      };
      case (#pendingGrantClaimed({ grantId; principal; accessClass; source; claimOrigin; emailClaimState = _ })) {
        switch (claimOrigin) {
          case (?(#rabbithole)) {
            updatePendingEmailGrantClaim(store, envelope, grantId, ?principal, null);
            removePendingGrantIdFromAll(store, envelope.storageCanisterId, grantId);
          };
          case (?(#storage)) {
            updatePendingEmailGrantClaim(store, envelope, grantId, null, ?principal);
            removePendingGrantIdForPrincipal(store, envelope.storageCanisterId, principal, grantId);
          };
          case null {
            Map.remove(store.pendingEmailGrants, Text.compare, pendingEmailGrantKey(envelope.storageCanisterId, grantId));
            removePendingGrantIdFromAll(store, envelope.storageCanisterId, grantId);
          };
        };
        upsert(store, envelope, principal, accessClass, ?source);
      };
      case (#pendingGrantCancelled({ grantId; recipient; emailCommitment })) {
        switch (recipient) {
          case (?principal) removePendingGrantIdForPrincipal(store, envelope.storageCanisterId, principal, grantId);
          case null {};
        };
        switch (emailCommitment) {
          case (?_) {
            Map.remove(store.pendingEmailGrants, Text.compare, pendingEmailGrantKey(envelope.storageCanisterId, grantId));
            removePendingGrantIdFromAll(store, envelope.storageCanisterId, grantId);
          };
          case null {};
        };
      };
      case (#principalGrantCreated({ principal; accessClass; source })) {
        upsert(store, envelope, principal, accessClass, ?source);
      };
      case (#principalGrantRevoked({ principal; accessClass })) {
        switch (accessClass) {
          case (?revokedClass) removeClasses(store, envelope, principal, [revokedClass]);
          // `null` means revoke all principal access grants. Recovery ownership
          // is tracked separately and is removed only by recoveryOwnerRemoved.
          case null removeClasses(store, envelope, principal, [#ordinary, #durable]);
        };
      };
      case (#recoveryOwnerAdded({ principal })) {
        upsert(store, envelope, principal, #ownerEquivalent, ?(#recoverySetup));
      };
      case (#recoveryOwnerRemoved({ principal })) {
        removeClasses(store, envelope, principal, [#ownerEquivalent]);
      };
      case _ {};
    };
  };

  func getOrCreatePrincipalRecords(store : Store, principal : Principal) : Map.Map<Principal, SharedStorageAccess> {
    switch (Map.get(store.records, Principal.compare, principal)) {
      case (?records) records;
      case null {
        let records = Map.empty<Principal, SharedStorageAccess>();
        Map.add(store.records, Principal.compare, principal, records);
        records;
      };
    };
  };

  func upsert(
    store : Store,
    envelope : BackendEvents.StorageAccessChanged,
    principal : Principal,
    accessClass : StorageTypes.AccessClass,
    source : ?StorageTypes.AccessSource,
  ) {
    let records = getOrCreatePrincipalRecords(store, principal);
    let now = Time.now();
    let next = switch (Map.get(records, Principal.compare, envelope.storageCanisterId)) {
      case (?record) {
        {
          record with
          activeAccessClasses = addClass(record.activeAccessClasses, accessClass);
          lastSource = source;
          updatedAt = now;
          lastStorageEventId = envelope.storageEventId;
          lastCorrelationId = envelope.correlationId;
        };
      };
      case null {
        {
          storageCanisterId = envelope.storageCanisterId;
          accountOwner = envelope.accountOwner;
          activeAccessClasses = [accessClass];
          pendingAccessClasses = [];
          pendingGrantIds = [];
          lastSource = source;
          firstSeenAt = now;
          updatedAt = now;
          lastStorageEventId = envelope.storageEventId;
          lastCorrelationId = envelope.correlationId;
        };
      };
    };
    Map.add(records, Principal.compare, envelope.storageCanisterId, next);
  };

  func upsertPendingEmailGrant(
    store : Store,
    envelope : BackendEvents.StorageAccessChanged,
    grantId : Nat,
    emailCommitment : Blob,
    accessClass : StorageTypes.AccessClass,
    source : StorageTypes.AccessSource,
  ) : PendingEmailGrant {
    let key = pendingEmailGrantKey(envelope.storageCanisterId, grantId);
    let now = Time.now();
    let next = switch (Map.get(store.pendingEmailGrants, Text.compare, key)) {
      case (?record) {
        {
          record with
          accessClass;
          source;
          updatedAt = now;
          lastStorageEventId = envelope.storageEventId;
          lastCorrelationId = envelope.correlationId;
        };
      };
      case null {
        {
          storageCanisterId = envelope.storageCanisterId;
          accountOwner = envelope.accountOwner;
          grantId;
          emailCommitment;
          accessClass;
          source;
          rabbitholePrincipal = null;
          storagePrincipal = null;
          firstSeenAt = now;
          updatedAt = now;
          lastStorageEventId = envelope.storageEventId;
          lastCorrelationId = envelope.correlationId;
        };
      };
    };
    Map.add(store.pendingEmailGrants, Text.compare, key, next);
    next;
  };

  func upsertPending(
    store : Store,
    pending : PendingEmailGrant,
    principal : Principal,
  ) {
    let records = getOrCreatePrincipalRecords(store, principal);
    let now = Time.now();
    let next = switch (Map.get(records, Principal.compare, pending.storageCanisterId)) {
      case (?record) {
        {
          record with
          pendingAccessClasses = addClass(record.pendingAccessClasses, pending.accessClass);
          pendingGrantIds = addNat(record.pendingGrantIds, pending.grantId);
          lastSource = ?pending.source;
          updatedAt = now;
          lastStorageEventId = pending.lastStorageEventId;
          lastCorrelationId = pending.lastCorrelationId;
        };
      };
      case null {
        {
          storageCanisterId = pending.storageCanisterId;
          accountOwner = pending.accountOwner;
          activeAccessClasses = [];
          pendingAccessClasses = [pending.accessClass];
          pendingGrantIds = [pending.grantId];
          lastSource = ?pending.source;
          firstSeenAt = now;
          updatedAt = now;
          lastStorageEventId = pending.lastStorageEventId;
          lastCorrelationId = pending.lastCorrelationId;
        };
      };
    };
    Map.add(records, Principal.compare, pending.storageCanisterId, next);
  };

  func upsertPendingFromEnvelope(
    store : Store,
    envelope : BackendEvents.StorageAccessChanged,
    principal : Principal,
    grantId : Nat,
    accessClass : StorageTypes.AccessClass,
    source : ?StorageTypes.AccessSource,
  ) {
    let pending : PendingEmailGrant = {
      storageCanisterId = envelope.storageCanisterId;
      accountOwner = envelope.accountOwner;
      grantId;
      emailCommitment = Blob.fromArray([]);
      accessClass;
      source = switch (source) { case (?value) value; case null #directGrant };
      rabbitholePrincipal = null;
      storagePrincipal = null;
      firstSeenAt = Time.now();
      updatedAt = Time.now();
      lastStorageEventId = envelope.storageEventId;
      lastCorrelationId = envelope.correlationId;
    };
    upsertPending(store, pending, principal);
  };

  func removeClasses(
    store : Store,
    envelope : BackendEvents.StorageAccessChanged,
    principal : Principal,
    classes : [StorageTypes.AccessClass],
  ) {
    let ?records = Map.get(store.records, Principal.compare, principal) else return;
    let ?record = Map.get(records, Principal.compare, envelope.storageCanisterId) else return;

    let remaining = Vector.new<StorageTypes.AccessClass>();
    for (activeClass in record.activeAccessClasses.vals()) {
      if (not containsClass(classes, activeClass)) {
        Vector.add(remaining, activeClass);
      };
    };

    if (Vector.size(remaining) == 0 and record.pendingGrantIds.size() == 0) {
      Map.remove(records, Principal.compare, envelope.storageCanisterId);
      if (Map.size(records) == 0) {
        Map.remove(store.records, Principal.compare, principal);
      };
      return;
    };

    Map.add(records, Principal.compare, envelope.storageCanisterId, {
      record with
      activeAccessClasses = Vector.toArray(remaining);
      updatedAt = Time.now();
      lastStorageEventId = envelope.storageEventId;
      lastCorrelationId = envelope.correlationId;
    });
  };

  func removePendingGrantIdForPrincipal(
    store : Store,
    storageCanisterId : Principal,
    principal : Principal,
    grantId : Nat,
  ) {
    let ?records = Map.get(store.records, Principal.compare, principal) else return;
    let ?record = Map.get(records, Principal.compare, storageCanisterId) else return;
    let remainingIds = removeNat(record.pendingGrantIds, grantId);
    if (record.activeAccessClasses.size() == 0 and remainingIds.size() == 0) {
      Map.remove(records, Principal.compare, storageCanisterId);
      if (Map.size(records) == 0) {
        Map.remove(store.records, Principal.compare, principal);
      };
      return;
    };
    Map.add(records, Principal.compare, storageCanisterId, {
      record with
      pendingGrantIds = remainingIds;
      pendingAccessClasses = if (remainingIds.size() == 0) [] else record.pendingAccessClasses;
      updatedAt = Time.now();
    });
  };

  func removePendingGrantIdFromAll(store : Store, storageCanisterId : Principal, grantId : Nat) {
    for ((principal, _) in Map.entries(store.records)) {
      removePendingGrantIdForPrincipal(store, storageCanisterId, principal, grantId);
    };
  };

  func addClass(classes : [StorageTypes.AccessClass], accessClass : StorageTypes.AccessClass) : [StorageTypes.AccessClass] {
    if (containsClass(classes, accessClass)) return classes;
    let result = Vector.fromArray<StorageTypes.AccessClass>(classes);
    Vector.add(result, accessClass);
    Vector.toArray(result);
  };

  func containsClass(classes : [StorageTypes.AccessClass], accessClass : StorageTypes.AccessClass) : Bool {
    for (existing in classes.vals()) {
      if (classEqual(existing, accessClass)) return true;
    };
    false;
  };

  func addNat(values : [Nat], value : Nat) : [Nat] {
    if (containsNat(values, value)) return values;
    let result = Vector.fromArray<Nat>(values);
    Vector.add(result, value);
    Vector.toArray(result);
  };

  func removeNat(values : [Nat], value : Nat) : [Nat] {
    let result = Vector.new<Nat>();
    for (existing in values.vals()) {
      if (existing != value) {
        Vector.add(result, existing);
      };
    };
    Vector.toArray(result);
  };

  func updatePendingEmailGrantClaim(
    store : Store,
    envelope : BackendEvents.StorageAccessChanged,
    grantId : Nat,
    rabbitholePrincipal : ?Principal,
    storagePrincipal : ?Principal,
  ) {
    let key = pendingEmailGrantKey(envelope.storageCanisterId, grantId);
    let ?record = Map.get(store.pendingEmailGrants, Text.compare, key) else return;
    Map.add(store.pendingEmailGrants, Text.compare, key, {
      record with
      rabbitholePrincipal = switch (rabbitholePrincipal) {
        case (?principal) ?principal;
        case null record.rabbitholePrincipal;
      };
      storagePrincipal = switch (storagePrincipal) {
        case (?principal) ?principal;
        case null record.storagePrincipal;
      };
      updatedAt = Time.now();
      lastStorageEventId = envelope.storageEventId;
      lastCorrelationId = envelope.correlationId;
    });
  };

  func containsNat(values : [Nat], value : Nat) : Bool {
    for (existing in values.vals()) {
      if (existing == value) return true;
    };
    false;
  };

  func pendingEmailGrantKey(storageCanisterId : Principal, grantId : Nat) : Text {
    Principal.toText(storageCanisterId) # ":" # Nat.toText(grantId);
  };

  func classEqual(a : StorageTypes.AccessClass, b : StorageTypes.AccessClass) : Bool {
    switch (a, b) {
      case (#ownerEquivalent, #ownerEquivalent) true;
      case (#ordinary, #ordinary) true;
      case (#durable, #durable) true;
      case _ false;
    };
  };
};
