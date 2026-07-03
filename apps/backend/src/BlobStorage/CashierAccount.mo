import Error "mo:core/Error";
import Array "mo:core/Array";
import Cycles "mo:core/Cycles";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Prim "mo:prim";

import { ic } "mo:ic";
import IC "mo:ic/Types";
import Storage "mo:caffeineai-object-storage/Storage";

import Cashier "../Types/Cashier";

module {
  let SECONDS_PER_DAY : Nat = 86_400;
  let BLOB_STORAGE_CASHIER_BOOTSTRAP_CYCLES : Nat = 100_000_000_000;
  let BLOB_STORAGE_CHUNK_BYTES : Nat = 1_048_576;
  let BLOB_STORAGE_CASHIER_UPLOAD_MARGIN_CYCLES : Nat = 25_000_000_000;
  let BLOB_STORAGE_CANISTER_RESERVE_MARGIN_CYCLES : Nat = 200_000_000_000;
  let BLOB_STORAGE_CANISTER_FALLBACK_RESERVED_CYCLES : Nat = 700_000_000_000;
  let BLOB_STORAGE_UPLOAD_RESERVATION_TTL_NS : Time.Time = 86_400_000_000_000; // 1 day

  public type UploadReservationKey = Text;

  public type UploadReservationRequest = {
    key : UploadReservationKey;
    declaredUploadBytes : Nat;
  };

  public type UploadFundingPlan = {
    declaredUploadBytes : Nat;
    newReservationAmount : Nat;
    targetBalance : Nat;
    currentCashierTotal : Int;
    canisterBalance : Nat;
    reservedCanisterCycles : Nat;
    freeCanisterCycles : Nat;
    cyclesToSend : Nat;
    requiredCanisterBalance : Nat;
    canisterTopUpNeeded : Nat;
  };

  type UploadReservation = {
    amount : Nat;
    expiresAt : Time.Time;
  };

  public type RefillInformation = {
    proposed_top_up_amount : ?Nat;
  };

  public type RefillResult = {
    success : ?Bool;
    topped_up_amount : ?Nat;
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

  func delegationErrorToText(error : Cashier.DelegationError) : Text {
    switch (error) {
      case (#DelegationNotFound(delegate)) "delegation not found: " # Principal.toText(delegate);
      case (#NotAuthorized(principal)) "not authorized: " # Principal.toText(principal);
      case (#InvalidRequest(message)) "invalid request: " # message;
      case (#InternalError(message)) "internal error: " # message;
    };
  };

  func topUpErrorToText(error : Cashier.AccountTopUpError) : Text {
    switch (error) {
      case (#NotAuthorized(principal)) "not authorized: " # Principal.toText(principal);
      case (#AccountBalanceOverflow) "account balance overflow";
      case (#InternalError(message)) "internal error: " # message;
      case (#TopUpWithoutCycles) "top-up without cycles";
    };
  };

  func hasFullAccess(delegation : Cashier.Delegation) : Bool {
    for (permission in delegation.permissions.vals()) {
      if (permission == #FullAccess) return true;
    };
    false;
  };

  func factorUnit(factor : Cashier.Factor) : Nat {
    switch (factor) {
      case (#U) 1;
      case (#K) 1_000;
      case (#M) 1_000_000;
      case (#G) 1_000_000_000;
      case (#T) 1_000_000_000_000;
      case (#Ki) 1_024;
      case (#Mi) 1_048_576;
      case (#Gi) 1_073_741_824;
      case (#Ti) 1_099_511_627_776;
    };
  };

  func divCeil(numerator : Nat, denominator : Nat) : Nat {
    if (numerator == 0) return 0;
    ((numerator - 1) / denominator) + 1;
  };

  func freeCanisterCycles(balance : Nat, reservedCycles : Nat) : Nat {
    if (balance > reservedCycles) {
      Nat.sub(balance, reservedCycles);
    } else {
      0;
    };
  };

  func canisterReservedCycles() : async Nat {
    try {
      let status = await ic.canister_status({ canister_id = Prim.getSelfPrincipal<system>() });
      let freezingReserve = divCeil(
        status.idle_cycles_burned_per_day * status.settings.freezing_threshold,
        SECONDS_PER_DAY,
      );
      let reservedCycles = freezingReserve + BLOB_STORAGE_CANISTER_RESERVE_MARGIN_CYCLES;
      reservedCycles;
    } catch (_) {
      BLOB_STORAGE_CANISTER_FALLBACK_RESERVED_CYCLES;
    };
  };

  func priceCost(price : Cashier.PricePerBillingUnit, quantity : Nat) : Nat {
    if (price.cost <= 0 or quantity == 0) return 0;
    divCeil(quantity * Int.abs(price.cost), factorUnit(price.per));
  };

  func topUpAmountForTarget(currentTotal : Int, targetBalance : Nat) : Nat {
    if (currentTotal >= targetBalance) return 0;
    if (currentTotal >= 0) return Nat.sub(targetBalance, Int.abs(currentTotal));
    targetBalance + Int.abs(currentTotal);
  };

  func uploadPrepaymentAmount(pricelist : Cashier.Pricelist, declaredUploadBytes : Nat) : Nat {
    let writeRequestCount = divCeil(declaredUploadBytes, BLOB_STORAGE_CHUNK_BYTES) + 1;
    let estimatedCost =
      priceCost(pricelist.counters.bytes_uploaded_price, declaredUploadBytes) +
      priceCost(pricelist.gauges.bytes_stored, declaredUploadBytes) +
      priceCost(pricelist.counters.write_request_price, writeRequestCount);
    estimatedCost + BLOB_STORAGE_CASHIER_UPLOAD_MARGIN_CYCLES;
  };

  func declaredUploadBytesFor(requests : [UploadReservationRequest]) : Nat {
    Array.foldLeft<UploadReservationRequest, Nat>(
      requests,
      0,
      func(total, request) = total + request.declaredUploadBytes,
    );
  };

  func prepaymentAmountFor(pricelist : Cashier.Pricelist, requests : [UploadReservationRequest]) : Nat {
    Array.foldLeft<UploadReservationRequest, Nat>(
      requests,
      0,
      func(total, request) = total + uploadPrepaymentAmount(pricelist, request.declaredUploadBytes),
    );
  };

  public class Store(storageState : Storage.State) {
    var uploadReservations : Map.Map<UploadReservationKey, UploadReservation> = Map.empty<UploadReservationKey, UploadReservation>();
    var topUpInProgress : Bool = false;

    public func refill(refillInformation : ?RefillInformation) : async RefillResult {
      if (topUpInProgress) {
        throw Error.reject("Blob Storage Cashier top-up is already in progress");
      };

      topUpInProgress := true;
      try {
        let reservedCycles = await canisterReservedCycles();
        let currentBalance = Cycles.balance();
        let currentFreeCyclesCount = freeCanisterCycles(currentBalance, reservedCycles);

        // Cashier may omit a suggested amount. Do not treat that as permission
        // to drain all free canister cycles into the Cashier account.
        let cyclesToSend = switch (refillInformation) {
          case (null) 0;
          case (?info) {
            switch (info.proposed_top_up_amount) {
              case (null) 0;
              case (?proposed) Nat.min(proposed, currentFreeCyclesCount);
            };
          };
        };

        if (cyclesToSend == 0) {
          return {
            success = ?false;
            topped_up_amount = ?0;
          };
        };

        let cashier = await cashierActor();
        switch (await (with cycles = cyclesToSend) cashier.account_top_up_v1(?{
          account = ?Prim.getSelfPrincipal<system>();
          target_balance = null;
        })) {
          case (#Ok(response)) {
            {
              success = ?true;
              topped_up_amount = ?cyclesToSend;
            };
          };
          case (#Err(error)) {
            let message = topUpErrorToText(error);
            throw Error.reject("Blob Storage Cashier account top-up rejected: " # message);
          };
        };
      } finally {
        topUpInProgress := false;
      };
    };

    func pruneExpiredUploadReservations(now : Time.Time) {
      uploadReservations := Map.filter<UploadReservationKey, UploadReservation>(
        uploadReservations,
        Text.compare,
        func(_, reservation) = reservation.expiresAt >= now,
      );
    };

    func releaseReservation(key : UploadReservationKey) {
      Map.remove(uploadReservations, Text.compare, key);
    };

    func reserveUpload(key : UploadReservationKey, amount : Nat, now : Time.Time) {
      pruneExpiredUploadReservations(now);
      Map.add(
        uploadReservations,
        Text.compare,
        key,
        {
          amount;
          expiresAt = now + BLOB_STORAGE_UPLOAD_RESERVATION_TTL_NS;
        },
      );
    };

    func activeUploadReservationAmount(now : Time.Time) : Nat {
      pruneExpiredUploadReservations(now);
      Map.foldLeft<UploadReservationKey, UploadReservation, Nat>(
        uploadReservations,
        0,
        func(total, _, reservation) = total + reservation.amount,
      );
    };

    func accountTotalBalance() : async Int {
      let cashier = await cashierActor();
      switch (await cashier.account_balance_get_v1({
        account = Prim.getSelfPrincipal<system>();
      })) {
        case (#Ok(response)) {
          response.account_cycle_balances.total;
        };
        case (#Err(#AccountNotFound)) {
          0;
        };
        case (#Err(#InternalError(message))) {
          throw Error.reject("Blob Storage Cashier balance check failed: " # message);
        };
      };
    };

    func topUpToTarget(targetBalance : Nat, currentCashierTotal : Int, reservedCycles : Nat) : async Int {
      let currentBalance = Cycles.balance();
      let currentFreeCyclesCount = freeCanisterCycles(currentBalance, reservedCycles);
      let cyclesToSend = topUpAmountForTarget(currentCashierTotal, targetBalance);

      if (cyclesToSend == 0) {
        return currentCashierTotal;
      };

      if (currentFreeCyclesCount < cyclesToSend) {
        throw Error.reject(
          "Insufficient storage canister cycles for Blob Storage Cashier target " #
          Nat.toText(targetBalance) #
          ": need " #
          Nat.toText(cyclesToSend) #
          " free cycles, have " #
          Nat.toText(currentFreeCyclesCount)
        );
      };

      let cashier = await cashierActor();
      switch (await (with cycles = cyclesToSend) cashier.account_top_up_v1(?{
        account = ?Prim.getSelfPrincipal<system>();
        target_balance = ?targetBalance;
      })) {
        case (#Ok(response)) {
          response.balance.total;
        };
        case (#Err(error)) {
          let message = topUpErrorToText(error);
          throw Error.reject("Blob Storage Cashier account top-up rejected: " # message);
        };
      };
    };

    func ensureTargetBalanceLocked(targetBalance : Nat) : async () {
      try {
        let reservedCycles = await canisterReservedCycles();
        let currentCashierTotal = await accountTotalBalance();
        if (currentCashierTotal >= targetBalance) {
          return;
        };

        let cashierTotal = await topUpToTarget(targetBalance, currentCashierTotal, reservedCycles);
        if (cashierTotal < targetBalance) {
          throw Error.reject("Blob Storage Cashier top-up did not reach target balance: target " # Nat.toText(targetBalance) # ", cashier balance " # debug_show (cashierTotal));
        };
      } catch (error) {
        throw Error.reject("Blob Storage Cashier top-up failed: " # Error.message(error));
      };
    };

    func ensureTargetBalance(targetBalance : Nat) : async () {
      if (topUpInProgress) {
        throw Error.reject("Blob Storage Cashier top-up is already in progress");
      };

      topUpInProgress := true;
      try {
        await ensureTargetBalanceLocked(targetBalance);
      } finally {
        topUpInProgress := false;
      };
    };

    func reservedBalanceTarget(now : Time.Time) : Nat {
      BLOB_STORAGE_CASHIER_BOOTSTRAP_CYCLES + activeUploadReservationAmount(now);
    };

    func buildUploadFundingPlanWithPricelist(pricelist : Cashier.Pricelist, requests : [UploadReservationRequest]) : async UploadFundingPlan {
      let now = Time.now();
      let declaredUploadBytes = declaredUploadBytesFor(requests);
      let newReservationAmount = prepaymentAmountFor(pricelist, requests);
      let targetBalance = reservedBalanceTarget(now) + newReservationAmount;
      let currentCashierTotal = await accountTotalBalance();
      let reservedCanisterCycles = await canisterReservedCycles();
      let canisterBalance = Cycles.balance();
      let freeCanisterCyclesCount = freeCanisterCycles(canisterBalance, reservedCanisterCycles);
      let cyclesToSend = topUpAmountForTarget(currentCashierTotal, targetBalance);
      let requiredCanisterBalance = reservedCanisterCycles + cyclesToSend;
      let canisterTopUpNeeded = if (canisterBalance >= requiredCanisterBalance) {
        0;
      } else {
        Nat.sub(requiredCanisterBalance, canisterBalance);
      };

      {
        declaredUploadBytes;
        newReservationAmount;
        targetBalance;
        currentCashierTotal;
        canisterBalance;
        reservedCanisterCycles;
        freeCanisterCycles = freeCanisterCyclesCount;
        cyclesToSend;
        requiredCanisterBalance;
        canisterTopUpNeeded;
      };
    };

    public func planUploadBatch(requests : [UploadReservationRequest]) : async UploadFundingPlan {
      let cashier = await cashierActor();
      let pricelist = await cashier.pricelist_v1();
      await buildUploadFundingPlanWithPricelist(pricelist, requests);
    };

    public func reserveUploadBatch(requests : [UploadReservationRequest]) : async () {
      if (requests.size() == 0) return;
      if (topUpInProgress) {
        throw Error.reject("Blob Storage Cashier top-up is already in progress");
      };

      topUpInProgress := true;
      var storedKeys : [UploadReservationKey] = [];
      try {
        let pricelist = try {
          let cashier = await cashierActor();
          await cashier.pricelist_v1();
        } catch (error) {
          throw Error.reject("Blob Storage Cashier pricelist check failed: " # Error.message(error));
        };

        let plan = await buildUploadFundingPlanWithPricelist(pricelist, requests);
        let now = Time.now();
        for (request in requests.vals()) {
          let prepaymentAmount = uploadPrepaymentAmount(pricelist, request.declaredUploadBytes);
          reserveUpload(request.key, prepaymentAmount, now);
          storedKeys := Array.concat(storedKeys, [request.key]);
        };

        let target = plan.targetBalance;
        await ensureTargetBalanceLocked(target);
      } catch (error) {
        for (key in storedKeys.vals()) {
          releaseReservation(key);
        };
        throw Error.reject(Error.message(error));
      } finally {
        topUpInProgress := false;
      };
    };

    public func releaseUploadReservation(key : UploadReservationKey) {
      releaseReservation(key);
    };

    public func ensureBootstrapBalance() : async () {
      await ensureTargetBalance(BLOB_STORAGE_CASHIER_BOOTSTRAP_CYCLES);
    };

    func setFullAccess(delegate : Principal) : async () {
      if (Principal.isAnonymous(delegate)) {
        throw Error.reject("cannot delegate Blob Storage Cashier access to anonymous principal");
      };

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

    public func grantFullAccess(delegate : Principal) : async () {
      await ensureBootstrapBalance();
      await setFullAccess(delegate);
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

    public func listDelegates() : async Cashier.AccountDelegateListResult {
      let cashier = await cashierActor();
      await cashier.account_delegate_list_v1(?Prim.getSelfPrincipal<system>());
    };

    public func syncExactFullAccessDelegates(delegates : [Principal]) : async () {
      await ensureBootstrapBalance();
      for (delegate in delegates.vals()) {
        await setFullAccess(delegate);
      };
      switch (await listDelegates()) {
        case (#Ok({ delegations })) {
          for (delegation in delegations.vals()) {
            if (hasFullAccess(delegation) and not principalIn(delegates, delegation.delegate)) {
              await revokeFullAccess(delegation.delegate);
            };
          };
        };
        case (#Err(error)) throw Error.reject("failed to list Blob Storage Cashier delegations: " # delegationErrorToText(error));
      };
    };
  };
};
