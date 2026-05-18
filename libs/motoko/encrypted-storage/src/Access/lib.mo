import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import Map "mo:map/Map";
import Vector "mo:vector";

import Types "Types";

module Access {
  let { nhash; phash } = Map;

  public type Store = Types.Store;
  public type OwnerEquivalentPrincipal = Types.OwnerEquivalentPrincipal;
  public type AddRecoveryOwnerOptions = Types.AddRecoveryOwnerOptions;
  public type RecoveryStatus = Types.RecoveryStatus;
  public type RegisterRecoveryControllerResult = Types.RegisterRecoveryControllerResult;
  public type CreatePendingAccessGrantArguments = Types.CreatePendingAccessGrantArguments;
  public type ClaimPendingAccessGrantArguments = Types.ClaimPendingAccessGrantArguments;
  public type ClaimPendingAccessByVerifiedAttributesArguments = Types.ClaimPendingAccessByVerifiedAttributesArguments;
  public type CancelPendingAccessGrantArguments = Types.CancelPendingAccessGrantArguments;
  public type CreateDurableAccessGrantArguments = Types.CreateDurableAccessGrantArguments;
  public type CreateDurableAccessPolicyArguments = Types.CreateDurableAccessPolicyArguments;
  public type CancelDurableAccessPolicyArguments = Types.CancelDurableAccessPolicyArguments;
  public type ReleaseDurableAccessPolicyArguments = Types.ReleaseDurableAccessPolicyArguments;
  public type CreateAccessRequestArguments = Types.CreateAccessRequestArguments;
  public type CancelAccessRequestArguments = Types.CancelAccessRequestArguments;
  public type ResolveAccessRequestArguments = Types.ResolveAccessRequestArguments;

  public func emptyEmailClaimState() : Types.EmailClaimState = {
    rabbithole = null;
    storage = null;
  };

  public func new(accountOwner : Principal) : Store {
    let now = Time.now();
    let ownerEquivalentPrincipals = Map.new<Principal, OwnerEquivalentPrincipal>();
    ignore Map.add(
      ownerEquivalentPrincipals,
      phash,
      accountOwner,
      {
        principal = accountOwner;
        kind = #accountOwner;
        addedAt = now;
        addedBy = accountOwner;
        revokedAt = null;
        controllerRecoveryEnabled = false;
        rootPermissionBeforeRecovery = null;
      },
    );
    let ownerActivityRecords = Map.new<Principal, Types.OwnerActivityRecord>();
    ignore Map.add(
      ownerActivityRecords,
      phash,
      accountOwner,
      {
        principal = accountOwner;
        role = #accountOwner;
        origin = #backend;
        lastSeenAt = now;
      },
    );
    {
      var nextGrantId = 0;
      var nextAccessRequestId = 0;
      var nextDurablePolicyId = 0;
      principalGrants = Map.new<Nat, Types.PrincipalAccessGrant>();
      pendingGrants = Map.new<Nat, Types.PendingAccessGrant>();
      accessRequests = Map.new<Nat, Types.AccessRequest>();
      durablePolicies = Map.new<Nat, Types.DurableAccessPolicy>();
      ownerActivityRecords;
      ownerEquivalentPrincipals;
      var recoveryController = null;
      var lastOwnerActivityAt = now;
      var lastOwnerActivityBy = accountOwner;
    };
  };

