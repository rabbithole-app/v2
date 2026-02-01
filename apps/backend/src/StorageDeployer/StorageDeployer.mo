import Principal "mo:core/Principal";
import Queue "mo:core/Queue";
import Map "mo:core/Map";
import Set "mo:core/Set";
import Runtime "mo:core/Runtime";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import Int64 "mo:core/Int64";
import Float "mo:core/Float";
import Result "mo:core/Result";
import Error "mo:core/Error";
import Blob "mo:core/Blob";

import MemoryRegion "mo:memory-region/MemoryRegion";
import IC "mo:ic";
import ByteUtils "mo:byte-utils";

import CMCTypes "CMCTypes";
import LedgerTypes "LedgerTypes";
import Account "Utils/Account";
import Types "Types";

module {
  let CYCLE_MINTING_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";
  let LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";

  let CYCLES_PER_XDR : Nat = 1_000_000_000_000; // 1 trillion cycles = 1 XDR
  let PERMYRIAD : Nat = 10_000; // 10,000 (used in xdr_permyriad_per_icp)
  let E8S_PER_ICP = 100_000_000; // 1 ICP = 100,000,000 e8s
  let MEMO_CREATE_CANISTER : LedgerTypes.Memo = 0x41455243; // == 'CREA'
  let FEE : Nat = 10_000;
  let CANISTER_CREATION_COST : Nat = 500_000_000_000; // 0.5 TCycles (500 billion cycles)

  public type StorageCreation = {
    owner : Principal;
    var canisterId : ?Principal;
    var status : Status;
    createdAt : Time.Time;
    var updatedAt : Time.Time;
  };

  public type Status = {
    #Pending;
    #CheckingAllowance;
    #TransferringICP : { amount : Nat }; // ICP e8s being transferred
    #NotifyingCMC : { blockIndex : Nat }; // Waiting for CMC to create canister
    #CanisterCreated : { canisterId : Principal }; // Canister created, ready for WASM
    #InstallingWasm : { canisterId : Principal; progress : Nat }; // Installing WASM module
    #UploadingFrontend : {
      canisterId : Principal;
      totalChunks : Nat;
      uploadedChunks : Nat;
    }; // Uploading frontend assets
    #UpdatingControllers : { canisterId : Principal }; // Removing deployer from controllers
    #Completed : { canisterId : Principal }; // Everything done
    #Failed : Text; // Error occurred
  };

  public type TransferICPError = {
    #InsufficientAllowance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.TransferFromError;
  };

  public type CreateStorageOptions = Types.CreateStorageOptions;
  public type TargetCanister = Types.TargetCanister;

  public type CreateStorageError = {
    #InsufficientAllowance : { required : Nat; available : Nat };
    #TransferFailed : LedgerTypes.TransferFromError;
    #NotifyFailed : CMCTypes.NotifyError;
    #UpdateSettingsFailed : Text;
    #AlreadyInProgress;
    #NotFound;
  };

  public type CreateStorageResult = Result.Result<Principal, CreateStorageError>;

  public type Store = {
    var canisterId : ?Principal; // This canister's ID
    region : MemoryRegion.MemoryRegion;
    creations : Map.Map<Principal, StorageCreation>; // user → creation state
  };

  public func new(region : MemoryRegion.MemoryRegion) : Store {
    {
      region;
      creations = Map.empty<Principal, StorageCreation>();
      var canisterId = null;
    };
  };

  // Helper: Update status and timestamp
  func updateStatus(creation : StorageCreation, newStatus : Status) {
    creation.status := newStatus;
    creation.updatedAt := Time.now();
  };

  // Get current status for a user
  public func getStatus(store : Store, caller : Principal) : ?Status {
    switch (Map.get(store.creations, Principal.compare, caller)) {
      case (?creation) ?creation.status;
      case null null;
    };
  };

  // Start the storage creation process
  // This is the main entry point that users call from frontend
  public func createStorage(store : Store, caller : Principal, options : CreateStorageOptions) : async CreateStorageResult {
    // Check if already in progress
    switch (Map.get(store.creations, Principal.compare, caller)) {
      case (?existing) {
        switch (existing.status) {
          case (#Completed _) {}; // Allow creating another one
          case (#Failed _) {}; // Allow retry
          case _ return #err(#AlreadyInProgress); // Still in progress
        };
      };
      case null {};
    };

    let now = Time.now();
    let existingCanisterId = switch (options.target) {
      case (#Existing(id)) ?id;
      case (#Create(_)) null;
    };
    let creation : StorageCreation = {
      owner = caller;
      var canisterId = existingCanisterId;
      var status = #Pending;
      createdAt = now;
      var updatedAt = now;
    };

    // Store the creation state
    ignore Map.insert(store.creations, Principal.compare, caller, creation);

    // Execute the creation steps
    await executeCreation(store, creation, caller, options);
  };

  // Execute the storage creation process with all steps
  func executeCreation(
    store : Store,
    creation : StorageCreation,
    caller : Principal,
    options : CreateStorageOptions,
  ) : async CreateStorageResult {
    let deployerCanisterId = switch (store.canisterId) {
      case (?id) id;
      case null return #err(#TransferFailed(#GenericError({ error_code = 0; message = "Deployer canister ID not set" })));
    };

    // Handle based on target type
    let canisterId = switch (options.target) {
      case (#Existing(existingCanisterId)) {
        // User is linking existing canister
        updateStatus(creation, #CanisterCreated({ canisterId = existingCanisterId }));
        existingCanisterId;
      };
      case (#Create({ initialCycles; subnetId })) {
        // Need to create new canister via ICP transfer and CMC

        // Step 1: Check allowance and transfer ICP
        updateStatus(creation, #CheckingAllowance);

        let transferResult = await transferICP(store, caller, initialCycles);
        switch (transferResult) {
          case (#err err) {
            updateStatus(creation, #Failed("Transfer failed"));
            switch (err) {
              case (#InsufficientAllowance(details)) return #err(#InsufficientAllowance(details));
              case (#TransferFailed(transferErr)) return #err(#TransferFailed(transferErr));
            };
          };
          case (#ok blockIndex) {
            updateStatus(creation, #NotifyingCMC({ blockIndex }));

            // Step 2: Notify CMC to create canister with user as controller
            let createResult = await notifyCreateCanister(deployerCanisterId, caller, blockIndex, subnetId);
            switch (createResult) {
              case (#err err) {
                updateStatus(creation, #Failed("CMC notification failed"));
                return #err(#NotifyFailed(err));
              };
              case (#ok newCanisterId) {
                creation.canisterId := ?newCanisterId;
                updateStatus(creation, #CanisterCreated({ canisterId = newCanisterId }));
                newCanisterId;
              };
            };
          };
        };
      };
    };

    // TODO: Step 3 will be installing WASM
    // TODO: Step 4 will be uploading frontend
    // TODO: Step 5 will be removing deployer from controllers

    // For now, mark as completed
    updateStatus(creation, #Completed({ canisterId }));
    return #ok(canisterId);
  };

  // Notify CMC to create a canister after ICP transfer
  // Sets both deployer and user as controllers
  func notifyCreateCanister(
    deployerCanisterId : Principal,
    userPrincipal : Principal,
    blockIndex : Nat,
    subnetId : ?Principal,
  ) : async Result.Result<Principal, CMCTypes.NotifyError> {
    let cmc = actor (CYCLE_MINTING_CANISTER_ID) : CMCTypes.Self;

    let subnetSelection : ?CMCTypes.SubnetSelection = switch (subnetId) {
      case (?subnet) ?#Subnet({ subnet });
      case null null;
    };

    let notifyArg : CMCTypes.NotifyCreateCanisterArg = {
      controller = deployerCanisterId;
      block_index = Nat64.fromNat(blockIndex);
      subnet_selection = subnetSelection;
      settings = ?{
        controllers = ?[deployerCanisterId, userPrincipal]; // Both as controllers
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
      case (#Ok canisterId) #ok(canisterId);
      case (#Err err) #err(err);
    };
  };

  // Update canister settings to remove deployer from controllers
  // This should be called after WASM installation and frontend upload are complete
  func updateCanisterSettings(
    storageCanisterId : Principal,
    userPrincipal : Principal,
  ) : async Result.Result<(), Text> {
    let ic = actor ("aaaaa-aa") : IC.Service;

    try {
      await ic.update_settings({
        canister_id = storageCanisterId;
        sender_canister_version = null;
        settings = {
          controllers = ?[userPrincipal]; // Only user as controller now
          freezing_threshold = null;
          wasm_memory_threshold = null;
          reserved_cycles_limit = null;
          log_visibility = null;
          wasm_memory_limit = null;
          memory_allocation = null;
          compute_allocation = null;
        };
      });
      #ok(());
    } catch (error) {
      #err("Failed to update settings: " # Error.message(error));
    };
  };

  // Transfers ICP from user to CMC for canister creation
  // Parameters:
  //   - store: Storage containing canister state
  //   - caller: User's Principal who approved the allowance
  //   - initialCycles: Amount of cycles the new canister should start with
  // Returns:
  //   - #Ok(blockIndex) if transfer succeeded
  //   - #Err(error) if allowance is insufficient or transfer failed
  func transferICP(store : Store, caller : Principal, initialCycles : Nat) : async Result.Result<Nat, TransferICPError> {
    let ledger = actor (LEDGER_CANISTER_ID) : LedgerTypes.Self;
    let canisterId = switch (store.canisterId) {
      case (?canisterId) canisterId;
      case (null) Runtime.unreachable();
    };

    // Calculate total cycles needed (initial + creation cost)
    let totalCycles = initialCycles + CANISTER_CREATION_COST;

    // Convert cycles to ICP e8s
    let requiredIcpE8s = await cyclesToICPE8s(totalCycles);
    let totalRequired = requiredIcpE8s + FEE; // Include fee in calculation

    // Check allowance
    let spenderAccount : LedgerTypes.Account = {
      owner = canisterId;
      subaccount = ?Account.principalToSubaccount(caller);
    };

    let allowanceResponse = await ledger.icrc2_allowance({
      account = {
        owner = caller;
        subaccount = null;
      };
      spender = spenderAccount;
    });

    // Verify sufficient allowance
    if (allowanceResponse.allowance < totalRequired) {
      return #err(
        #InsufficientAllowance({
          required = totalRequired;
          available = allowanceResponse.allowance;
        })
      );
    };

    // Perform transfer
    // For ICRC-2 ledger with CMC notify_create_canister:
    // - memo must be 8 bytes representing 0x41455243 as little-endian Nat64
    // - subaccount should encode the deployer canister principal
    //
    // CMC interprets the 8-byte memo blob as little-endian Nat64
    // To get the value 0x41455243, we need: [0x43, 0x52, 0x45, 0x41, 0x00, 0x00, 0x00, 0x00]
    // This way when CMC reads it as LE64, it gets: 0x0000000041455243 = 1094861635
    // let memoBytes : [Nat8] = [
    //   0x43, 0x52, 0x45, 0x41, // Lower 4 bytes: 0x41455243 in little-endian
    //   0x00, 0x00, 0x00, 0x00 // Upper 4 bytes: padding
    // ];
    let memoBlob = ByteUtils.LE.fromNat64(MEMO_CREATE_CANISTER) |> Blob.fromArray(_);
    let cmcSubaccount = Account.principalToSubaccount(canisterId);

    let transferResult = await ledger.icrc2_transfer_from({
      to = {
        owner = Principal.fromText(CYCLE_MINTING_CANISTER_ID);
        subaccount = ?cmcSubaccount;
      };
      fee = ?FEE;
      spender_subaccount = ?Account.principalToSubaccount(caller);
      from = {
        owner = caller;
        subaccount = null;
      };
      memo = ?memoBlob;
      created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
      amount = requiredIcpE8s;
    });

    switch (transferResult) {
      case (#Ok blockIndex) #ok(blockIndex);
      case (#Err err) #err(#TransferFailed(err));
    };
  };

  // Converts cycles to ICP e8s using the current XDR/ICP exchange rate
  // Formula: ICP_e8s = (cycles / CYCLES_PER_XDR) * (PERMYRIAD / xdr_permyriad_per_icp) * E8S_PER_ICP
  // Where: CYCLES_PER_XDR = 1 trillion (10^12), PERMYRIAD = 10,000
  func cyclesToICPE8s(cycles : Nat) : async Nat {
    let cmc = actor (CYCLE_MINTING_CANISTER_ID) : CMCTypes.Self;
    let rateResponse = await cmc.get_icp_xdr_conversion_rate();
    let xdrPermyriadPerIcp = Nat64.toNat(rateResponse.data.xdr_permyriad_per_icp);

    // Calculate: ICP_e8s = (cycles * PERMYRIAD * E8S_PER_ICP) / (CYCLES_PER_XDR * xdr_permyriad_per_icp)
    // We multiply first to avoid precision loss from integer division
    let numerator = cycles * PERMYRIAD * E8S_PER_ICP;
    let denominator = CYCLES_PER_XDR * xdrPermyriadPerIcp;

    numerator / denominator;
  };
};
