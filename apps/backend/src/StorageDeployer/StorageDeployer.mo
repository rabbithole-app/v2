import Principal "mo:core/Principal";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Blob "mo:core/Blob";

import ByteUtils "mo:byte-utils";

import CMCTypes "../Types/CMCTypes";
import LedgerTypes "../Types/LedgerTypes";
import Account "Utils/Account";
import Types "Types";

module {
  let CYCLE_MINTING_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";
  let LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

  let CYCLES_PER_XDR : Nat = 1_000_000_000_000;
  let PERMYRIAD : Nat = 10_000;
  let E8S_PER_ICP = 100_000_000;
  let MEMO_CREATE_CANISTER : LedgerTypes.Memo = 0x41455243;
  let FEE : Nat = 10_000;
  let CANISTER_CREATION_COST : Nat = 500_000_000_000;

  public type CreateCanisterError = {
    #InsufficientBalance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.Icrc1TransferError;
    #NotifyFailed : CMCTypes.NotifyError;
  };

  /// Transfer ICP to CMC and create a new canister. Funding sources, in order:
  ///   1. User's derived ICP subaccount (legacy flow — user deposits ICP directly)
  ///   2. Backend's default ICP account (application treasury — funded by admin,
  ///      covers users who paid in SOL/ETH/USDC via chargeAndDistribute)
  /// Picks the first source with enough balance. If neither has enough → #InsufficientBalance
  /// reports the larger of the two balances so admin sees actionable info.
  public func transferAndCreateCanister(
    deployerCanisterId : Principal,
    caller : Principal,
    initialCycles : Nat,
    subnetId : ?Principal,
    environmentVariables : ?[{ name : Text; value : Text }],
  ) : async Result.Result<Principal, CreateCanisterError> {
    let ledger = actor (LEDGER_CANISTER_ID) : LedgerTypes.Self;
    let cmc = actor (CYCLE_MINTING_CANISTER_ID) : CMCTypes.Self;

    // --- Step 1: Calculate required ICP ---
    let totalCycles = initialCycles + CANISTER_CREATION_COST;
    let rateResponse = await cmc.get_icp_xdr_conversion_rate();
    let xdrPermyriadPerIcp = Nat64.toNat(rateResponse.data.xdr_permyriad_per_icp);
    let numerator = totalCycles * PERMYRIAD * E8S_PER_ICP;
    let denominator = CYCLES_PER_XDR * xdrPermyriadPerIcp;
    let requiredIcpE8s = numerator / denominator;
    let totalRequired = requiredIcpE8s + FEE;

    // --- Step 2: Pick funding source — user subaccount first, then backend treasury ---
    let userSubaccount = Account.principalToSubaccount(caller);
    let userBalance = await ledger.icrc1_balance_of({
      owner = deployerCanisterId;
      subaccount = ?userSubaccount;
    });
    let fromSubaccount : ?Blob = if (userBalance >= totalRequired) {
      ?userSubaccount;
    } else {
      let treasuryBalance = await ledger.icrc1_balance_of({
        owner = deployerCanisterId;
        subaccount = null;
      });
      if (treasuryBalance >= totalRequired) {
        null; // default subaccount
      } else {
        let available = if (treasuryBalance > userBalance) treasuryBalance else userBalance;
        return #err(#InsufficientBalance({
          required = totalRequired;
          available;
        }));
      };
    };

    // --- Step 3: Transfer ICP from chosen source to CMC ---
    let memoBlob = ByteUtils.LE.fromNat64(MEMO_CREATE_CANISTER) |> Blob.fromArray(_);
    let cmcSubaccount = Account.principalToSubaccount(deployerCanisterId);
    let transferResult = await ledger.icrc1_transfer({
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
    let blockIndex = switch (transferResult) {
      case (#Ok(idx)) idx;
      case (#Err(err)) return #err(#TransferFailed(err));
    };

    // --- Step 4: Notify CMC to create canister ---
    let subnetSelection : ?CMCTypes.SubnetSelection = switch (subnetId) {
      case (?subnet) ?#Subnet({ subnet });
      case null null;
    };
    let notifyArg : CMCTypes.NotifyCreateCanisterArg = {
      controller = deployerCanisterId;
      block_index = Nat64.fromNat(blockIndex);
      subnet_selection = subnetSelection;
      settings = ?{
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
      subnet_type = null;
    };
    let result = await cmc.notify_create_canister(notifyArg);
    switch (result) {
      case (#Ok(canisterId)) #ok(canisterId);
      case (#Err(err)) #err(#NotifyFailed(err));
    };
  };
};