  func ownerActivityRole(store : Store, principal : Principal) : ?Types.OwnerActivityRole {
    switch (Map.get(store.ownerEquivalentPrincipals, phash, principal)) {
      case (?record) {
        if (record.revokedAt != null) {
          null;
        } else {
          switch (record.kind) {
            case (#accountOwner) ?#accountOwner;
            case (#recoveryOwner) ?#recoveryOwner;
          };
        };
      };
      case null null;
    };
  };

  public func recordOwnerActivity(store : Store, caller : Principal, origin : Types.OwnerActivityOrigin) : Result.Result<Types.OwnerActivityRecord, Text> {
    let ?role = ownerActivityRole(store, caller) else return #err("caller is not owner-equivalent");
    let record : Types.OwnerActivityRecord = {
      principal = caller;
      role;
      origin;
      lastSeenAt = Time.now();
    };
    ignore Map.put(store.ownerActivityRecords, phash, caller, record);
    store.lastOwnerActivityAt := record.lastSeenAt;
    store.lastOwnerActivityBy := caller;
    #ok(record);
  };

  public func getOwnerActivityState(store : Store, caller : Principal) : Result.Result<Types.OwnerActivityState, Text> {
    if (not isOwnerEquivalent(store, caller)) {
      return #err("caller is not owner-equivalent");
    };
    #ok({
      lastOwnerActivityAt = store.lastOwnerActivityAt;
      lastOwnerActivityBy = store.lastOwnerActivityBy;
      records = Iter.toArray(Map.vals(store.ownerActivityRecords));
    });
  };

  public func isOwnerEquivalent(store : Store, principal : Principal) : Bool {
    switch (Map.get(store.ownerEquivalentPrincipals, phash, principal)) {
      case (?record) record.revokedAt == null;
      case null false;
    };
  };

  public func listOwnerEquivalentPrincipals(store : Store) : [OwnerEquivalentPrincipal] {
    Map.vals(store.ownerEquivalentPrincipals)
    |> Iter.filter<OwnerEquivalentPrincipal>(_, func(record) = record.revokedAt == null)
    |> Iter.toArray(_);
  };

  public func getActiveRecoveryOwner(store : Store) : ?OwnerEquivalentPrincipal {
    for (record in Map.vals(store.ownerEquivalentPrincipals)) {
      switch (record.kind, record.revokedAt) {
        case (#recoveryOwner, null) return ?record;
        case _ {};
      };
    };
    null;
  };

  public func getRecoveryStatus(store : Store) : RecoveryStatus {
    {
      recoveryController = store.recoveryController;
      recoveryOwner = getActiveRecoveryOwner(store);
    };
  };

  public func registerRecoveryController(
    store : Store,
    caller : Principal,
    principal : Principal,
  ) : Result.Result<RegisterRecoveryControllerResult, Text> {
    if (Principal.isAnonymous(principal)) {
      return #err("anonymous principal cannot be a recovery controller");
    };
    if (not isOwnerEquivalent(store, caller)) {
      return #err("caller is not owner-equivalent");
    };
    switch (Map.get(store.ownerEquivalentPrincipals, phash, principal)) {
      case (?record) {
        if (record.kind == #accountOwner and record.revokedAt == null) {
          return #err("account owner cannot be registered as recovery controller");
        };
      };
      case null {};
    };
    let previous = store.recoveryController;
    store.recoveryController := ?principal;
    #ok({ principal; previous });
  };

  public func clearRecoveryController(store : Store, caller : Principal) : Result.Result<Principal, Text> {
    if (not isOwnerEquivalent(store, caller)) {
      return #err("caller is not owner-equivalent");
    };
    let ?principal = store.recoveryController else return #err("recovery controller is not registered");
    store.recoveryController := null;
    #ok(principal);
  };

  public func addRecoveryOwner(
    store : Store,
    caller : Principal,
    principal : Principal,
    options : Types.AddRecoveryOwnerRequest,
  ) : Result.Result<OwnerEquivalentPrincipal, Text> {
    #err("recovery ownership can only be taken by a current controller");
  };

  public func takeRecoveryOwnership(
    store : Store,
    caller : Principal,
    rootPermissionBeforeRecovery : ?Types.Permission,
  ) : Result.Result<Types.TakeRecoveryOwnershipResult, Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("anonymous principal cannot be a recovery owner");
    };

