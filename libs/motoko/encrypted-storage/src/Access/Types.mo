import Time "mo:core/Time";
import Principal "mo:core/Principal";

import VetKeys "mo:ic-vetkeys";
import Map "mo:map/Map";

module {
  public type EmailCommitment = Blob;
  public type Permission = VetKeys.AccessRights;

  public type AccessRef = {
    #principal : Principal;
    #email : {
      email : Text;
      emailCommitment : EmailCommitment;
    };
    #emailCommitment : EmailCommitment;
  };

  public type AccessClass = {
    #ownerEquivalent;
    #ordinary;
    #durable;
  };

  public type AccessSource = {
    #directGrant;
    #ordinaryInvite : Nat;
    #accessRequest : Nat;
    #durablePolicy : Nat;
    #recoverySetup;
  };

  public type Entry = ({ #File; #Directory }, Text);
  public type KeyId = (Principal, Blob);

  public type AccessScope = {
    #root;
    #entry : Entry;
    #keyId : KeyId;
  };

  public type OwnerEquivalentPrincipal = {
    principal : Principal;
    kind : { #accountOwner; #recoveryOwner };
    addedAt : Time.Time;
    addedBy : Principal;
    revokedAt : ?Time.Time;
    controllerRecoveryEnabled : Bool;
    rootPermissionBeforeRecovery : ?Permission;
  };

  public type PrincipalAccessGrant = {
    id : Nat;
    principal : Principal;
    accessClass : AccessClass;
    scope : AccessScope;
    permission : Permission;
    source : AccessSource;
    createdAt : Time.Time;
    createdBy : Principal;
    revokedAt : ?Time.Time;
  };

  public type EmailClaimOrigin = {
    #rabbithole;
    #storage;
  };

  public type EmailClaim = {
    principal : Principal;
    origin : EmailClaimOrigin;
    claimedAt : Time.Time;
    principalGrantId : Nat;
  };

  public type EmailClaimState = {
    rabbithole : ?EmailClaim;
    storage : ?EmailClaim;
  };

  public type PendingAccessGrant = {
    id : Nat;
    ref : AccessRef;
    accessClass : AccessClass;
    scope : AccessScope;
    permission : Permission;
    source : AccessSource;
    createdAt : Time.Time;
    createdBy : Principal;
    expiresAt : ?Time.Time;
    claimedBy : ?Principal;
    claimedAt : ?Time.Time;
    emailClaimState : EmailClaimState;
    cancelledAt : ?Time.Time;
  };

  public type AccessRequestStatus = {
    #pending;
    #approved;
    #rejected;
    #cancelled;
  };

  public type AccessRequestDecision = {
    #approved : {
      scope : AccessScope;
      permission : Permission;
    };
    #rejected;
  };

  public type AccessRequest = {
    id : Nat;
    requester : Principal;
    emailCommitment : ?EmailCommitment;
    message : ?Text;
    status : AccessRequestStatus;
    createdAt : Time.Time;
    decidedAt : ?Time.Time;
    decidedBy : ?Principal;
  };

  public type StorageAccessEvent = {
    #pendingGrantCreated : { grantId : Nat; ref : AccessRef; accessClass : AccessClass; source : AccessSource };
    #pendingGrantClaimed : {
      grantId : Nat;
      principal : Principal;
      accessClass : AccessClass;
      source : AccessSource;
      claimOrigin : ?EmailClaimOrigin;
      emailClaimState : ?EmailClaimState;
    };
    #pendingGrantCancelled : { grantId : Nat; ref : AccessRef };
    #principalGrantCreated : { grantId : ?Nat; principal : Principal; accessClass : AccessClass; source : AccessSource };
    #principalGrantRevoked : { principal : Principal; accessClass : ?AccessClass };
    #recoveryControllerRegistered : { principal : Principal; previous : ?Principal };
    #recoveryControllerCleared : { principal : Principal };
    #recoveryOwnerAdded : { principal : Principal };
    #recoveryOwnerRemoved : { principal : Principal };
    #accessRequestCreated : { requestId : Nat; requester : Principal };
    #accessRequestResolved : { requestId : Nat; requester : Principal; status : AccessRequestStatus };
    #accessRequestCancelled : { requestId : Nat; requester : Principal };
  };

  public type Store = {
    var nextGrantId : Nat;
    var nextAccessRequestId : Nat;
    principalGrants : Map.Map<Nat, PrincipalAccessGrant>;
    pendingGrants : Map.Map<Nat, PendingAccessGrant>;
    accessRequests : Map.Map<Nat, AccessRequest>;
    ownerEquivalentPrincipals : Map.Map<Principal, OwnerEquivalentPrincipal>;
    var recoveryController : ?Principal;
  };

  public type AddRecoveryOwnerOptions = {
    controllerRecovery : Bool;
  };

  public type AddRecoveryOwnerRequest = AddRecoveryOwnerOptions and {
    rootPermissionBeforeRecovery : ?Permission;
  };

  public type TakeRecoveryOwnershipResult = {
    current : OwnerEquivalentPrincipal;
    previous : ?OwnerEquivalentPrincipal;
  };

  public type RecoveryStatus = {
    recoveryController : ?Principal;
    recoveryOwner : ?OwnerEquivalentPrincipal;
  };

  public type RegisterRecoveryControllerResult = {
    principal : Principal;
    previous : ?Principal;
  };

  public type CreatePendingAccessGrantArguments = {
    ref : AccessRef;
    accessClass : AccessClass;
    scope : AccessScope;
    permission : Permission;
    source : AccessSource;
    expiresAt : ?Time.Time;
  };

  public type CreatePrincipalAccessGrantResult = {
    grant : PrincipalAccessGrant;
    revoked : [PrincipalAccessGrant];
  };

  public type CreatePendingAccessGrantResult = {
    grant : PendingAccessGrant;
    cancelled : [PendingAccessGrant];
    revokedPrincipalGrants : [PrincipalAccessGrant];
  };

  public type CreateAccessBatchItem = CreatePendingAccessGrantArguments;

  public type CreateAccessBatchArguments = {
    items : [CreateAccessBatchItem];
  };

  public type CreateAccessBatchResult = {
    principalGrants : [PrincipalAccessGrant];
    pendingGrants : [PendingAccessGrant];
    revokedPrincipalGrants : [PrincipalAccessGrant];
    cancelledPendingGrants : [PendingAccessGrant];
  };

  public type RevokeAccessBatchItem = {
    principal : Principal;
    scope : AccessScope;
  };

  public type RevokeAccessBatchArguments = {
    items : [RevokeAccessBatchItem];
  };

  public type RevokeAccessBatchResult = {
    revoked : [RevokeAccessBatchItem];
  };

  public type AccessGrantListMode = {
    #exact;
    #effective;
  };

  public type ListAccessGrantsArguments = {
    scope : ?AccessScope;
    mode : AccessGrantListMode;
  };

  public type ListedPrincipalAccessGrant = {
    grant : PrincipalAccessGrant;
    inheritedFrom : ?AccessScope;
  };

  public type ListedPendingAccessGrant = {
    grant : PendingAccessGrant;
    inheritedFrom : ?AccessScope;
  };

  public type AccessGrantList = {
    scope : AccessScope;
    mode : AccessGrantListMode;
    principalGrants : [ListedPrincipalAccessGrant];
    pendingGrants : [ListedPendingAccessGrant];
  };

  public type ClaimPendingAccessGrantArguments = {
    grantId : Nat;
  };

  public type ClaimPendingAccessByVerifiedAttributesArguments = {
    emailCommitments : [EmailCommitment];
  };

  public type ClaimPendingAccessByBackendAttestationArguments = {
    principal : Principal;
    emailCommitments : [EmailCommitment];
  };

  public type ClaimedPendingAccessGrant = {
    pendingGrant : PendingAccessGrant;
    principalGrant : PrincipalAccessGrant;
    claimOrigin : ?EmailClaimOrigin;
    created : Bool;
  };

  public type CancelPendingAccessGrantArguments = {
    grantId : Nat;
  };

  public type CancelPendingAccessGrantResult = {
    grant : PendingAccessGrant;
    revokedPrincipalGrants : [PrincipalAccessGrant];
  };

  public type CreateDurableAccessGrantArguments = {
    principal : Principal;
    scope : AccessScope;
    permission : Permission;
    source : AccessSource;
  };

  public type CreateAccessRequestArguments = {
    emailCommitment : ?EmailCommitment;
    message : ?Text;
  };

  public type CancelAccessRequestArguments = {
    requestId : Nat;
  };

  public type ResolveAccessRequestArguments = {
    requestId : Nat;
    decision : AccessRequestDecision;
  };
};
