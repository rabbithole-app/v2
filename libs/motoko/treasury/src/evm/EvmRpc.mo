import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat8 "mo:core/Nat8";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";

import Address "mo:evm-txs/Address";
import Context "mo:evm-txs/Context";
import Ecmult "mo:libsecp256k1/core/ecmult";
import EvmTxTypes "mo:evm-txs/Types";
import Transaction "mo:evm-txs/Transaction";
import Transfer "mo:evm-txs/Transfer";

import BaseX "mo:base-x-encoder";
import { ic } "mo:ic";
import IC "mo:ic/Types";
import Runtime "mo:core/Runtime";

module EvmRpc {

  // ---- IcEcdsaApi adapter (implements evm-txs EcdsaApi.API interface) ----

  let ECDSA_SIGN_CYCLES : Nat = 26_153_846_153;

  /// IcEcdsaApi — adapter matching evm-txs EcdsaApi.API(create, sign) interface.
  public class IcEcdsaApi() {
    public let create = func(
      keyName : Text,
      derivationPath : [Blob],
    ) : async* Blob {
      let res = await ic.ecdsa_public_key({
        canister_id = null;
        derivation_path = derivationPath;
        key_id = { curve = #secp256k1; name = keyName };
      });
      res.public_key;
    };

    public let sign = func(
      keyName : Text,
      derivationPath : [Blob],
      messageHash : Blob,
    ) : async* Blob {
      let res = await (with cycles = ECDSA_SIGN_CYCLES) ic.sign_with_ecdsa({
        message_hash = messageHash;
        derivation_path = derivationPath;
        key_id = { curve = #secp256k1; name = keyName };
      });
      res.signature;
    };
  };

  // ---- EVM RPC canister types (matches evm_rpc.did) ----

  public type HttpHeader = { name : Text; value : Text };
  public type RpcApi = { url : Text; headers : ?[HttpHeader] };

  public type EthMainnetService = {
    #Alchemy;
    #Ankr;
    #BlockPi;
    #Cloudflare;
    #PublicNode;
    #Llama;
  };

  public type L2MainnetService = {
    #Alchemy;
    #Ankr;
    #BlockPi;
    #PublicNode;
    #Llama;
  };

  public type EthSepoliaService = {
    #Alchemy;
    #Ankr;
    #BlockPi;
    #PublicNode;
    #Sepolia;
  };

  public type ChainId = Nat64;
  public type ProviderId = Nat64;

  public type RpcService = {
    #Provider : ProviderId;
    #Custom : RpcApi;
    #EthSepolia : EthSepoliaService;
    #EthMainnet : EthMainnetService;
    #ArbitrumOne : L2MainnetService;
    #BaseMainnet : L2MainnetService;
    #OptimismMainnet : L2MainnetService;
  };

  public type RpcServices = {
    #Custom : { chainId : ChainId; services : [RpcApi] };
    #EthSepolia : ?[EthSepoliaService];
    #EthMainnet : ?[EthMainnetService];
    #ArbitrumOne : ?[L2MainnetService];
    #BaseMainnet : ?[L2MainnetService];
    #OptimismMainnet : ?[L2MainnetService];
  };

  public type ConsensusStrategy = {
    #Equality;
    #Threshold : { min : Nat8; total : ?Nat8 };
  };

  public type RpcConfig = {
    responseSizeEstimate : ?Nat64;
    responseConsensus : ?ConsensusStrategy;
  };

  public type BlockTag = {
    #Earliest;
    #Safe;
    #Finalized;
    #Latest;
    #Number : Nat;
    #Pending;
  };

  public type AccessListEntry = {
    address : Text;
    storageKeys : [Text];
  };

  public type TransactionRequest = {
    to : ?Text;
    input : ?Text;
    from : ?Text;
    gas : ?Nat;
    gasPrice : ?Nat;
    value : ?Nat;
    maxFeePerGas : ?Nat;
    maxPriorityFeePerGas : ?Nat;
    nonce : ?Nat;
    chainId : ?Nat;
    type_ : ?Text;
    accessList : ?[AccessListEntry];
    blobVersionedHashes : ?[Text];
    blobs : ?[Text];
    maxFeePerBlobGas : ?Nat;
  };

  public type CallArgs = {
    transaction : TransactionRequest;
    block : ?BlockTag;
  };

  public type FeeHistoryArgs = {
    blockCount : Nat;
    newestBlock : BlockTag;
    rewardPercentiles : ?[Nat8];
  };

  public type FeeHistory = {
    reward : [[Nat]];
    gasUsedRatio : [Float];
    oldestBlock : Nat;
    baseFeePerGas : [Nat];
  };

  public type GetTransactionCountArgs = {
    address : Text;
    block : BlockTag;
  };

  // ---- Error types ----

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
    #MissingRequiredProvider;
    #ProviderNotFound;
    #NoPermission;
    #InvalidRpcConfig : Text;
  };