    switch (Map.get(store.ownerEquivalentPrincipals, phash, caller)) {
      case (?existing) {
        switch (existing.kind, existing.revokedAt) {
          case (#accountOwner, _) return #err("account owner is already owner-equivalent");
          case (#recoveryOwner, null) return #ok({ current = existing; previous = null });
          case (#recoveryOwner, ?_) {};
        };
      };
      case null {};
    };

    switch (store.recoveryController) {
      case (?principal) {
        if (principal != caller) {
          return #err("caller is not the registered recovery controller");
        };
      };
      case null {};
    };

    activateRecoveryOwner(store, caller, caller, rootPermissionBeforeRecovery);
  };

  public func activateRecoveryOwnership(
    store : Store,
    caller : Principal,
    principal : Principal,
    rootPermissionBeforeRecovery : ?Types.Permission,
  ) : Result.Result<Types.TakeRecoveryOwnershipResult, Text> {
    if (Principal.isAnonymous(principal)) {
      return #err("anonymous principal cannot be a recovery owner");
    };
    if (not isOwnerEquivalent(store, caller)) {
      return #err("caller is not owner-equivalent");
    };
    switch (store.recoveryController) {
      case (?registered) {
        if (registered != principal) {
          return #err("principal is not the registered recovery controller");
        };
      };
      case null return #err("recovery controller is not registered");
    };
    switch (Map.get(store.ownerEquivalentPrincipals, phash, principal)) {
      case (?existing) {
        switch (existing.kind, existing.revokedAt) {
          case (#accountOwner, _) return #err("account owner is already owner-equivalent");
          case (#recoveryOwner, null) return #ok({ current = existing; previous = null });
          case (#recoveryOwner, ?_) {};
        };
      };
      case null {};
    };
    activateRecoveryOwner(store, caller, principal, rootPermissionBeforeRecovery);
  };

  func activateRecoveryOwner(
    store : Store,
    addedBy : Principal,
    principal : Principal,
    rootPermissionBeforeRecovery : ?Types.Permission,
  ) : Result.Result<Types.TakeRecoveryOwnershipResult, Text> {
    let previous = getActiveRecoveryOwner(store);
    switch (previous) {
      case (?record) {
        if (record.principal != principal) {
          ignore Map.put(store.ownerEquivalentPrincipals, phash, record.principal, { record with revokedAt = ?Time.now() });
        };
      };
      case null {};
    };

    let record : OwnerEquivalentPrincipal = {
      principal;
      kind = #recoveryOwner;
      addedAt = Time.now();
      addedBy;
      revokedAt = null;
      controllerRecoveryEnabled = true;
      rootPermissionBeforeRecovery;
    };
    ignore Map.put(store.ownerEquivalentPrincipals, phash, principal, record);
    #ok({ current = record; previous });
  };

  public func removeRecoveryOwner(store : Store, caller : Principal, principal : Principal) : Result.Result<OwnerEquivalentPrincipal, Text> {
    if (not isOwnerEquivalent(store, caller)) {
      return #err("caller is not owner-equivalent");
    };

    switch (Map.get(store.ownerEquivalentPrincipals, phash, principal)) {
      case (?record) {
        switch (record.kind) {
          case (#accountOwner) return #err("account owner cannot be removed");
          case (#recoveryOwner) {
            switch (record.revokedAt) {
              case (?_) return #err("recovery owner already removed");
              case null {};
            };
            let revoked = { record with revokedAt = ?Time.now() };
            ignore Map.put(store.ownerEquivalentPrincipals, phash, principal, revoked);
            switch (store.recoveryController) {
              case (?registered) if (registered == principal) store.recoveryController := null;
              case _ {};
            };
            #ok(revoked);
          };
        };
      };
      case null #err("recovery owner not found");
    };
  };

  func nextId(store : Store) : Nat {
    let id = store.nextGrantId;
    store.nextGrantId += 1;
    id;
  };

  func nextAccessRequestId(store : Store) : Nat {
    let id = store.nextAccessRequestId;
    store.nextAccessRequestId += 1;
    id;
  };

  public func nextDurablePolicyId(store : Store) : Nat {
    let id = store.nextDurablePolicyId;
    store.nextDurablePolicyId += 1;
    id;
  };

  public func putDurablePolicy(store : Store, policy : Types.DurableAccessPolicy) {
    ignore Map.put(store.durablePolicies, nhash, policy.id, policy);
  };

  public func getDurablePolicy(store : Store, policyId : Nat) : ?Types.DurableAccessPolicy {
    Map.get(store.durablePolicies, nhash, policyId);
  };

  public func listDurablePolicies(store : Store) : [Types.DurableAccessPolicy] {
    Iter.toArray(Map.vals(store.durablePolicies));
  };

  func scopeEqual(a : Types.AccessScope, b : Types.AccessScope) : Bool {
    switch (a, b) {
      case (#root, #root) true;
      case (#entry(aEntry), #entry(bEntry)) aEntry == bEntry;
      case (#keyId(aKeyId), #keyId(bKeyId)) aKeyId == bKeyId;
      case _ false;
    };
  };

  func emailCommitmentOfRef(ref : Types.AccessRef) : ?Types.EmailCommitment {
    switch (ref) {
      case (#email({ emailCommitment })) ?emailCommitment;
      case (#emailCommitment(commitment)) ?commitment;
      case (#principal(_)) null;
    };
  };

  func refEqual(a : Types.AccessRef, b : Types.AccessRef) : Bool {
    switch (a, b) {
      case (#principal(aPrincipal), #principal(bPrincipal)) aPrincipal == bPrincipal;
      case _ emailCommitmentOfRef(a) == emailCommitmentOfRef(b);
    };
  };

  func pendingGrantIsActive(grant : Types.PendingAccessGrant) : Bool {
    if (grant.cancelledAt != null) return false;
    switch (grant.ref) {
      case (#principal(_)) if (grant.claimedAt != null) return false;
      case _ {};
    };
    switch (grant.expiresAt) {
      case (?expiresAt) Time.now() <= expiresAt;
      case null true;
    };
  };

  func hasNewerActivePrincipalGrant(store : Store, candidate : Types.PrincipalAccessGrant) : Bool {
    for (grant in Map.vals(store.principalGrants)) {
      if (
        grant.id > candidate.id and
        grant.revokedAt == null and
        grant.principal == candidate.principal and
        grant.accessClass == candidate.accessClass and
        scopeEqual(grant.scope, candidate.scope)
      ) {
        return true;
      };
    };
    false;
  };

  func hasNewerActivePendingGrant(store : Store, candidate : Types.PendingAccessGrant) : Bool {
    for (grant in Map.vals(store.pendingGrants)) {
      if (
        grant.id > candidate.id and
        pendingGrantIsActive(grant) and
        refEqual(grant.ref, candidate.ref) and
        grant.accessClass == candidate.accessClass and
        scopeEqual(grant.scope, candidate.scope)
      ) {
        return true;
      };
    };
    false;
  };

  func hasActivePrincipalAccessGrant(store : Store, principal : Principal) : Bool {
    for (grant in Map.vals(store.principalGrants)) {
      if (grant.principal == principal and grant.revokedAt == null) {
        return true;
      };
    };
    false;
  };

  func getPendingAccessRequestByRequester(store : Store, requester : Principal) : ?Types.AccessRequest {
    for (request in Map.vals(store.accessRequests)) {
      if (request.requester == requester and request.status == #pending) {
        return ?request;
      };
    };
    null;
  };

  public func getLatestAccessRequestByRequester(store : Store, requester : Principal) : ?Types.AccessRequest {
    var latest : ?Types.AccessRequest = null;
    for (request in Map.vals(store.accessRequests)) {
      if (request.requester == requester) {
        switch (latest) {
          case (?current) {
            if (request.id > current.id) {
              latest := ?request;
            };
          };
          case null {
            latest := ?request;
          };
        };
      };
    };
    latest;
  };

  public func getPrincipalAccessGrant(store : Store, grantId : Nat) : ?Types.PrincipalAccessGrant {
    Map.get(store.principalGrants, nhash, grantId);
  };

  public func getEmailClaimForOrigin(grant : Types.PendingAccessGrant, origin : Types.EmailClaimOrigin) : ?Types.EmailClaim {
    switch (origin) {
      case (#rabbithole) grant.emailClaimState.rabbithole;
      case (#storage) grant.emailClaimState.storage;
    };
  };

  func putEmailClaimForOrigin(state : Types.EmailClaimState, origin : Types.EmailClaimOrigin, claim : Types.EmailClaim) : Types.EmailClaimState {
    switch (origin) {
      case (#rabbithole) ({ state with rabbithole = ?claim });
      case (#storage) ({ state with storage = ?claim });
    };
  };

  func replaceActivePrincipalAccessGrants(
    store : Store,
    principal : Principal,
    scope : Types.AccessScope,
    accessClass : Types.AccessClass,
  ) : [Types.PrincipalAccessGrant] {
    let revoked = Vector.new<Types.PrincipalAccessGrant>();
    for ((id, grant) in Map.entries(store.principalGrants)) {
      if (
        grant.revokedAt == null and
        grant.principal == principal and
        grant.accessClass == accessClass and
        scopeEqual(grant.scope, scope)
      ) {
        let next = { grant with revokedAt = ?Time.now() };
        ignore Map.remove(store.principalGrants, nhash, id);
        Vector.add(revoked, next);
      };
    };
    Vector.toArray(revoked);
  };

  public func getActivePendingAccessGrantsToReplace(
    store : Store,
    ref : Types.AccessRef,
    scope : Types.AccessScope,
    accessClass : Types.AccessClass,
  ) : [Types.PendingAccessGrant] {
    let matches = Vector.new<Types.PendingAccessGrant>();
    for (grant in Map.vals(store.pendingGrants)) {
      if (
        pendingGrantIsActive(grant) and
        refEqual(grant.ref, ref) and
        grant.accessClass == accessClass and
        scopeEqual(grant.scope, scope)
      ) {
        Vector.add(matches, grant);
      };
    };
    Vector.toArray(matches);
  };

  func replaceActivePendingAccessGrants(
    store : Store,
    ref : Types.AccessRef,
    scope : Types.AccessScope,
    accessClass : Types.AccessClass,
  ) : [Types.PendingAccessGrant] {
    let cancelled = Vector.new<Types.PendingAccessGrant>();
    for ((id, grant) in Map.entries(store.pendingGrants)) {
      if (
        pendingGrantIsActive(grant) and
        refEqual(grant.ref, ref) and
        grant.accessClass == accessClass and
        scopeEqual(grant.scope, scope)
      ) {
        let next = { grant with cancelledAt = ?Time.now() };
        ignore Map.remove(store.pendingGrants, nhash, id);
        Vector.add(cancelled, next);
      };
    };
    Vector.toArray(cancelled);
  };

  public func getPendingAccessGrant(store : Store, grantId : Nat) : ?Types.PendingAccessGrant {
    Map.get(store.pendingGrants, nhash, grantId);
  };

  public func getClaimedPrincipalAccessGrantsForPending(store : Store, pending : Types.PendingAccessGrant) : [Types.PrincipalAccessGrant] {
    let grants = Vector.new<Types.PrincipalAccessGrant>();
    let claims = [pending.emailClaimState.rabbithole, pending.emailClaimState.storage];
    for (claim in claims.vals()) {
      switch (claim) {
        case (?value) {
          switch (Map.get(store.principalGrants, nhash, value.principalGrantId)) {
            case (?grant) if (grant.revokedAt == null) Vector.add(grants, grant);
            case _ {};
          };
        };
        case null {};
      };
    };
    Vector.toArray(grants);
  };

  public func validatePrincipalAccessGrant(
    principal : Principal,
    accessClass : Types.AccessClass,
    source : Types.AccessSource,
  ) : Result.Result<(), Text> {
    if (Principal.isAnonymous(principal)) {
      switch (accessClass, source) {
        case (#ordinary, #directGrant) {};
        case _ return #err("anonymous principal cannot receive this access grant");
      };
    };
    #ok;
  };

  public func createPrincipalAccessGrant(
    store : Store,
    caller : Principal,
    principal : Principal,
    accessClass : Types.AccessClass,
    scope : Types.AccessScope,
    permission : Types.Permission,
    source : Types.AccessSource,
  ) : Result.Result<Types.CreatePrincipalAccessGrantResult, Text> {
    switch (validatePrincipalAccessGrant(principal, accessClass, source)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    let revoked = replaceActivePrincipalAccessGrants(store, principal, scope, accessClass);
    let grant : Types.PrincipalAccessGrant = {
      id = nextId(store);
      principal;
      accessClass;
      scope;
      permission;
      source;
      createdAt = Time.now();
      createdBy = caller;
      revokedAt = null;
    };
    ignore Map.put(store.principalGrants, nhash, grant.id, grant);
    #ok({ grant; revoked });
  };

  public func revokePrincipalAccessGrants(
    store : Store,
    principal : Principal,
    scope : Types.AccessScope,
    accessClass : ?Types.AccessClass,
  ) {
    for ((id, grant) in Map.entries(store.principalGrants)) {
      let classMatches = switch (accessClass) {
        case (?expected) grant.accessClass == expected;
        case null true;
      };
      if (grant.principal == principal and classMatches and scopeEqual(grant.scope, scope) and grant.revokedAt == null) {
        ignore Map.remove(store.principalGrants, nhash, id);
      };
    };
  };

  public func createPendingAccessGrant(
    store : Store,
    caller : Principal,
    args : CreatePendingAccessGrantArguments,
  ) : Result.Result<Types.CreatePendingAccessGrantResult, Text> {
    switch (args.accessClass) {
      case (#ownerEquivalent) return #err("owner-equivalent access cannot be pending");
      case (#ordinary) {};
      case (#durable) {};
    };
    let cancelled = replaceActivePendingAccessGrants(store, args.ref, args.scope, args.accessClass);
    let grant : Types.PendingAccessGrant = {
      id = nextId(store);
      ref = args.ref;
      accessClass = args.accessClass;
      scope = args.scope;
      permission = args.permission;
      source = args.source;
      createdAt = Time.now();
      createdBy = caller;
      expiresAt = args.expiresAt;
      claimedBy = null;
      claimedAt = null;
      emailClaimState = emptyEmailClaimState();
      cancelledAt = null;
    };
    ignore Map.put(store.pendingGrants, nhash, grant.id, grant);
    #ok({ grant; cancelled; revokedPrincipalGrants = [] });
  };

  public func revokePrincipalAccessGrantById(store : Store, grantId : Nat) : ?Types.PrincipalAccessGrant {
    switch (Map.get(store.principalGrants, nhash, grantId)) {
      case (?grant) {
        if (grant.revokedAt != null) {
          return null;
        };
        ignore Map.remove(store.principalGrants, nhash, grantId);
        ?{ grant with revokedAt = ?Time.now() };
      };
      case null null;
    };
  };

  public func revokeClaimedPrincipalAccessGrantsForPending(store : Store, pending : Types.PendingAccessGrant) : [Types.PrincipalAccessGrant] {
    let revoked = Vector.new<Types.PrincipalAccessGrant>();
    for (grant in getClaimedPrincipalAccessGrantsForPending(store, pending).vals()) {
      switch (revokePrincipalAccessGrantById(store, grant.id)) {
        case (?value) Vector.add(revoked, value);
        case null {};
      };
    };
    Vector.toArray(revoked);
  };

  public func getClaimablePendingAccessGrant(
    store : Store,
    caller : Principal,
    args : ClaimPendingAccessGrantArguments,
  ) : Result.Result<Types.PendingAccessGrant, Text> {
    let ?grant = Map.get(store.pendingGrants, nhash, args.grantId) else return #err("pending access grant not found");
    if (grant.cancelledAt != null or grant.claimedAt != null) {
      return #err("pending access grant is not active");
    };
    switch (grant.expiresAt) {
      case (?expiresAt) if (Time.now() > expiresAt) return #err("pending access grant expired");
      case _ {};
    };
    switch (grant.ref) {
      case (#principal(principal)) {
        if (principal != caller) {
          return #err("pending access grant belongs to another principal");
        };
      };
      case (#email(_) or #emailCommitment(_)) {
        return #err("email claim requires verified attributes");
      };
    };
    #ok(grant);
  };

  public func getClaimablePendingAccessGrantsByVerifiedAttributes(
    store : Store,
    principal : Principal,
    args : ClaimPendingAccessByVerifiedAttributesArguments,
    origin : Types.EmailClaimOrigin,
  ) : [Types.PendingAccessGrant] {
    Map.vals(store.pendingGrants)
    |> Iter.filter<Types.PendingAccessGrant>(
      _,
      func(grant) {
        if (grant.cancelledAt != null) {
          false;
        } else {
          let isExpired = switch (grant.expiresAt) {
            case (?expiresAt) Time.now() > expiresAt;
            case null false;
          };
          if (isExpired) {
            false;
          } else {
            switch (grant.ref) {
              case (#email({ emailCommitment = commitment }) or #emailCommitment(commitment)) {
                switch (getEmailClaimForOrigin(grant, origin)) {
                  case (?claim) {
                    if (claim.principal != principal) {
                      false;
                    } else {
                      var matches = false;
                      for (candidate in args.emailCommitments.vals()) {
                        if (candidate == commitment) {
                          matches := true;
                        };
                      };
                      matches;
                    };
                  };
                  case null {
                    var matches = false;
                    for (candidate in args.emailCommitments.vals()) {
                      if (candidate == commitment) {
                        matches := true;
                      };
                    };
                    matches;
                  };
                };
              };
              case (#principal(_)) false;
            };
          };
        };
      },
    )
    |> Iter.toArray(_);
  };

  public func markPendingAccessGrantClaimed(
    store : Store,
    caller : Principal,
    grant : Types.PendingAccessGrant,
  ) : Types.PendingAccessGrant {
    let claimed = { grant with claimedBy = ?caller; claimedAt = ?Time.now() };
    ignore Map.remove(store.pendingGrants, nhash, grant.id);
    claimed;
  };

  public func markPendingAccessGrantEmailClaimed(
    store : Store,
    principal : Principal,
    principalGrantId : Nat,
    origin : Types.EmailClaimOrigin,
    grant : Types.PendingAccessGrant,
  ) : Result.Result<Types.PendingAccessGrant, Text> {
    switch (getEmailClaimForOrigin(grant, origin)) {
      case (?claim) {
        if (claim.principal != principal) {
          return #err("pending access grant origin already claimed");
        };
        #ok(grant);
      };
      case null {
        let claim : Types.EmailClaim = {
          principal;
          origin;
          claimedAt = Time.now();
          principalGrantId;
        };
        let next = {
          grant with
          emailClaimState = putEmailClaimForOrigin(grant.emailClaimState, origin, claim);
        };
        ignore Map.put(store.pendingGrants, nhash, grant.id, next);
        #ok(next);
      };
    };
  };

  public func cancelPendingAccessGrant(
    store : Store,
    caller : Principal,
    args : CancelPendingAccessGrantArguments,
  ) : Result.Result<Types.CancelPendingAccessGrantResult, Text> {
    let ?grant = Map.get(store.pendingGrants, nhash, args.grantId) else return #err("pending access grant not found");
    switch (validatePendingAccessGrantCancellation(store, caller, grant)) {
      case (#err(message)) return #err(message);
      case (#ok) {};
    };
    let cancelled = { grant with cancelledAt = ?Time.now() };
    ignore Map.remove(store.pendingGrants, nhash, grant.id);
    #ok({
      grant = cancelled;
      revokedPrincipalGrants = revokeClaimedPrincipalAccessGrantsForPending(store, grant);
    });
  };

  public func validatePendingAccessGrantCancellation(store : Store, caller : Principal, grant : Types.PendingAccessGrant) : Result.Result<(), Text> {
    if (grant.createdBy != caller and not isOwnerEquivalent(store, caller)) {
      return #err("caller cannot cancel this pending access grant");
    };
    if (grant.claimedAt != null) {
      return #err("pending access grant already claimed");
    };
    #ok;
  };

  public func listPendingAccessGrants(store : Store) : [Types.PendingAccessGrant] {
    Map.vals(store.pendingGrants)
    |> Iter.filter<Types.PendingAccessGrant>(_, func(grant) = pendingGrantIsActive(grant) and not hasNewerActivePendingGrant(store, grant))
    |> Iter.toArray(_);
  };

  public func listPrincipalAccessGrants(store : Store) : [Types.PrincipalAccessGrant] {
    Map.vals(store.principalGrants)
    |> Iter.filter<Types.PrincipalAccessGrant>(_, func(grant) = grant.revokedAt == null and not hasNewerActivePrincipalGrant(store, grant))
    |> Iter.toArray(_);
  };

  public func hasActiveDurableGrantForKey(store : Store, principal : Principal, keyId : Types.KeyId) : Bool {
    for (grant in Map.vals(store.principalGrants)) {
      if (grant.principal == principal and grant.accessClass == #durable and grant.revokedAt == null) {
        switch (grant.scope) {
          case (#root) return true;
          case (#keyId(grantKeyId)) if (grantKeyId == keyId) return true;
          case _ {};
        };
      };
    };
    false;
  };

  public func createAccessRequest(
    store : Store,
    requester : Principal,
    args : CreateAccessRequestArguments,
  ) : Result.Result<(Types.AccessRequest, Bool), Text> {
    if (Principal.isAnonymous(requester)) {
      return #err("anonymous principal cannot request access");
    };
    if (isOwnerEquivalent(store, requester) or hasActivePrincipalAccessGrant(store, requester)) {
      return #err("caller already has access");
    };
    switch (getPendingAccessRequestByRequester(store, requester)) {
      case (?request) return #ok(request, false);
      case null {};
    };
    let request : Types.AccessRequest = {
      id = nextAccessRequestId(store);
      requester;
      emailCommitment = args.emailCommitment;
      message = args.message;
      status = #pending;
      createdAt = Time.now();
      decidedAt = null;
      decidedBy = null;
    };
    ignore Map.put(store.accessRequests, nhash, request.id, request);
    #ok(request, true);
  };

  public func cancelAccessRequest(
    store : Store,
    caller : Principal,
    args : CancelAccessRequestArguments,
  ) : Result.Result<Types.AccessRequest, Text> {
    let ?request = Map.get(store.accessRequests, nhash, args.requestId) else return #err("access request not found");
    if (request.requester != caller and not isOwnerEquivalent(store, caller)) {
      return #err("caller cannot cancel this access request");
    };
    if (request.status != #pending) {
      return #err("access request is not pending");
    };
    let cancelled = { request with status = #cancelled; decidedAt = ?Time.now(); decidedBy = ?caller };
    ignore Map.put(store.accessRequests, nhash, request.id, cancelled);
    #ok(cancelled);
  };

  public func getPendingAccessRequest(store : Store, requestId : Nat) : Result.Result<Types.AccessRequest, Text> {
    let ?request = Map.get(store.accessRequests, nhash, requestId) else return #err("access request not found");
    if (request.status != #pending) {
      return #err("access request is not pending");
    };
    #ok(request);
  };

  public func resolveAccessRequest(
    store : Store,
    caller : Principal,
    args : ResolveAccessRequestArguments,
  ) : Result.Result<Types.AccessRequest, Text> {
    let ?request = Map.get(store.accessRequests, nhash, args.requestId) else return #err("access request not found");
    if (request.status != #pending) {
      return #err("access request is not pending");
    };
    let status : Types.AccessRequestStatus = switch (args.decision) {
      case (#approved(_)) #approved;
      case (#rejected) #rejected;
    };
    let resolved = { request with status; decidedAt = ?Time.now(); decidedBy = ?caller };
    ignore Map.put(store.accessRequests, nhash, request.id, resolved);
    #ok(resolved);
  };

  public func listAccessRequests(store : Store) : [Types.AccessRequest] {
    Map.vals(store.accessRequests) |> Iter.toArray(_);
  };
};
