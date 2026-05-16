import Array "mo:core/Array";
import Principal "mo:core/Principal";

import StorageTypes "mo:encrypted-storage/Types";

import BackendEvents "../BackendEvents/lib";
import Types "Types";

module {
  public type Delivery = Types.Delivery;

  public type Deps = {
    listAdmins : () -> [Principal];
  };

  public func route(event : BackendEvents.BackendEvent, deps : Deps) : [Delivery] {
    switch (event) {
      case (#notificationRequested({ recipient; payload; correlationId })) [
        delivery(recipient, payload, correlationId, #backend, ?(#backend({ kind = "notificationRequested" })), severityForPayload(payload))
      ];
      case (#adminNotificationRequested({ payload; correlationId })) {
        Array.map<Principal, Delivery>(
          deps.listAdmins(),
          func(admin) = delivery(admin, payload, correlationId, #backend, ?(#backend({ kind = "adminNotificationRequested" })), severityForPayload(payload)),
        );
      };
      case (#storageAccessChanged(envelope)) routeStorageAccessChanged(envelope);
      case _ [];
    };
  };

  func delivery(
    recipient : Principal,
    payload : Types.NotificationPayload,
    correlationId : ?Text,
    source : Types.NotificationSource,
    sourceEvent : ?Types.SourceEventRef,
    severity : Types.NotificationSeverity,
  ) : Delivery = {
    recipient;
    payload;
    correlationId;
    source;
    sourceEvent;
    severity;
  };

  func storageSourceEvent(envelope : BackendEvents.StorageAccessChanged) : Types.SourceEventRef {
    #storage({
      canisterId = envelope.storageCanisterId;
      storageEventId = envelope.storageEventId;
    });
  };

  func routeStorageAccessChanged(envelope : BackendEvents.StorageAccessChanged) : [Delivery] {
    switch (envelope.event) {
      case (#accessRequestCreated({ requestId; requester })) [
        delivery(
          envelope.accountOwner,
          #storageAccessRequestCreated({
            canisterId = envelope.storageCanisterId;
            requestId;
            requester;
          }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          #warning,
        )
      ];
      case (#accessRequestResolved({ requestId; requester; status })) [
        delivery(
          requester,
          #storageAccessRequestResolved({
            canisterId = envelope.storageCanisterId;
            requestId;
            status;
          }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          accessRequestResolvedSeverity(status),
        )
      ];
      case (#accessRequestCancelled({ requestId; requester })) [
        delivery(
          envelope.accountOwner,
          #storageAccessRequestCancelled({
            canisterId = envelope.storageCanisterId;
            requestId;
            requester;
          }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          #info,
        )
      ];
      case (#pendingGrantCreated({ grantId; recipient; emailCommitment = _; accessClass; source })) {
        switch (recipient) {
          case (?principal) [
            delivery(
              principal,
              #storageInviteCreated({
                canisterId = envelope.storageCanisterId;
                grantId;
                accessClass;
                source;
              }),
              envelope.correlationId,
              #storage,
              ?storageSourceEvent(envelope),
              #info,
            )
          ];
          case null [];
        };
      };
      case (#pendingGrantClaimed({ grantId; principal; accessClass; source; claimOrigin = _; emailClaimState = _ })) [
        delivery(
          envelope.accountOwner,
          #storageInviteClaimed({
            canisterId = envelope.storageCanisterId;
            grantId;
            principal;
            accessClass;
            source;
          }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          #success,
        )
      ];
      case (#pendingGrantCancelled({ grantId; recipient; emailCommitment = _ })) {
        switch (recipient) {
          case (?principal) [
            delivery(
              principal,
              #storageInviteCancelled({
                canisterId = envelope.storageCanisterId;
                grantId;
              }),
              envelope.correlationId,
              #storage,
              ?storageSourceEvent(envelope),
              #warning,
            )
          ];
          case null [];
        };
      };
      case (#principalGrantCreated({ grantId; principal; accessClass; source })) {
        if (isAccessRequestSource(source)) {
          [];
        } else {
          [
            delivery(
              principal,
              #storageAccessGranted({
                canisterId = envelope.storageCanisterId;
                grantId;
                accessClass;
                source;
              }),
              envelope.correlationId,
              #storage,
              ?storageSourceEvent(envelope),
              #success,
            )
          ];
        };
      };
      case (#principalGrantRevoked({ principal; accessClass })) [
        delivery(
          principal,
          #storageAccessRevoked({
            canisterId = envelope.storageCanisterId;
            accessClass;
          }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          #warning,
        )
      ];
      case (#recoveryControllerRegistered(_)) [];
      case (#recoveryControllerCleared(_)) [];
      case (#recoveryOwnerAdded({ principal })) [
        delivery(
          principal,
          #storageRecoveryOwnerAdded({ canisterId = envelope.storageCanisterId }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          #success,
        )
      ];
      case (#recoveryOwnerRemoved({ principal })) [
        delivery(
          principal,
          #storageRecoveryOwnerRemoved({ canisterId = envelope.storageCanisterId }),
          envelope.correlationId,
          #storage,
          ?storageSourceEvent(envelope),
          #warning,
        )
      ];
    };
  };

  func accessRequestResolvedSeverity(status : StorageTypes.AccessRequestStatus) : Types.NotificationSeverity {
    switch (status) {
      case (#approved) #success;
      case (#rejected) #warning;
      case (#cancelled) #info;
      case (#pending) #info;
    };
  };

  func isAccessRequestSource(source : StorageTypes.AccessSource) : Bool {
    switch (source) {
      case (#accessRequest(_)) true;
      case _ false;
    };
  };

  func severityForPayload(payload : Types.NotificationPayload) : Types.NotificationSeverity {
    switch (payload) {
      case (#subscriptionActivated(_) or #trialStarted(_) or #subscriptionRenewed(_) or #paymentReceived(_) or #depositReceived(_) or #topUpCompleted(_) or #autoTopUpCompleted(_) or #storageAccessRequestResolved(_) or #storageInviteClaimed(_) or #storageAccessGranted(_) or #storageRecoveryOwnerAdded(_)) #success;
      case (#subscriptionExpired or #lowCycles(_) or #balanceLow(_) or #storageAccessRequestCreated(_) or #storageInviteCreated(_) or #storageInviteCancelled(_) or #storageAccessRevoked(_) or #storageRecoveryOwnerRemoved(_) or #backendLowCycles(_) or #treasuryIcpLow(_)) #warning;
      case (#autoRenewFailed(_) or #topUpFailed(_) or #autoTopUpFailed(_) or #backendSelfTopUpFailed(_) or #ambassadorPayoutFailed(_) or #cmcNotifyStuck(_)) #critical;
      case (#updateAvailable(_) or #storageAccessRequestCancelled(_) or #creationRefunded(_)) #info;
    };
  };
};
