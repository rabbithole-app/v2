import Cycles "mo:core/Cycles";
import Error "mo:core/Error";
import Principal "mo:core/Principal";

module {
  /// Default operations floor — below this backend cycle balance user-facing
  /// operations stop drawing from the reserve and fall back to the CMC path.
  /// The reserve under the floor belongs to the backend's own operation.
  public let DEFAULT_OPS_FLOOR : Nat = 10_000_000_000_000; // 10 TC

  /// Default refill watermark — dropping below emits an admin notification
  /// suggesting a manual reserve refill (cycles bought off-CMC are cheaper).
  public let DEFAULT_REFILL_WATERMARK : Nat = 25_000_000_000_000; // 25 TC

  public type DepositResult = {
    #ok;
    /// Reserve can't cover the amount without dipping below the floor —
    /// caller must fall back to the CMC path.
    #insufficientReserve;
    #failed : Text;
  };

  type ManagementCanister = actor {
    deposit_cycles : shared { canister_id : Principal } -> async ();
  };

  /// Cycles available for user-facing operations above the floor.
  public func available(floor : Nat) : Nat {
    let balance = Cycles.balance();
    if (balance <= floor) 0 else balance - floor;
  };

  /// Deposit `amount` cycles from the backend's own balance onto `canisterId`.
  /// `async*` on purpose: the balance check and the cycle attach run in the
  /// caller's message with no await between them, so concurrent messages
  /// can't race the floor. Unaccepted cycles are auto-refunded on reject.
  public func deposit(canisterId : Principal, amount : Nat, floor : Nat) : async* DepositResult {
    if (available(floor) < amount) return #insufficientReserve;
    let ic : ManagementCanister = actor ("aaaaa-aa");
    try {
      await (with cycles = amount) ic.deposit_cycles({ canister_id = canisterId });
      #ok;
    } catch (e) {
      #failed(Error.message(e));
    };
  };
};
