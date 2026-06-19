import Error "mo:core/Error";
import Principal "mo:core/Principal";
import Prim "mo:prim";

import Storage "mo:caffeineai-object-storage/Storage";

import Cashier "../Types/Cashier";

module {
  let BLOB_STORAGE_CASHIER_BOOTSTRAP_CYCLES : Nat = 100_000_000_000;

  public type Store = {
    storageState : Storage.State;
    var activated : Bool;
    var activationInFlight : Bool;
  };

  public type Delegation = Cashier.Delegation;

  public type DelegationListResult = Cashier.AccountDelegateListResult;

  public type RefillInformation = {
    proposed_top_up_amount : ?Nat;
  };

  public type RefillResult = {
    success : ?Bool;
    topped_up_amount : ?Nat;
  };

  public func new(storageState : Storage.State) : Store {
    {
      storageState;
      var activated = false;
      var activationInFlight = false;
    };
  };

  func cashierActor() : async Cashier.Self {
    let cashier = await Storage.getCashierPrincipal();
    actor (Principal.toText(cashier));
  };

  func principalIn(principals : [Principal], principal : Principal) : Bool {
    for (item in principals.vals()) {
      if (Principal.equal(item, principal)) return true;
    };
    false;
  };

  public func delegationErrorToText(error : Cashier.DelegationError) : Text {
    switch (error) {
      case (#DelegationNotFound(delegate)) "delegation not found: " # Principal.toText(delegate);
      case (#NotAuthorized(principal)) "not authorized: " # Principal.toText(principal);
      case (#InvalidRequest(message)) "invalid request: " # message;
      case (#InternalError(message)) "internal error: " # message;
    };
  };

  public func hasFullAccess(delegation : Delegation) : Bool {
    for (permission in delegation.permissions.vals()) {
      if (permission == #FullAccess) return true;
    };
    false;
  };

  public func refill(self : Store, refillInformation : ?RefillInformation) : async RefillResult {
    let cashier = await Storage.getCashierPrincipal();
    await Storage.refillCashier(self.storageState, cashier, refillInformation);
  };

  public func ensureActivated(self : Store) : async () {
    if (self.activated) return;

    if (self.activationInFlight) {
      throw Error.reject("Blob Storage Cashier activation is already in progress");
    };

    self.activationInFlight := true;
    try {
      let shouldActivate = switch (try {
        let cashier = await cashierActor();
        await cashier.account_balance_get_v1({
          account = Prim.getSelfPrincipal<system>();
        });
      } catch (error) {
        throw Error.reject("Blob Storage Cashier activation check failed: " # Error.message(error));
      }) {
        case (#Ok(_)) false;
        case (#Err(#AccountNotFound)) true;
        case (#Err(#InternalError(message))) throw Error.reject("Blob Storage Cashier activation check failed: " # message);
      };

      if (shouldActivate) {
        let result = try {
          await refill(self, ?{
            proposed_top_up_amount = ?BLOB_STORAGE_CASHIER_BOOTSTRAP_CYCLES;
          });
        } catch (error) {
          throw Error.reject("Blob Storage Cashier activation failed: " # Error.message(error));
        };

        switch (result.success) {
          case (?true) {};
          case _ throw Error.reject("Blob Storage Cashier activation failed");
        };
      };

      self.activated := true;
    } finally {
      self.activationInFlight := false;
    };
  };

  public func grantFullAccess(self : Store, delegate : Principal) : async () {
    if (Principal.isAnonymous(delegate)) {
      throw Error.reject("cannot delegate Blob Storage Cashier access to anonymous principal");
    };

    await ensureActivated(self);
    let cashier = await cashierActor();
    switch (await cashier.account_delegate_set_v1({
      account = ?Prim.getSelfPrincipal<system>();
      delegate;
      permissions = [#FullAccess];
      valid_until = null;
    })) {
      case (#Ok) {};
      case (#Err(error)) throw Error.reject("failed to grant Blob Storage Cashier FullAccess: " # delegationErrorToText(error));
    };
  };

  public func revokeFullAccess(delegate : Principal) : async () {
    let cashier = await cashierActor();
    switch (await cashier.account_delegate_remove_v1({
      account = ?Prim.getSelfPrincipal<system>();
      delegate;
    })) {
      case (#Ok) {};
      case (#Err(#DelegationNotFound(_))) {};
      case (#Err(error)) throw Error.reject("failed to revoke Blob Storage Cashier delegation: " # delegationErrorToText(error));
    };
  };

  public func listDelegates() : async DelegationListResult {
    let cashier = await cashierActor();
    await cashier.account_delegate_list_v1(?Prim.getSelfPrincipal<system>());
  };

  public func grantFullAccessToDelegates(self : Store, delegates : [Principal]) : async () {
    for (delegate in delegates.vals()) {
      await grantFullAccess(self, delegate);
    };
  };

  public func revokeFullAccessDelegatesExcept(allowedDelegates : [Principal]) : async () {
    switch (await listDelegates()) {
      case (#Ok({ delegations })) {
        for (delegation in delegations.vals()) {
          if (hasFullAccess(delegation) and not principalIn(allowedDelegates, delegation.delegate)) {
            await revokeFullAccess(delegation.delegate);
          };
        };
      };
      case (#Err(error)) throw Error.reject("failed to list Blob Storage Cashier delegations: " # delegationErrorToText(error));
    };
  };

  public func syncExactFullAccessDelegates(self : Store, delegates : [Principal]) : async () {
    await grantFullAccessToDelegates(self, delegates);
    await revokeFullAccessDelegatesExcept(delegates);
  };
};
