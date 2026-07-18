import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";

import BaseX "mo:base-x-encoder";
import { ic } "mo:ic";
import IC "mo:ic/Types";
import Json "mo:json";

import SolTx "SolTx";

module SolRpc {

  // ---- Cycles costs ----

  let SCHNORR_SIGN_CYCLES : Nat = 26_153_846_153;
  let SOL_RPC_CYCLES : Nat = 2_000_000_000;

  // ---- IcSchnorrApi adapter ----

  public class IcSchnorrApi() {
    public let create = func(
      keyName : Text,
      derivationPath : [Blob],
    ) : async* Blob {
      let res = await ic.schnorr_public_key({
        canister_id = null;
        derivation_path = derivationPath;
        key_id = { algorithm = #ed25519; name = keyName };
      });
      res.public_key;
    };

    public let sign = func(
      keyName : Text,
      derivationPath : [Blob],
      message : Blob,
    ) : async* Blob {
      let res = await (with cycles = SCHNORR_SIGN_CYCLES) ic.sign_with_schnorr({
        message;
        derivation_path = derivationPath;
        key_id = { algorithm = #ed25519; name = keyName };
        aux = null;
      });
      res.signature;
    };
  };

  public func createSchnorrApi() : IcSchnorrApi {
    IcSchnorrApi();
  };

  // ---- SOL RPC canister types (matches sol_rpc_canister.did) ----

  public type SolanaCluster = {
    #Mainnet;
    #Devnet;
    #Testnet;
  };

  public type CommitmentLevel = {
    #processed;
    #confirmed;
    #finalized;
  };

  public type HttpHeader = { name : Text; value : Text };
  public type RpcEndpoint = { url : Text; headers : ?[HttpHeader] };

  public type SupportedProvider = {
    #AlchemyMainnet;
    #AlchemyDevnet;
    #AnkrMainnet;
    #AnkrDevnet;
    #ChainstackMainnet;
    #ChainstackDevnet;
    #DrpcMainnet;
    #DrpcDevnet;
    #HeliusMainnet;
    #HeliusDevnet;
    #PublicNodeMainnet;
  };

  public type RpcSource = {
    #Supported : SupportedProvider;
    #Custom : RpcEndpoint;
  };

  public type RpcSources = {
    #Custom : [RpcSource];
    #Default : SolanaCluster;
  };

  public type ConsensusStrategy = {
    #Equality;
    #Threshold : { total : ?Nat8; min : Nat8 };
  };

  public type RpcConfig = {
    responseSizeEstimate : ?Nat64;
    responseConsensus : ?ConsensusStrategy;
  };

  public type RejectionCode = {
    #NoError;
    #CanisterError;
    #SysTransient;
    #DestinationInvalid;
    #Unknown;
    #SysFatal;
    #CanisterReject;
  };

  public type JsonRpcError = { code : Int64; message : Text };

  public type HttpOutcallError = {
    #IcError : { code : RejectionCode; message : Text };
    #InvalidHttpJsonRpcResponse : {
      status : Nat16;
      body : Text;
      parsingError : ?Text;
    };
  };

  public type ProviderError = {
    #TooFewCycles : { expected : Nat; received : Nat };
    #InvalidRpcConfig : Text;
    #UnsupportedCluster : Text;
  };

  public type RpcError = {
    #JsonRpcError : JsonRpcError;
    #ProviderError : ProviderError;
    #ValidationError : Text;
    #HttpOutcallError : HttpOutcallError;
  };

  // ---- Method-specific types ----

  public type Lamport = Nat64;
  public type Slot = Nat64;
  public type Signature = Text;
  public type Pubkey = Text;

