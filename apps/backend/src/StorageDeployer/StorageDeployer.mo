import Principal "mo:core/Principal";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Result "mo:core/Result";
import Blob "mo:core/Blob";

import ByteUtils "mo:byte-utils";

import CMCTypes "CMCTypes";
import LedgerTypes "LedgerTypes";
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
    #InsufficientAllowance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.TransferFromError;
    #NotifyFailed : CMCTypes.NotifyError;
  };

  /// Transfer ICP to CMC and create a new canister.
  /// All inter-canister calls are inlined to avoid nested self-calls.
  public func transferAndCreateCanister(
    deployerCanisterId : Principal,
    caller : Principal,
    initialCycles : Nat,
    subnetId : ?Principal,
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

    // --- Step 2: Check allowance ---
    let spenderAccount : LedgerTypes.Account = {
      owner = deployerCanisterId;
      subaccount = ?Account.principalToSubaccount(caller);
    };
    let allowanceResponse = await ledger.icrc2_allowance({
      account = { owner = caller; subaccount = null };
      spender = spenderAccount;
    });
    if (allowanceResponse.allowance < totalRequired) {
      return #err(#InsufficientAllowance({
        required = totalRequired;
        available = allowanceResponse.allowance;
      }));
    };

    // --- Step 3: Transfer ICP to CMC ---
    let memoBlob = ByteUtils.LE.fromNat64(MEMO_CREATE_CANISTER) |> Blob.fromArray(_);
    let cmcSubaccount = Account.principalToSubaccount(deployerCanisterId);
    let transferResult = await ledger.icrc2_transfer_from({
      to = {
        owner = Principal.fromText(CYCLE_MINTING_CANISTER_ID);
        subaccount = ?cmcSubaccount;
      };
      fee = ?FEE;
      spender_subaccount = ?Account.principalToSubaccount(caller);
      from = { owner = caller; subaccount = null };
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
        environment_variables = null;
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