  public type ValidationError = {
    #Custom : Text;
    #InvalidHex : Text;
  };

  public type RpcError = {
    #JsonRpcError : JsonRpcError;
    #ProviderError : ProviderError;
    #ValidationError : ValidationError;
    #HttpOutcallError : HttpOutcallError;
  };

  // ---- Result types ----

  public type CallResult = { #Ok : Text; #Err : RpcError };
  public type FeeHistoryResult = { #Ok : FeeHistory; #Err : RpcError };
  public type GetTransactionCountResult = { #Ok : Nat; #Err : RpcError };

  public type SendRawTransactionStatus = {
    #Ok : ?Text;
    #NonceTooLow;
    #NonceTooHigh;
    #InsufficientFunds;
  };
  public type SendRawTransactionResult = { #Ok : SendRawTransactionStatus; #Err : RpcError };

  // ---- Multi-result types ----

  public type MultiCallResult = {
    #Consistent : CallResult;
    #Inconsistent : [(RpcService, CallResult)];
  };

  public type MultiFeeHistoryResult = {
    #Consistent : FeeHistoryResult;
    #Inconsistent : [(RpcService, FeeHistoryResult)];
  };

  public type MultiGetTransactionCountResult = {
    #Consistent : GetTransactionCountResult;
    #Inconsistent : [(RpcService, GetTransactionCountResult)];
  };

  public type MultiSendRawTransactionResult = {
    #Consistent : SendRawTransactionResult;
    #Inconsistent : [(RpcService, SendRawTransactionResult)];
  };

  public type TransactionReceipt = {
    to : ?Text;
    status : ?Nat;
    transactionHash : Text;
    blockNumber : Nat;
    from : Text;
    gasUsed : Nat;
    effectiveGasPrice : Nat;
  };

  public type GetTransactionReceiptResult = { #Ok : ?TransactionReceipt; #Err : RpcError };

  public type MultiGetTransactionReceiptResult = {
    #Consistent : GetTransactionReceiptResult;
    #Inconsistent : [(RpcService, GetTransactionReceiptResult)];
  };

  type EvmRpcCanister = actor {
    eth_call : (RpcServices, ?RpcConfig, CallArgs) -> async MultiCallResult;
    eth_feeHistory : (RpcServices, ?RpcConfig, FeeHistoryArgs) -> async MultiFeeHistoryResult;
    eth_getTransactionCount : (RpcServices, ?RpcConfig, GetTransactionCountArgs) -> async MultiGetTransactionCountResult;
    eth_sendRawTransaction : (RpcServices, ?RpcConfig, Text) -> async MultiSendRawTransactionResult;
    eth_getTransactionReceipt : (RpcServices, ?RpcConfig, Text) -> async MultiGetTransactionReceiptResult;
  };

  // ---- Constants ----

  let EVM_RPC_CYCLES : Nat = 2_000_000_000;
  let FEE_HISTORY_ATTEMPTS : Nat = 3;

  // ---- Factory functions (call once per canister, store result) ----

  /// Create ECMultContext for secp256k1 operations (heavy object, allocate once).
  public func createEcCtx() : Ecmult.ECMultContext {
    Context.allocECMultContext(null);
  };

  /// Create IcEcdsaApi instance.
  public func createEcdsaApi() : IcEcdsaApi {
    IcEcdsaApi();
  };

  // ---- Public API ----

  public type EvmFeeEstimate = {
    maxFeePerGas : Nat;
    maxPriorityFeePerGas : Nat;
  };

  /// Derive an ETH address + public key from a Principal using threshold ECDSA.
  /// Returns (address, publicKey).
  public func deriveEvmAddress(
    ecdsaKeyName : Text,
    principal : Principal,
    api : IcEcdsaApi,
  ) : async* Result.Result<(Text, [Nat8]), Text> {
    let derivationPath = [Principal.toBlob(principal)];
    await* Address.create(ecdsaKeyName, derivationPath, api);
  };

  /// Get the ETH address of the Treasury canister itself (empty derivation path).
  /// Returns (address, publicKey).
  public func deriveTreasuryAddress(
    ecdsaKeyName : Text,
    api : IcEcdsaApi,
  ) : async* Result.Result<(Text, [Nat8]), Text> {
    await* Address.create(ecdsaKeyName, [], api);
  };

  /// Get the transaction receipt for a given tx hash.
  /// Returns null if the transaction is still pending.
  public func getTransactionReceipt(
    evmRpcCanisterId : Text,
    rpcServices : RpcServices,
    txHash : Text,
  ) : async* Result.Result<?TransactionReceipt, Text> {
    let evmRpc : EvmRpcCanister = actor (evmRpcCanisterId);
    let result = await (with cycles = EVM_RPC_CYCLES) evmRpc.eth_getTransactionReceipt(
      rpcServices,
      null,
      txHash,
    );
    switch (result) {
      case (#Consistent(#Ok(receipt))) #ok(receipt);
      case (#Consistent(#Err(err))) #err("getTransactionReceipt error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getTransactionReceipt: inconsistent RPC results");
    };
  };

  /// Get the current nonce for an address on the EVM chain.
  public func getNonce(
    evmRpcCanisterId : Text,
    rpcServices : RpcServices,
    address : Text,
  ) : async* Result.Result<Nat, Text> {
    let evmRpc : EvmRpcCanister = actor (evmRpcCanisterId);
    let result = await (with cycles = EVM_RPC_CYCLES) evmRpc.eth_getTransactionCount(
      rpcServices,
      null,
      { address; block = #Pending },
    );
    switch (result) {
      case (#Consistent(#Ok(count))) #ok(count);
      case (#Consistent(#Err(err))) #err("getNonce error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getNonce: inconsistent RPC results");
    };
  };

  /// Estimate EIP-1559 fee caps from eth_feeHistory.
  public func getFeeEstimate(
    evmRpcCanisterId : Text,
    rpcServices : RpcServices,
  ) : async* Result.Result<EvmFeeEstimate, Text> {
    let evmRpc : EvmRpcCanister = actor (evmRpcCanisterId);
    var attempt : Nat = 0;
    var lastError = "feeHistory failed";

    while (attempt < FEE_HISTORY_ATTEMPTS) {
      attempt += 1;
      let result = await (with cycles = EVM_RPC_CYCLES) evmRpc.eth_feeHistory(
        rpcServices,
        null,
        {
          blockCount = 1;
          newestBlock = #Latest;
          rewardPercentiles = ?[50];
        },
      );

      switch (result) {
        case (#Consistent(#Ok(history))) return feeEstimateFromHistory(history);
        case (#Consistent(#Err(err))) {
          lastError := "feeHistory error: " # rpcErrorToText(err);
          if (not isRetryableRpcError(err)) {
            return #err(lastError);
          };
        };
        case (#Inconsistent(_)) return #err("feeHistory: inconsistent RPC results");
      };
    };

    #err(lastError # " after " # debug_show (FEE_HISTORY_ATTEMPTS) # " attempts");
  };

  /// Send a signed ERC-20 transfer transaction.
  public func sendErc20Transfer(
    args : {
      ecdsaKeyName : Text;
      evmRpcCanisterId : Text;
      rpcServices : RpcServices;
      chainId : Nat;
      contract : Text;
      derivationPath : [Blob];
      publicKey : [Nat8];
      to : Text;
      amount : Nat;
      nonce : Nat;
      gasLimit : Nat;
      maxFeePerGas : Nat;
      maxPriorityFeePerGas : Nat;
    },
    ctx : Ecmult.ECMultContext,
    api : IcEcdsaApi,
  ) : async* Result.Result<Text, Text> {
    // Build ERC-20 transfer(address,uint256) calldata
    let data = switch (Transfer.getTransferERC20Data(args.to, args.amount)) {
      case (#ok(d)) "0x" # d;
      case (#err(msg)) return #err("getTransferERC20Data failed: " # msg);
    };

    let tx : EvmTxTypes.Transaction1559 = {
      nonce = Nat64.fromNat(args.nonce);
      chainId = Nat64.fromNat(args.chainId);
      maxPriorityFeePerGas = Nat64.fromNat(args.maxPriorityFeePerGas);
      maxFeePerGas = Nat64.fromNat(args.maxFeePerGas);
      gasLimit = Nat64.fromNat(args.gasLimit);
      to = args.contract;
      value = 0;
      data;
      accessList = [];
      v = "0x00";
      r = "0x00";
      s = "0x00";
    };

    // Sign directly from Transaction object (avoids serialize->deserialize roundtrip)
    let signResult = await* Transaction.signTx(
      #EIP1559(?tx),
      Nat64.fromNat(args.chainId),
      args.ecdsaKeyName,
      args.derivationPath,
      args.publicKey,
      ctx,
      api,
    );

    switch (signResult) {
      case (#err(msg)) #err("signTransferERC20 failed: " # msg);
      case (#ok((_txType, rawTx))) {
        await* sendRawTx(args.evmRpcCanisterId, args.rpcServices, rawTx);
      };
    };
  };

  /// Send a native ETH transfer transaction.
  public func sendEthTransfer(
    args : {
      ecdsaKeyName : Text;
      evmRpcCanisterId : Text;
      rpcServices : RpcServices;
      chainId : Nat;
      derivationPath : [Blob];
      publicKey : [Nat8];
      to : Text;
      amount : Nat;
      nonce : Nat;
      gasLimit : Nat;
      maxFeePerGas : Nat;
      maxPriorityFeePerGas : Nat;
    },
    ctx : Ecmult.ECMultContext,
    api : IcEcdsaApi,
  ) : async* Result.Result<Text, Text> {
    let tx : EvmTxTypes.Transaction1559 = {
      nonce = Nat64.fromNat(args.nonce);
      chainId = Nat64.fromNat(args.chainId);
      maxPriorityFeePerGas = Nat64.fromNat(args.maxPriorityFeePerGas);
      maxFeePerGas = Nat64.fromNat(args.maxFeePerGas);
      gasLimit = Nat64.fromNat(args.gasLimit);
      to = args.to;
      value = args.amount;
      data = "0x";
      accessList = [];
      v = "0x00";
      r = "0x00";
      s = "0x00";
    };

    let signResult = await* Transaction.signTx(
      #EIP1559(?tx),
      Nat64.fromNat(args.chainId),
      args.ecdsaKeyName,
      args.derivationPath,
      args.publicKey,
      ctx,
      api,
    );

    switch (signResult) {
      case (#err(msg)) #err("signTx failed: " # msg);
      case (#ok((_txType, rawTx))) {
        await* sendRawTx(args.evmRpcCanisterId, args.rpcServices, rawTx);
      };
    };
  };

  /// Get ERC-20 token balance for an address via eth_call.
  public func getErc20Balance(
    evmRpcCanisterId : Text,
    rpcServices : RpcServices,
    contract : Text,
    address : Text,
  ) : async* Result.Result<Nat, Text> {
    let evmRpc : EvmRpcCanister = actor (evmRpcCanisterId);

    // ABI: balanceOf(address) = 0x70a08231 + padded address (32 bytes)
    let input = abiEncodeCall([0x70, 0xa0, 0x82, 0x31], address);

    let result = await (with cycles = EVM_RPC_CYCLES) evmRpc.eth_call(
      rpcServices,
      null,
      {
        transaction = {
          to = ?contract;
          input = ?input;
          from = null;
          gas = null;
          gasPrice = null;
          value = null;
          maxFeePerGas = null;
          maxPriorityFeePerGas = null;
          nonce = null;
          chainId = null;
          type_ = null;
          accessList = null;
          blobVersionedHashes = null;
          blobs = null;
          maxFeePerBlobGas = null;
        };
        block = ?#Latest;
      },
    );

    switch (result) {
      case (#Consistent(#Ok(hex))) #ok(hexToNat(hex));
      case (#Consistent(#Err(err))) #err("getErc20Balance error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getErc20Balance: inconsistent RPC results");
    };
  };

  /// Get native ETH balance via multicall3.getEthBalance(address).
  public func getEthBalance(
    evmRpcCanisterId : Text,
    rpcServices : RpcServices,
    address : Text,
  ) : async* Result.Result<Nat, Text> {
    let evmRpc : EvmRpcCanister = actor (evmRpcCanisterId);

    // multicall3.getEthBalance(address) = 0x4d2301cc + padded address (32 bytes)
    let input = abiEncodeCall([0x4d, 0x23, 0x01, 0xcc], address);

    let result = await (with cycles = EVM_RPC_CYCLES) evmRpc.eth_call(
      rpcServices,
      null,
      {
        transaction = {
          to = ?"0xcA11bde05977b3631167028862bE2a173976CA11"; // Multicall3
          input = ?input;
          from = null;
          gas = null;
          gasPrice = null;
          value = null;
          maxFeePerGas = null;
          maxPriorityFeePerGas = null;
          nonce = null;
          chainId = null;
          type_ = null;
          accessList = null;
          blobVersionedHashes = null;
          blobs = null;
          maxFeePerBlobGas = null;
        };
        block = ?#Latest;
      },
    );

    switch (result) {
      case (#Consistent(#Ok(hex))) #ok(hexToNat(hex));
      case (#Consistent(#Err(err))) #err("getEthBalance error: " # rpcErrorToText(err));
      case (#Inconsistent(_)) #err("getEthBalance: inconsistent RPC results");
    };
  };

  // ---- Internal helpers ----

  /// Send a signed raw transaction via EVM RPC canister.
  func sendRawTx(
    evmRpcCanisterId : Text,
    rpcServices : RpcServices,
    rawTx : [Nat8],
  ) : async* Result.Result<Text, Text> {
    let evmRpc : EvmRpcCanister = actor (evmRpcCanisterId);
    let rawTxHex = BaseX.toHex(rawTx.vals(), { isUpper = false; prefix = #single("0x") });

    let result = await (with cycles = EVM_RPC_CYCLES) evmRpc.eth_sendRawTransaction(
      rpcServices,
      null,
      rawTxHex,
    );

    switch (result) {
      case (#Consistent(#Ok(status))) {
        switch (status) {
          case (#Ok(txHash)) #ok(switch (txHash) { case (?h) h; case null "submitted" });
          case (#NonceTooLow) #err("NonceTooLow");
          case (#NonceTooHigh) #err("NonceTooHigh");
          case (#InsufficientFunds) #err("InsufficientFunds");
        };
      };
      case (#Consistent(#Err(err))) #err(rpcErrorToText(err));
      case (#Inconsistent(_)) #err("Inconsistent results from RPC providers");
    };
  };

  /// ABI-encode a call: 4-byte selector + address left-padded to 32 bytes.
  func abiEncodeCall(selector : [Nat8], address : Text) : Text {
    let addrBytes = switch (BaseX.fromHex(address, { prefix = #single("0x") })) {
      case (#ok(b)) b;
      case (#err(e)) Runtime.trap("abiEncodeCall: invalid address hex: " # e);
    };
    // Left-pad address (20 bytes) to 32 bytes with zeros
    let padded = Array.tabulate<Nat8>(32, func(i : Nat) : Nat8 {
      let offset = 32 - addrBytes.size() : Nat;
      if (i < offset) 0 else addrBytes[i - offset];
    });
    let calldata = Iter.concat(selector.vals(), padded.vals());
    BaseX.toHex(calldata, { isUpper = false; prefix = #single("0x") });
  };

  func feeEstimateFromHistory(history : FeeHistory) : Result.Result<EvmFeeEstimate, Text> {
    let baseFeeCount = history.baseFeePerGas.size();
    if (baseFeeCount == 0) {
      return #err("feeHistory returned no baseFeePerGas values");
    };
    if (history.reward.size() == 0 or history.reward[0].size() == 0) {
      return #err("feeHistory returned no priority fee reward values");
    };

    let baseFeePerGas = history.baseFeePerGas[baseFeeCount - 1];
    let maxPriorityFeePerGas = history.reward[0][0];
    #ok({
      maxFeePerGas = baseFeePerGas + maxPriorityFeePerGas;
      maxPriorityFeePerGas;
    });
  };

  func isRetryableRpcError(err : RpcError) : Bool {
    switch (err) {
      case (#HttpOutcallError(#IcError({ code = #SysTransient; message = _ }))) true;
      case _ false;
    };
  };

  func rpcErrorToText(err : RpcError) : Text {
    switch (err) {
      case (#JsonRpcError({ code; message })) "JsonRpcError(" # debug_show (code) # "): " # message;
      case (#ProviderError(#TooFewCycles({ expected; received }))) "TooFewCycles: expected " # debug_show (expected) # ", received " # debug_show (received);
      case (#ProviderError(#MissingRequiredProvider)) "MissingRequiredProvider";
      case (#ProviderError(#ProviderNotFound)) "ProviderNotFound";
      case (#ProviderError(#NoPermission)) "NoPermission";
      case (#ProviderError(#InvalidRpcConfig(msg))) "InvalidRpcConfig: " # msg;
      case (#ValidationError(#Custom(msg))) "ValidationError: " # msg;
      case (#ValidationError(#InvalidHex(msg))) "InvalidHex: " # msg;
      case (#HttpOutcallError(#IcError({ code = _; message }))) "IcError: " # message;
      case (#HttpOutcallError(#InvalidHttpJsonRpcResponse({ status; body; parsingError = _ }))) "InvalidHttpJsonRpcResponse(status=" # debug_show (status) # "): " # body;
    };
  };

  func hexToNat(hex : Text) : Nat {
    let bytes = switch (BaseX.fromHex(hex, { prefix = #single("0x") })) {
      case (#ok(b)) b;
      case (#err(e)) Runtime.trap("hexToNat: invalid hex: " # e);
    };
    var result : Nat = 0;
    for (byte in bytes.vals()) {
      result := result * 256 + Nat8.toNat(byte);
    };
    result;
  };
};