  // getBalance
  public type GetBalanceParams = {
    pubkey : Pubkey;
    commitment : ?CommitmentLevel;
    minContextSlot : ?Slot;
  };
  public type GetBalanceResult = { #Ok : Lamport; #Err : RpcError };
  public type MultiGetBalanceResult = {
    #Consistent : GetBalanceResult;
    #Inconsistent : [(RpcSource, GetBalanceResult)];
  };

  // getTokenAccountBalance
  public type TokenAmount = {
    decimals : Nat8;
    uiAmount : ?Float;
    uiAmountString : Text;
    amount : Text;
  };
  public type GetTokenAccountBalanceParams = {
    pubkey : Pubkey;
    commitment : ?CommitmentLevel;
  };
  public type GetTokenAccountBalanceResult = { #Ok : TokenAmount; #Err : RpcError };
  public type MultiGetTokenAccountBalanceResult = {
    #Consistent : GetTokenAccountBalanceResult;
    #Inconsistent : [(RpcSource, GetTokenAccountBalanceResult)];
  };

  // sendTransaction
  public type SendTransactionEncoding = {
    #base58;
    #base64;
  };
  public type SendTransactionParams = {
    transaction : Text;
    encoding : ?SendTransactionEncoding;
    skipPreflight : ?Bool;
    preflightCommitment : ?CommitmentLevel;
    maxRetries : ?Nat32;
    minContextSlot : ?Slot;
  };
  public type SendTransactionResult = { #Ok : Signature; #Err : RpcError };
  public type MultiSendTransactionResult = {
    #Consistent : SendTransactionResult;
    #Inconsistent : [(RpcSource, SendTransactionResult)];
  };

  // getSignatureStatuses
  public type TransactionError = Text;
  public type TransactionConfirmationStatus = {
    #processed;
    #confirmed;
    #finalized;
  };
  public type TransactionStatus = {
    slot : Slot;
    status : { #Ok; #Err : TransactionError };
    err : ?TransactionError;
    confirmationStatus : ?TransactionConfirmationStatus;
  };
  public type GetSignatureStatusesParams = {
    signatures : [Signature];
    searchTransactionHistory : ?Bool;
  };
  public type GetSignatureStatusesResult = { #Ok : [?TransactionStatus]; #Err : RpcError };
  public type MultiGetSignatureStatusesResult = {
    #Consistent : GetSignatureStatusesResult;
    #Inconsistent : [(RpcSource, GetSignatureStatusesResult)];
  };

  // getSlot
  public type GetSlotParams = {
    commitment : ?CommitmentLevel;
    minContextSlot : ?Slot;
  };
  public type GetSlotRpcConfig = {
    responseSizeEstimate : ?Nat64;
    responseConsensus : ?ConsensusStrategy;
    slotRoundingError : ?Nat64;
  };
  public type GetSlotResult = { #Ok : Slot; #Err : RpcError };
  public type MultiGetSlotResult = {
    #Consistent : GetSlotResult;
    #Inconsistent : [(RpcSource, GetSlotResult)];
  };

  // jsonRequest
  public type RequestResult = { #Ok : Text; #Err : RpcError };
  public type MultiRequestResult = {
    #Consistent : RequestResult;
    #Inconsistent : [(RpcSource, RequestResult)];
  };

  // ---- SOL RPC canister actor interface ----

  type SolRpcCanister = actor {
    getBalance : (RpcSources, ?RpcConfig, GetBalanceParams) -> async MultiGetBalanceResult;
    getTokenAccountBalance : (RpcSources, ?RpcConfig, GetTokenAccountBalanceParams) -> async MultiGetTokenAccountBalanceResult;
    getSlot : (RpcSources, ?GetSlotRpcConfig, ?GetSlotParams) -> async MultiGetSlotResult;
    sendTransaction : (RpcSources, ?RpcConfig, SendTransactionParams) -> async MultiSendTransactionResult;
    getSignatureStatuses : (RpcSources, ?RpcConfig, GetSignatureStatusesParams) -> async MultiGetSignatureStatusesResult;
    jsonRequest : (RpcSources, ?RpcConfig, Text) -> async MultiRequestResult;
  };

  // ---- Public API ----

  /// Derive a Solana address + public key from a Principal using threshold Schnorr (Ed25519).
  public func deriveSolAddress(
    keyName : Text,
    principal : Principal,
    api : IcSchnorrApi,
  ) : async* Result.Result<(Text, [Nat8]), Text> {
    let derivationPath = [Principal.toBlob(principal)];
    try {
      let pubKeyBlob = await* api.create(keyName, derivationPath);
      let pubKeyBytes = Blob.toArray(pubKeyBlob);
      let address = BaseX.toBase58(pubKeyBytes.vals());
      #ok((address, pubKeyBytes));
    } catch (e) {
      #err("deriveSolAddress failed: " # Error.message(e));
    };
  };

  /// Derive the Solana address of the Treasury canister itself (empty derivation path).
  public func deriveTreasurySolAddress(
    keyName : Text,
    api : IcSchnorrApi,
  ) : async* Result.Result<(Text, [Nat8]), Text> {
    try {
      let pubKeyBlob = await* api.create(keyName, []);
      let pubKeyBytes = Blob.toArray(pubKeyBlob);
      let address = BaseX.toBase58(pubKeyBytes.vals());
      #ok((address, pubKeyBytes));
    } catch (e) {
      #err("deriveTreasurySolAddress failed: " # Error.message(e));
    };
  };

  /// Get SOL balance for an address (in lamports).
  public func getBalance(
    solRpcCanisterId : Text,
    rpcSources : RpcSources,
    address : Text,
  ) : async* Result.Result<Nat64, Text> {
    let solRpc : SolRpcCanister = actor (solRpcCanisterId);
    let result = await (with cycles = SOL_RPC_CYCLES) solRpc.getBalance(
      rpcSources,
      null,
      { pubkey = address; commitment = ?#confirmed; minContextSlot = null },
    );
    switch (result) {
      case (#Consistent(#Ok(lamports))) #ok(lamports);
      case (#Consistent(#Err(err))) #err("getBalance error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getBalance: inconsistent RPC results");
    };
  };

  /// Get SPL token balance for a token account address.
  public func getTokenAccountBalance(
    solRpcCanisterId : Text,
    rpcSources : RpcSources,
    tokenAccountAddress : Text,
  ) : async* Result.Result<Nat, Text> {
    let solRpc : SolRpcCanister = actor (solRpcCanisterId);
    let result = await (with cycles = SOL_RPC_CYCLES) solRpc.getTokenAccountBalance(
      rpcSources,
      null,
      { pubkey = tokenAccountAddress; commitment = ?#confirmed },
    );
    switch (result) {
      case (#Consistent(#Ok(tokenAmount))) {
        // Parse the amount string to Nat
        switch (textToNat(tokenAmount.amount)) {
          case (?n) #ok(n);
          case null #err("getTokenAccountBalance: failed to parse amount: " # tokenAmount.amount);
        };
      };
      case (#Consistent(#Err(err))) #err("getTokenAccountBalance error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getTokenAccountBalance: inconsistent RPC results");
    };
  };

  /// The blockhash changes every slot (~400ms) and the response carries the
  /// provider's own context.slot, so multi-provider equality consensus over
  /// the raw JSON practically never succeeds. Query providers one at a time
  /// instead, falling back to the next on failure. A single source is safe
  /// here: a bogus blockhash can only make the transaction fail, it cannot
  /// redirect funds (we build and sign the instructions ourselves).
  func blockhashSourceCandidates(rpcSources : RpcSources) : [RpcSources] {
    switch (rpcSources) {
      case (#Custom(sources)) Array.map<RpcSource, RpcSources>(sources, func(s) = #Custom([s]));
      case (#Default(#Mainnet)) [
        #Custom([#Supported(#AlchemyMainnet)]),
        #Custom([#Supported(#HeliusMainnet)]),
        #Custom([#Supported(#DrpcMainnet)]),
      ];
      case (#Default(#Devnet)) [
        #Custom([#Supported(#AlchemyDevnet)]),
        #Custom([#Supported(#HeliusDevnet)]),
        #Custom([#Supported(#DrpcDevnet)]),
      ];
      case (#Default(#Testnet)) [#Default(#Testnet)];
    };
  };

  /// Get the latest blockhash via jsonRequest (getLatestBlockhash is not in the canister interface).
  public func getLatestBlockhash(
    solRpcCanisterId : Text,
    rpcSources : RpcSources,
  ) : async* Result.Result<[Nat8], Text> {
    var lastError = "getLatestBlockhash: no RPC sources";
    for (sources in blockhashSourceCandidates(rpcSources).vals()) {
      switch (await* getLatestBlockhashFromSource(solRpcCanisterId, sources)) {
        case (#ok(blockhash)) return #ok(blockhash);
        case (#err(e)) lastError := e;
      };
    };
    #err(lastError);
  };

  func getLatestBlockhashFromSource(
    solRpcCanisterId : Text,
    rpcSources : RpcSources,
  ) : async* Result.Result<[Nat8], Text> {
    let solRpc : SolRpcCanister = actor (solRpcCanisterId);
    let payload = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getLatestBlockhash\",\"params\":[{\"commitment\":\"confirmed\"}]}";
    let result = await (with cycles = SOL_RPC_CYCLES) solRpc.jsonRequest(
      rpcSources,
      null,
      payload,
    );
    switch (result) {
      case (#Consistent(#Ok(json))) {
        // Parse blockhash from JSON response: {"result":{"value":{"blockhash":"..."}}}
        switch (extractBlockhashFromJson(json)) {
          case (?hash) {
            switch (BaseX.fromBase58(hash)) {
              case (#ok(bytes)) {
                if (bytes.size() == 32) #ok(bytes)
                else #err("getLatestBlockhash: unexpected blockhash length: " # debug_show (bytes.size()));
              };
              case (#err(e)) #err("getLatestBlockhash: invalid base58 blockhash: " # e);
            };
          };
          case null #err("getLatestBlockhash: failed to parse response: " # json);
        };
      };
      case (#Consistent(#Err(err))) #err("getLatestBlockhash error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getLatestBlockhash: inconsistent RPC results");
    };
  };

  /// Send a signed Solana transaction (base64-encoded).
  public func sendTransaction(
    solRpcCanisterId : Text,
    rpcSources : RpcSources,
    signedTxBase64 : Text,
  ) : async* Result.Result<Text, Text> {
    let solRpc : SolRpcCanister = actor (solRpcCanisterId);
    let result = await (with cycles = SOL_RPC_CYCLES) solRpc.sendTransaction(
      rpcSources,
      null,
      {
        transaction = signedTxBase64;
        encoding = ?#base64;
        skipPreflight = ?false;
        preflightCommitment = ?#confirmed;
        maxRetries = null;
        minContextSlot = null;
      },
    );
    switch (result) {
      case (#Consistent(#Ok(sig))) #ok(sig);
      case (#Consistent(#Err(err))) #err("sendTransaction error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("sendTransaction: inconsistent RPC results");
    };
  };

  /// Check signature statuses for confirmation.
  public func getSignatureStatuses(
    solRpcCanisterId : Text,
    rpcSources : RpcSources,
    signatures : [Text],
  ) : async* Result.Result<[?TransactionStatus], Text> {
    let solRpc : SolRpcCanister = actor (solRpcCanisterId);
    let result = await (with cycles = SOL_RPC_CYCLES) solRpc.getSignatureStatuses(
      rpcSources,
      null,
      { signatures; searchTransactionHistory = ?true },
    );
    switch (result) {
      case (#Consistent(#Ok(statuses))) #ok(statuses);
      case (#Consistent(#Err(err))) #err("getSignatureStatuses error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getSignatureStatuses: inconsistent RPC results");
    };
  };

  // ---- High-level transfer functions ----

  /// Send a native SOL transfer. Returns the transaction signature.
  public func sendSolTransfer(
    args : {
      solRpcCanisterId : Text;
      rpcSources : RpcSources;
      schnorrKeyName : Text;
      derivationPath : [Blob];
      senderPubKey : [Nat8];
      toAddress : Text;
      lamports : Nat64;
    },
    api : IcSchnorrApi,
  ) : async* Result.Result<Text, Text> {
    let toBytes = SolTx.addressToBytes(args.toAddress);

    // Get recent blockhash
    let blockhash = switch (await* getLatestBlockhash(args.solRpcCanisterId, args.rpcSources)) {
      case (#ok(bh)) bh;
      case (#err(e)) return #err("Failed to get blockhash: " # e);
    };

    // Build message
    let message = SolTx.buildSolTransferMessage({
      from = args.senderPubKey;
      to = toBytes;
      lamports = args.lamports;
      recentBlockhash = blockhash;
    });

    // Sign
    let signature = try {
      await* api.sign(args.schnorrKeyName, args.derivationPath, Blob.fromArray(message));
    } catch (e) {
      return #err("sign_with_schnorr failed: " # Error.message(e));
    };
    let sigBytes = Blob.toArray(signature);

    // Build full transaction
    let tx = SolTx.wrapSignedTransaction(message, sigBytes);

    // Encode as base64 and send
    let txBase64 = BaseX.toBase64(tx.vals(), #standard({ includePadding = true }));
    await* sendTransaction(args.solRpcCanisterId, args.rpcSources, txBase64);
  };

  /// Send an SPL token transfer (TransferChecked). Returns the transaction signature.
  public func sendSplTransfer(
    args : {
      solRpcCanisterId : Text;
      rpcSources : RpcSources;
      schnorrKeyName : Text;
      derivationPath : [Blob];
      senderPubKey : [Nat8];
      mintAddress : Text;
      toAddress : Text;
      amount : Nat64;
      decimals : Nat8;
    },
    api : IcSchnorrApi,
  ) : async* Result.Result<Text, Text> {
    let mintBytes = SolTx.addressToBytes(args.mintAddress);
    let toBytes = SolTx.addressToBytes(args.toAddress);

    // Derive ATAs
    let sourceAta = SolTx.deriveAta(args.senderPubKey, mintBytes);
    let destAta = SolTx.deriveAta(toBytes, mintBytes);

    // Get recent blockhash
    let blockhash = switch (await* getLatestBlockhash(args.solRpcCanisterId, args.rpcSources)) {
      case (#ok(bh)) bh;
      case (#err(e)) return #err("Failed to get blockhash: " # e);
    };

    // Build message
    let message = SolTx.buildSplTransferMessage({
      authority = args.senderPubKey;
      sourceAta;
      destAta;
      mint = mintBytes;
      amount = args.amount;
      decimals = args.decimals;
      recentBlockhash = blockhash;
    });

    // Sign
    let signature = try {
      await* api.sign(args.schnorrKeyName, args.derivationPath, Blob.fromArray(message));
    } catch (e) {
      return #err("sign_with_schnorr failed: " # Error.message(e));
    };
    let sigBytes = Blob.toArray(signature);

    // Build full transaction
    let tx = SolTx.wrapSignedTransaction(message, sigBytes);

    // Encode as base64 and send
    let txBase64 = BaseX.toBase64(tx.vals(), #standard({ includePadding = true }));
    await* sendTransaction(args.solRpcCanisterId, args.rpcSources, txBase64);
  };

  // ---- Internal helpers ----

  func rpcErrorToText(err : RpcError) : Text {
    switch (err) {
      case (#JsonRpcError({ code; message })) "JsonRpcError(" # debug_show (code) # "): " # message;
      case (#ProviderError(#TooFewCycles({ expected; received }))) "TooFewCycles: expected " # debug_show (expected) # ", received " # debug_show (received);
      case (#ProviderError(#InvalidRpcConfig(msg))) "InvalidRpcConfig: " # msg;
      case (#ProviderError(#UnsupportedCluster(msg))) "UnsupportedCluster: " # msg;
      case (#ValidationError(msg)) "ValidationError: " # msg;
      case (#HttpOutcallError(#IcError({ code = _; message }))) "IcError: " # message;
      case (#HttpOutcallError(#InvalidHttpJsonRpcResponse({ status; body; parsingError = _ }))) "InvalidHttpJsonRpcResponse(status=" # debug_show (status) # "): " # body;
    };
  };

  /// Extract blockhash from JSON response.
  /// SOL RPC canister returns the "result" payload directly: {"value":{"blockhash":"..."}}
  func extractBlockhashFromJson(jsonText : Text) : ?Text {
    switch (Json.parse(jsonText)) {
      case (#ok(data)) {
        switch (Json.getAsText(data, "value.blockhash")) {
          case (#ok(hash)) ?hash;
          case (#err(_)) null;
        };
      };
      case (#err(_)) null;
    };
  };

  /// Parse a decimal number string to Nat.
  func textToNat(t : Text) : ?Nat {
    Nat.fromText(t);
  };
};
