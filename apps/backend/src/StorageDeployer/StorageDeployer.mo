import Principal "mo:core/Principal";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Blob "mo:core/Blob";
import Error "mo:core/Error";

import ByteUtils "mo:byte-utils";

import CMCTypes "../Types/CMCTypes";
import CyclesReserve "../Balance/CyclesReserve";
import LedgerTypes "../Types/LedgerTypes";
import Account "Utils/Account";
import Types "Types";
import TreasuryConst "mo:treasury/Const";

module {
  let CYCLE_MINTING_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";
  let LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

  let CYCLES_PER_XDR : Nat = 1_000_000_000_000;
  let PERMYRIAD : Nat = 10_000;
  let E8S_PER_ICP = 100_000_000;
  let MEMO_CREATE_CANISTER : LedgerTypes.Memo = 0x41455243;
  let FEE : Nat = 10_000;
  public let CANISTER_CREATION_COST : Nat = 500_000_000_000;

  public type RemoteCallStage = {
    #FetchIcpXdrRate;
    #ReadTreasuryIcpBalance;
    #ReadDefaultIcpBalance;
    #TransferIcpToCmc;
    #NotifyCmcCreateCanister;
    #CmcCreateCanisterFromReserve;
  };

  public type CreateCanisterError = {
    #InsufficientBalance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.Icrc1TransferError;
    #RemoteCallFailed : {
      stage : RemoteCallStage;
      message : Text;
      /// Present only after the ICP transfer to CMC succeeded. If the remote
      /// `notify_create_canister` call failed at transport/reject level, this
      /// block index is the recovery breadcrumb admins need.
      blockIndex : ?Nat;
    };
    /// `blockIndex` is the CMC ICP deposit block — needed by CmcRecovery to
    /// replay `notify_create_canister` on retry.
    #NotifyFailed : { err : CMCTypes.NotifyError; blockIndex : Nat };
  };

  func remoteCallFailed(stage : RemoteCallStage, message : Text, blockIndex : ?Nat) : CreateCanisterError {
    #RemoteCallFailed({ stage; message; blockIndex });
  };

  /// Create a new canister for `caller`. Funding sources, in order:
  ///   1. Backend cycles reserve — direct CMC `create_canister` with cycles
  ///      attached (no ICP transfer, no notify). Skipped when the reserve
  ///      can't cover `initialCycles + creation fee` above `reserveOpsFloor`,
  ///      or when `reserveOpsFloor` is null (reserve path disabled).
  ///   2. Backend treasury subaccount ICP → CMC (current paid license flow)
  ///   3. Backend default ICP account → CMC (legacy/admin-funded fallback)
  /// If no source has enough, #InsufficientBalance reports the largest
  /// available balance so admin sees actionable info.
  public func transferAndCreateCanister(
    deployerCanisterId : Principal,
    caller : Principal,
    initialCycles : Nat,
    subnetId : ?Principal,
    environmentVariables : ?[{ name : Text; value : Text }],
    reserveOpsFloor : ?Nat,
  ) : async Result.Result<{ canisterId : Principal; fundedFromReserve : Bool }, CreateCanisterError> {
    let ledger = actor (LEDGER_CANISTER_ID) : LedgerTypes.Self;
    let cmc = actor (CYCLE_MINTING_CANISTER_ID) : CMCTypes.Self;

    let totalCycles = initialCycles + CANISTER_CREATION_COST;
    let subnetSelection : ?CMCTypes.SubnetSelection = switch (subnetId) {
      case (?subnet) ?#Subnet({ subnet });
      case null null;
    };
    let canisterSettings : CMCTypes.CanisterSettings = {
      controllers = ?[deployerCanisterId, caller];
      freezing_threshold = null;
      wasm_memory_threshold = null;
      environment_variables = environmentVariables;
      reserved_cycles_limit = null;
      log_visibility = null;
      log_memory_limit = null;
      wasm_memory_limit = null;
      memory_allocation = null;
      compute_allocation = null;
    };

    // --- Source 1: cycles reserve. The availability check and the cycle
    // attach run in the same message, so concurrent deployments can't race
    // the floor. On #Err the attached cycles are refunded by the CMC.
    switch (reserveOpsFloor) {
      case (?floor) {
        if (CyclesReserve.available(floor) >= totalCycles) {
          let result = try {
            await (with cycles = totalCycles) cmc.create_canister({
              subnet_selection = subnetSelection;
              settings = ?canisterSettings;
              subnet_type = null;
            });
          } catch (error) {
            return #err(remoteCallFailed(#CmcCreateCanisterFromReserve, Error.message(error), null));
          };
          switch (result) {
            case (#Ok(canisterId)) return #ok({ canisterId; fundedFromReserve = true });
            case (#Err(#Refunded({ create_error; refund_amount = _ }))) {
              return #err(remoteCallFailed(#CmcCreateCanisterFromReserve, "CMC refused creation: " # create_error, null));
            };
          };
        };
      };
      case null {};
    };

    // --- CMC fallback: ICP transfer + notify_create_canister ---

    // Step 1: Calculate required ICP
    let rateResponse = try {
      await cmc.get_icp_xdr_conversion_rate();
    } catch (error) {
      return #err(remoteCallFailed(#FetchIcpXdrRate, Error.message(error), null));
    };
    let xdrPermyriadPerIcp = Nat64.toNat(rateResponse.data.xdr_permyriad_per_icp);
    let numerator = totalCycles * PERMYRIAD * E8S_PER_ICP;
    let denominator = CYCLES_PER_XDR * xdrPermyriadPerIcp;
    let requiredIcpE8s = numerator / denominator;
    let totalRequired = requiredIcpE8s + FEE;

    // Step 2: Pick funding source — backend treasury, then default account
    let treasurySubaccount = TreasuryConst.treasurySubaccount();
    let treasuryBalance = try {
      await ledger.icrc1_balance_of({
        owner = deployerCanisterId;
        subaccount = ?treasurySubaccount;
      });
    } catch (error) {
      return #err(remoteCallFailed(#ReadTreasuryIcpBalance, Error.message(error), null));
    };
    let fromSubaccount : ?Blob = if (treasuryBalance >= totalRequired) {
      ?treasurySubaccount;
    } else {
      let defaultBalance = try {
        await ledger.icrc1_balance_of({
          owner = deployerCanisterId;
          subaccount = null;
        });
      } catch (error) {
        return #err(remoteCallFailed(#ReadDefaultIcpBalance, Error.message(error), null));
      };
      if (defaultBalance >= totalRequired) {
        null;
      } else {
        let available = Nat.max(defaultBalance, treasuryBalance);
        return #err(#InsufficientBalance({
          required = totalRequired;
          available;
        }));
      };
    };

    // Step 3: Transfer ICP from chosen source to CMC
    let memoBlob = ByteUtils.LE.fromNat64(MEMO_CREATE_CANISTER) |> Blob.fromArray(_);
    let cmcSubaccount = Account.principalToSubaccount(deployerCanisterId);
    let transferResult = try {
      await ledger.icrc1_transfer({
        to = {
          owner = Principal.fromText(CYCLE_MINTING_CANISTER_ID);
          subaccount = ?cmcSubaccount;
        };
        fee = ?FEE;
        from_subaccount = fromSubaccount;
        memo = ?memoBlob;
        created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
        amount = requiredIcpE8s;
      });
    } catch (error) {
      return #err(remoteCallFailed(#TransferIcpToCmc, Error.message(error), null));
    };
    let blockIndex = switch (transferResult) {
      case (#Ok(idx)) idx;
      case (#Err(err)) return #err(#TransferFailed(err));
    };

    // Step 4: Notify CMC to create canister
    let notifyArg : CMCTypes.NotifyCreateCanisterArg = {
      controller = deployerCanisterId;
      block_index = Nat64.fromNat(blockIndex);
      subnet_selection = subnetSelection;
      settings = ?canisterSettings;
      subnet_type = null;
    };
    let result = try {
      await cmc.notify_create_canister(notifyArg);
    } catch (error) {
      return #err(remoteCallFailed(#NotifyCmcCreateCanister, Error.message(error), ?blockIndex));
    };
    switch (result) {
      case (#Ok(canisterId)) #ok({ canisterId; fundedFromReserve = false });
      case (#Err(err)) #err(#NotifyFailed({ err; blockIndex }));
    };
  };
};
