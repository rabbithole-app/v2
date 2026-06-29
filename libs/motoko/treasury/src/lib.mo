import Array "mo:core/Array";
import Debug "mo:core/Debug";
import Runtime "mo:core/Runtime";
import Ecmult "mo:libsecp256k1/core/ecmult";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Vector "mo:vector";

import BaseX "mo:base-x-encoder";

import Account "common/Account";
import Const "Const";
import EvmRpc "evm/EvmRpc";
import LedgerTypes "common/LedgerTypes";
import Migrations "Migrations/lib";
import SolRpc "sol/SolRpc";
import SolTx "sol/SolTx";
import V1Types "Migrations/V1/Types";
import Types "Types";

module Treasury {
  public type StableStore = Migrations.VersionedStableStore;
  public type UpgradeOptions = Migrations.UpgradeOptions;

  // ---- Init / Upgrade / FromVersion ----

  public let defaultDistributionConfig : Types.DistributionConfig = {
    l1Bps = Const.L1_BPS;
    l2Bps = Const.L2_BPS;
    minWithdraw = {
      icp = Const.MIN_WITHDRAW_ICP;
      ckUsdc = Const.MIN_WITHDRAW_CKUSDC;
      ckUsdt = Const.MIN_WITHDRAW_CKUSDT;
      ckEth = Const.MIN_WITHDRAW_CKETH;
      baseEth = Const.MIN_WITHDRAW_BASE_ETH;
      baseUsdc = Const.MIN_WITHDRAW_BASE_USDC;
      baseUsdt = Const.MIN_WITHDRAW_BASE_USDT;
      sol = Const.MIN_WITHDRAW_SOL;
      solUsdc = Const.MIN_WITHDRAW_SOL_USDC;
      solUsdt = Const.MIN_WITHDRAW_SOL_USDT;
    };
  };

  public func initStableStore(args : Types.InitArgs) : StableStore {
    let config = switch (args.distributionConfig) {
      case (?c) c;
      case null defaultDistributionConfig;
    };
    #v1({
      processedPayments = Set.empty<Text>();
      distributions = Vector.new<Types.DistributionRecord>();
      var nextDistributionId = 0;
      thresholdKeyName = args.thresholdKeyName;
      chains = args.chains;
      distributionConfig = config;
      walletCache = Map.empty<Principal, V1Types.WalletAddresses>();
    });
  };

  public func upgradeStableStore(store : StableStore, options : UpgradeOptions) : StableStore {
    Migrations.upgrade(store, options);
  };

  public type Treasury = {
    store : V1Types.StableStore;
    canisterId : Principal;
    var ecCtx : ?Ecmult.ECMultContext;
    ecdsaApi : EvmRpc.IcEcdsaApi;
    schnorrApi : SolRpc.IcSchnorrApi;
    /// Last known nonce for the treasury signing address.
    /// Used to avoid NonceTooLow when pending txs haven't propagated yet.
    var lastNonce : ?Nat;
  };

  /// Get or lazily allocate ECMultContext (heavy secp256k1 precomputation).
  func getEcCtx(treasury : Treasury) : Ecmult.ECMultContext {
    switch (treasury.ecCtx) {
      case (?ctx) ctx;
      case null {
        let ctx = EvmRpc.createEcCtx();
        treasury.ecCtx := ?ctx;
        ctx;
      };
    };
  };

  public func fromVersion(versionedStore : StableStore, canisterId : Principal) : Treasury {
    let store = Migrations.getCurrentState(versionedStore);
    {
      store;
      canisterId;
      var ecCtx = null;
      ecdsaApi = EvmRpc.createEcdsaApi();
      schnorrApi = SolRpc.createSchnorrApi();
      var lastNonce = null;
    };
  };

  // ---- Token classification ----

  func isIcToken(tokenId : Types.TokenId) : Bool {
    switch (tokenId) {
      case (#ICP or #ckUSDC or #ckUSDT or #ckETH) true;
      case _ false;
    };
  };

  func isSolToken(tokenId : Types.TokenId) : Bool {
    switch (tokenId) {
      case (#SOL or #SolUSDC or #SolUSDT) true;
      case _ false;
    };
  };

  func getSupportedAsset(
    assets : [Types.SupportedAsset],
    tokenId : Types.TokenId,
  ) : ?Types.SupportedAsset {
    Array.find<Types.SupportedAsset>(
      assets,
      func(asset : Types.SupportedAsset) : Bool {
        asset.tokenId == tokenId;
      },
    );
  };

  func getEvmChainConfig(
    chains : [Types.ChainConfig],
    tokenId : Types.TokenId,
  ) : ?Types.EvmChainConfig {
    for (chain in chains.vals()) {
      switch (chain) {
        case (#Evm(config)) {
          switch (getSupportedAsset(config.assets, tokenId)) {
            case (?_) return ?config;
            case null {};
          };
        };
        case (#Solana(_)) {};
      };
    };
    null;
  };

  func getSolanaChainConfig(
    chains : [Types.ChainConfig],
    tokenId : Types.TokenId,
  ) : ?Types.SolanaChainConfig {
    for (chain in chains.vals()) {
      switch (chain) {
        case (#Solana(config)) {
          switch (getSupportedAsset(config.assets, tokenId)) {
            case (?_) return ?config;
            case null {};
          };
        };
        case (#Evm(_)) {};
      };
    };
    null;
  };

  func hasEvmChain(chains : [Types.ChainConfig]) : Bool {
    switch (
      Array.find<Types.ChainConfig>(
        chains,
        func(chain : Types.ChainConfig) : Bool {
          switch (chain) {
            case (#Evm(_)) true;
            case (#Solana(_)) false;
          };
        },
      )
    ) {
      case (?_) true;
      case null false;
    };
  };

  func hasSolanaChain(chains : [Types.ChainConfig]) : Bool {
    switch (
      Array.find<Types.ChainConfig>(
        chains,
        func(chain : Types.ChainConfig) : Bool {
          switch (chain) {
            case (#Solana(_)) true;
            case (#Evm(_)) false;
          };
        },
      )
    ) {
      case (?_) true;
      case null false;
    };
  };

  func getAnyEvmChainConfig(chains : [Types.ChainConfig]) : ?Types.EvmChainConfig {
    for (chain in chains.vals()) {
      switch (chain) {
        case (#Evm(config)) return ?config;
        case (#Solana(_)) {};
      };
    };
    null;
  };

  func getAnySolanaChainConfig(chains : [Types.ChainConfig]) : ?Types.SolanaChainConfig {
    for (chain in chains.vals()) {
      switch (chain) {
        case (#Solana(config)) return ?config;
        case (#Evm(_)) {};
      };
    };
    null;
  };

  // ---- IC Ledger resolution ----

  func getIcLedgerCanisterId(tokenId : Types.TokenId) : Text {
    switch (tokenId) {
      case (#ICP) Const.ICP_LEDGER;
      case (#ckUSDC) Const.CKUSDC_LEDGER;
      case (#ckUSDT) Const.CKUSDT_LEDGER;
      case (#ckETH) Const.CKETH_LEDGER;
      case _ Runtime.trap("Not an IC token");
    };
  };

  func getIcFee(tokenId : Types.TokenId) : Nat {
    switch (tokenId) {
      case (#ICP) Const.ICP_FEE;
      case (#ckUSDC) Const.CKUSDC_FEE;
      case (#ckUSDT) Const.CKUSDT_FEE;
      case (#ckETH) Const.CKETH_FEE;
      case _ Runtime.trap("Not an IC token");
    };
  };

  func getMinWithdraw(tokenId : Types.TokenId, config : Types.DistributionConfig) : Nat {
    switch (tokenId) {
      case (#ICP) config.minWithdraw.icp;
      case (#ckUSDC) config.minWithdraw.ckUsdc;
      case (#ckUSDT) config.minWithdraw.ckUsdt;
      case (#ckETH) config.minWithdraw.ckEth;
      case (#BaseETH) config.minWithdraw.baseEth;
      case (#BaseUSDC) config.minWithdraw.baseUsdc;
      case (#BaseUSDT) config.minWithdraw.baseUsdt;
      case (#SOL) config.minWithdraw.sol;
      case (#SolUSDC) config.minWithdraw.solUsdc;
      case (#SolUSDT) config.minWithdraw.solUsdt;
    };
  };

  func getIcLedger(tokenId : Types.TokenId) : LedgerTypes.Self {
    actor (getIcLedgerCanisterId(tokenId)) : LedgerTypes.Self;
  };

  // ---- EVM helpers ----

  func getEvmContract(tokenId : Types.TokenId, evmConfig : Types.EvmChainConfig) : ?Text {
    let ?asset = getSupportedAsset(evmConfig.assets, tokenId) else Runtime.trap("EVM token is not configured");
    switch (asset.locator) {
      case (#Contract(address)) ?address;
      case (#Native) null;
      case (#Mint(_)) Runtime.trap("Unexpected mint locator for EVM token");
    };
  };

  func getEvmGasLimit(tokenId : Types.TokenId) : Nat {
    switch (tokenId) {
      case (#BaseETH) Const.EVM_ETH_GAS_LIMIT;
      case (#BaseUSDC or #BaseUSDT) Const.EVM_ERC20_GAS_LIMIT;
      case _ Runtime.trap("Not an EVM token");
    };
  };

  func buildRpcServices(evmConfig : Types.EvmChainConfig) : EvmRpc.RpcServices {
    // If custom RPC URLs are provided, always use #Custom
    if (evmConfig.rpcUrls.size() > 0) {
      return #Custom({
        chainId = Nat64.fromNat(evmConfig.chainId);
        services = Array.map<Text, EvmRpc.RpcApi>(
          evmConfig.rpcUrls,
          func(url : Text) : EvmRpc.RpcApi { { url; headers = null } },
        );
      });
    };
    // Otherwise use built-in evm_rpc provider sets
    switch (evmConfig.chainId) {
      case 8453 #BaseMainnet(null);
      case 1 #EthMainnet(null);
      case 11155111 #EthSepolia(null);
      case _ #Custom({
        chainId = Nat64.fromNat(evmConfig.chainId);
        services = [];
      });
    };
  };

  func getEvmFeeEstimate(
    evmConfig : Types.EvmChainConfig,
    rpcServices : EvmRpc.RpcServices,
  ) : async* Result.Result<EvmRpc.EvmFeeEstimate, Text> {
    await* EvmRpc.getFeeEstimate(evmConfig.evmRpcCanisterId, rpcServices);
  };

  /// Resolve EVM address for a principal, using cache.
  func resolveEvmAddress(
    treasury : Treasury,
    principal : Principal,
    _evmConfig : Types.EvmChainConfig,
    api : EvmRpc.IcEcdsaApi,
  ) : async* ?Text {
    Debug.print(
      "resolveEvmAddress: caller="
      # Principal.toText(principal)
    );

    // Check cache
    switch (Map.get(treasury.store.walletCache, Principal.compare, principal)) {
      case (?wallet) {
        switch (wallet.evmAddress) {
          case (?addr) {
            Debug.print(
              "resolveEvmAddress: cache hit, returning cached address="
              # addr
            );
            return ?addr;
          };
          case null {
            Debug.print(
              "resolveEvmAddress: cache entry exists but evmAddress is null, deriving new address",
            );
          };
        };
      };
      case null {
        Debug.print("resolveEvmAddress: no cache entry, deriving new address");
      };
    };

    // Derive
    let result = await* EvmRpc.deriveEvmAddress(treasury.store.thresholdKeyName, principal, api);
    switch (result) {
      case (#ok((address, _publicKey))) {
        Debug.print(
          "resolveEvmAddress: derived address="
          # address,
        );
        let existing = Map.get(treasury.store.walletCache, Principal.compare, principal);
        let wallet : V1Types.WalletAddresses = switch (existing) {
          case (?w) {
            {
              icSubaccount = w.icSubaccount;
              evmAddress = ?address;
              solAddress = w.solAddress;
            };
          };
          case null {
            {
              icSubaccount = Account.principalToSubaccount(principal);
              evmAddress = ?address;
              solAddress = null;
            };
          };
        };
        Map.add(treasury.store.walletCache, Principal.compare, principal, wallet);
        ?address;
      };
      case (#err(err)) {
        Debug.print(
          "resolveEvmAddress: derive failed="
          # debug_show (err),
        );
        null;
      };
    };
  };

  /// Get cached public key for a principal. Must be resolved first via resolveEvmAddress.
  func getCachedPublicKey(
    _treasury : Treasury,
    principal : Principal,
    thresholdKeyName : Types.ThresholdKeyName,
    api : EvmRpc.IcEcdsaApi,
  ) : async* ?[Nat8] {
    // We need the public key for signing. Re-derive (ecdsa_public_key is free).
    let result = await* EvmRpc.deriveEvmAddress(thresholdKeyName, principal, api);
    switch (result) {
      case (#ok((_address, publicKey))) ?publicKey;
      case (#err(_)) null;
    };
  };

  type EvmTransferContext = {
    thresholdKeyName : Types.ThresholdKeyName;
    evmConfig : Types.EvmChainConfig;
    rpcServices : EvmRpc.RpcServices;
    ecCtx : Ecmult.ECMultContext;
    api : EvmRpc.IcEcdsaApi;
  };

  type EvmTransferSigner = {
    derivationPath : [Blob];
    publicKey : [Nat8];
  };

  type EvmTransferRecipient = {
    address : Text;
    amount : Nat;
  };

  type EvmTransferFee = {
    nonce : Nat;
    maxFeePerGas : Nat;
    maxPriorityFeePerGas : Nat;
  };

  type EvmTransferRequest = {
    tokenId : Types.TokenId;
    signer : EvmTransferSigner;
    recipient : EvmTransferRecipient;
    fee : EvmTransferFee;
  };

  func evmTransferFee(nonce : Nat, feeEstimate : EvmRpc.EvmFeeEstimate) : EvmTransferFee {
    {
      nonce;
      maxFeePerGas = feeEstimate.maxFeePerGas;
      maxPriorityFeePerGas = feeEstimate.maxPriorityFeePerGas;
    };
  };

  /// Send an EVM transfer (ERC-20 or native ETH).
  func sendEvmTransfer(
    context : EvmTransferContext,
    request : EvmTransferRequest,
  ) : async* Result.Result<Text, Text> {
    let gasLimit = getEvmGasLimit(request.tokenId);

    switch (getEvmContract(request.tokenId, context.evmConfig)) {
      case (?contract) {
        await* EvmRpc.sendErc20Transfer(
          {
            ecdsaKeyName = context.thresholdKeyName;
            evmRpcCanisterId = context.evmConfig.evmRpcCanisterId;
            rpcServices = context.rpcServices;
            chainId = context.evmConfig.chainId;
            contract;
            derivationPath = request.signer.derivationPath;
            publicKey = request.signer.publicKey;
            to = request.recipient.address;
            amount = request.recipient.amount;
            nonce = request.fee.nonce;
            gasLimit;
            maxFeePerGas = request.fee.maxFeePerGas;
            maxPriorityFeePerGas = request.fee.maxPriorityFeePerGas;
          },
          context.ecCtx,
          context.api,
        );
      };
      case null {
        await* EvmRpc.sendEthTransfer(
          {
            ecdsaKeyName = context.thresholdKeyName;
            evmRpcCanisterId = context.evmConfig.evmRpcCanisterId;
            rpcServices = context.rpcServices;
            chainId = context.evmConfig.chainId;
            derivationPath = request.signer.derivationPath;
            publicKey = request.signer.publicKey;
            to = request.recipient.address;
            amount = request.recipient.amount;
            nonce = request.fee.nonce;
            gasLimit;
            maxFeePerGas = request.fee.maxFeePerGas;
            maxPriorityFeePerGas = request.fee.maxPriorityFeePerGas;
          },
          context.ecCtx,
          context.api,
        );
      };
    };
  };

  func sendEvmTransferMessage(
    context : EvmTransferContext,
    request : EvmTransferRequest,
  ) : async Result.Result<Text, Text> {
    await* sendEvmTransfer(context, request);
  };

  // ---- Solana helpers ----

  /// Get SPL mint address for a Solana token.
  func getSolMintAddress(tokenId : Types.TokenId, solConfig : Types.SolanaChainConfig) : ?Text {
    let ?asset = getSupportedAsset(solConfig.assets, tokenId) else Runtime.trap("Solana token is not configured");
    switch (asset.locator) {
      case (#Mint(address)) ?address;
      case (#Native) null;
      case (#Contract(_)) Runtime.trap("Unexpected contract locator for Solana token");
    };
  };

  /// Get SPL token decimals.
  func getSolTokenDecimals(tokenId : Types.TokenId, solConfig : Types.SolanaChainConfig) : Nat8 {
    let ?asset = getSupportedAsset(solConfig.assets, tokenId) else Runtime.trap("Solana token is not configured");
    asset.decimals;
  };

  /// Build RPC sources for SOL RPC canister.
  func buildSolRpcSources(solConfig : Types.SolanaChainConfig) : SolRpc.RpcSources {
    // If custom RPC URL is provided, always use #Custom
    switch (solConfig.rpcUrl) {
      case (?url) {
        return #Custom([#Custom({ url; headers = null })]);
      };
      case null {};
    };
    // Otherwise use built-in sol_rpc provider sets
    if (Text.equal(solConfig.networkId, "devnet") or Text.equal(solConfig.networkId, "testnet")) {
      #Default(#Devnet);
    } else {
      #Default(#Mainnet);
    };
  };

  /// Resolve Solana address for a principal, using cache.
  func resolveSolAddress(
    treasury : Treasury,
    principal : Principal,
    _solConfig : Types.SolanaChainConfig,
    api : SolRpc.IcSchnorrApi,
  ) : async* ?Text {
    // Check cache
    switch (Map.get(treasury.store.walletCache, Principal.compare, principal)) {
      case (?wallet) {
        switch (wallet.solAddress) {
          case (?addr) return ?addr;
          case null {};
        };
      };
      case null {};
    };

    // Derive
    let result = await* SolRpc.deriveSolAddress(treasury.store.thresholdKeyName, principal, api);
    switch (result) {
      case (#ok((address, _publicKey))) {
        // Update existing cache entry or create new one
        let existing = Map.get(treasury.store.walletCache, Principal.compare, principal);
        let wallet : V1Types.WalletAddresses = switch (existing) {
          case (?w) { { icSubaccount = w.icSubaccount; evmAddress = w.evmAddress; solAddress = ?address } };
          case null { { icSubaccount = Account.principalToSubaccount(principal); evmAddress = null; solAddress = ?address } };
        };
        Map.add(treasury.store.walletCache, Principal.compare, principal, wallet);
        ?address;
      };
      case (#err(_)) null;
    };
  };

  /// Get SOL or SPL token balance for an address.
  func getSolTokenBalance(
    solConfig : Types.SolanaChainConfig,
    tokenId : Types.TokenId,
    address : Text,
  ) : async* Result.Result<Nat, Text> {
    let rpcSources = buildSolRpcSources(solConfig);
    switch (getSolMintAddress(tokenId, solConfig)) {
      case (?mintAddress) {
        // SPL token — need to derive ATA and query token balance
        let walletBytes = SolTx.addressToBytes(address);
        let mintBytes = SolTx.addressToBytes(mintAddress);
        let ataBytes = SolTx.deriveAta(walletBytes, mintBytes);
        let ataAddress = BaseX.toBase58(ataBytes.vals());
        await* SolRpc.getTokenAccountBalance(solConfig.solRpcCanisterId, rpcSources, ataAddress);
      };
      case null {
        // Native SOL
        let result = await* SolRpc.getBalance(solConfig.solRpcCanisterId, rpcSources, address);
        Result.mapOk<Nat64, Nat, Text>(result, func(lamports : Nat64) : Nat { Nat64.toNat(lamports) });
      };
    };
  };

  func getSolTokenBalanceStep(
    solConfig : Types.SolanaChainConfig,
    tokenId : Types.TokenId,
    address : Text,
  ) : async Result.Result<Nat, Text> {
    await* getSolTokenBalance(solConfig, tokenId, address);
  };

  func getEvmTokenBalanceStep(
    evmConfig : Types.EvmChainConfig,
    tokenId : Types.TokenId,
    address : Text,
  ) : async Result.Result<Nat, Text> {
    let rpcServices = buildRpcServices(evmConfig);
    await* getEvmTokenBalance(evmConfig, rpcServices, tokenId, address);
  };

  // ---- Distribution ----

  /// Distribute a payment to treasury + ambassadors.
  /// Supports both IC (ICRC-1) and EVM (Base) tokens.
  /// Distribute an already-received payment across treasury + ambassadors.
  /// Access control is the parent canister's responsibility — treasury assumes
  /// the call is authorised.
  public func distributePayment(
    treasury : Treasury,
    args : Types.DistributePaymentArgs,
  ) : async* Types.DistributePaymentResult {
    if (Set.contains(treasury.store.processedPayments, Text.compare, args.paymentId)) {
      return #err(#AlreadyProcessed);
    };

    if (args.amount == 0) {
      return #err(#InvalidAmount);
    };

    if (isIcToken(args.tokenId)) {
      await* distributeIc(treasury, args);
    } else if (isSolToken(args.tokenId)) {
      await* distributeSol(treasury, args);
    } else {
      await* distributeEvm(treasury, args);
    };
  };

  func distributeIc(
    treasury : Treasury,
    args : Types.DistributePaymentArgs,
  ) : async* Types.DistributePaymentResult {
    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.amount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);

    let ledger = getIcLedger(args.tokenId);
    let fee = getIcFee(args.tokenId);
    let now = Time.now();

    var transfers = Vector.new<Types.TransferRecord>();

    // Transfer treasury share (to fixed treasury subaccount)
    let treasurySubaccount = Const.treasurySubaccount();
    let treasuryNet = if (treasuryAmount > fee) { treasuryAmount - fee } else { 0 };
    let treasuryResult = await ledger.icrc1_transfer({
      to = { owner = treasury.canisterId; subaccount = ?treasurySubaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = null;
      created_at_time = ?Nat64.fromNat(Int.abs(now));
      amount = treasuryNet;
    });
    Vector.add(transfers, makeIcTransferRecord(treasury.canisterId, ?treasurySubaccount, treasuryNet, args.tokenId, treasuryResult));

    // Transfer L1 ambassador share
    switch (args.ambassadorL1) {
      case (?l1) {
        if (l1Amount > fee) {
          let l1Net = l1Amount - fee;
          let l1Subaccount = Account.principalToSubaccount(l1);
          let l1Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l1Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = null;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 1);
            amount = l1Net;
          });
          Vector.add(transfers, makeIcTransferRecord(l1, ?l1Subaccount, l1Net, args.tokenId, l1Result));
        };
      };
      case null {};
    };

    // Transfer L2 ambassador share
    switch (args.ambassadorL2) {
      case (?l2) {
        if (l2Amount > fee) {
          let l2Net = l2Amount - fee;
          let l2Subaccount = Account.principalToSubaccount(l2);
          let l2Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l2Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = null;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 2);
            amount = l2Net;
          });
          Vector.add(transfers, makeIcTransferRecord(l2, ?l2Subaccount, l2Net, args.tokenId, l2Result));
        };
      };
      case null {};
    };

    finalizeDistribution(treasury, args, treasuryAmount, l1Amount, l2Amount, transfers);
  };

  func distributeEvm(
    treasury : Treasury,
    args : Types.DistributePaymentArgs,
  ) : async* Types.DistributePaymentResult {
    let evmConfig = switch (getEvmChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#EvmNotConfigured);
    };

    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.amount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);

    let api = treasury.ecdsaApi;
    let ecCtx = getEcCtx(treasury);
    let rpcServices = buildRpcServices(evmConfig);

    // Derive treasury EVM address + public key (sender of all EVM transfers)
    let (treasuryEvmAddr, treasuryPubKey) = switch (await* EvmRpc.deriveTreasuryAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok(pair)) pair;
      case (#err(e)) return #err(#TransferFailed({ recipient = "treasury"; error = e }));
    };

    var transfers = Vector.new<Types.TransferRecord>();

    // Resolve EVM addresses for ambassador recipients only.
    // Treasury share stays at `treasuryEvmAddr` (the fixed treasury pool derived
    // with empty path) — no outbound transfer needed for the 85%.
    let l1EvmAddr = if (l1Amount == 0) {
      null;
    } else switch (args.ambassadorL1) {
      case (?l1) await* resolveEvmAddress(treasury, l1, evmConfig, api);
      case null null;
    };
    let l2EvmAddr = if (l2Amount == 0) {
      null;
    } else switch (args.ambassadorL2) {
      case (?l2) await* resolveEvmAddress(treasury, l2, evmConfig, api);
      case null null;
    };

    // Force a commit point between ECDSA/address resolution and EVM RPC calls.
    // Ensures HTTPS outcalls happen in a separate tick from ECDSA callbacks.
    let remoteNonce = switch (await* EvmRpc.getNonce(evmConfig.evmRpcCanisterId, rpcServices, treasuryEvmAddr)) {
      case (#ok(n)) n;
      case (#err(e)) return #err(#TransferFailed({ recipient = "treasury"; error = e }));
    };
    // Use the higher of remote nonce and locally tracked nonce to avoid NonceTooLow
    // when a previous tx is still pending in the mempool.
    var nonce = switch (treasury.lastNonce) {
      case (?local) if (local > remoteNonce) local else remoteNonce;
      case null remoteNonce;
    };
    let feeEstimate = switch (await* getEvmFeeEstimate(evmConfig, rpcServices)) {
      case (#ok(value)) value;
      case (#err(e)) return #err(#TransferFailed({ recipient = "fee-estimate"; error = e }));
    };
    let transferContext : EvmTransferContext = {
      thresholdKeyName = treasury.store.thresholdKeyName;
      evmConfig;
      rpcServices;
      ecCtx;
      api;
    };

    // Treasury share: recorded as retained (no outbound transfer — funds
    // already sit at treasuryEvmAddr where they arrived).
    if (treasuryAmount > 0) {
      Vector.add(transfers, makeEvmTransferRecord(treasury.canisterId, treasuryEvmAddr, treasuryAmount, args.tokenId, #ok("retained-at-treasury-address")));
    };

    // Transfer L1 share
    if (l1Amount > 0) {
      switch (args.ambassadorL1) {
        case (?l1) {
          switch (l1EvmAddr) {
            case (?addr) {
              // Each EVM send includes signing and raw tx submission.
              // Split transfers across messages to stay under instruction limits.
              let result = await sendEvmTransferMessage(
                transferContext,
                {
                  tokenId = args.tokenId;
                  signer = { derivationPath = []; publicKey = treasuryPubKey };
                  recipient = { address = addr; amount = l1Amount };
                  fee = evmTransferFee(nonce, feeEstimate);
                },
              );
              Vector.add(transfers, makeEvmTransferRecord(l1, addr, l1Amount, args.tokenId, result));
              nonce += 1;
            };
            case null return #err(#TransferFailed({ recipient = "l1"; error = "Failed to derive EVM address" }));
          };
        };
        case null {};
      };
    };

    // Transfer L2 share
    if (l2Amount > 0) {
      switch (args.ambassadorL2) {
        case (?l2) {
          switch (l2EvmAddr) {
            case (?addr) {
              let result = await sendEvmTransferMessage(
                transferContext,
                {
                  tokenId = args.tokenId;
                  signer = { derivationPath = []; publicKey = treasuryPubKey };
                  recipient = { address = addr; amount = l2Amount };
                  fee = evmTransferFee(nonce, feeEstimate);
                },
              );
              Vector.add(transfers, makeEvmTransferRecord(l2, addr, l2Amount, args.tokenId, result));
              nonce += 1;
            };
            case null return #err(#TransferFailed({ recipient = "l2"; error = "Failed to derive EVM address" }));
          };
        };
        case null {};
      };
    };

    // Track the next expected nonce so subsequent calls don't get NonceTooLow
    // when a previous pending tx hasn't propagated to the RPC node yet.
    treasury.lastNonce := ?nonce;

    finalizeDistribution(treasury, args, treasuryAmount, l1Amount, l2Amount, transfers);
  };

  func distributeSol(
    treasury : Treasury,
    args : Types.DistributePaymentArgs,
  ) : async* Types.DistributePaymentResult {
    let solConfig = switch (getSolanaChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#SolNotConfigured);
    };

    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.amount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);

    let api = treasury.schnorrApi;
    let rpcSources = buildSolRpcSources(solConfig);

    // Derive treasury Solana address + public key (sender of outgoing SOL transfers
    // AND holder of the treasury share — funds stay here after distribution).
    let (treasurySolAddr, treasuryPubKey) = switch (await* SolRpc.deriveTreasurySolAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok(pair)) pair;
      case (#err(e)) return #err(#TransferFailed({ recipient = "treasury"; error = e }));
    };

    var transfers = Vector.new<Types.TransferRecord>();

    // Resolve Solana addresses for ambassador recipients only.
    let l1SolAddr = if (l1Amount == 0) {
      null;
    } else switch (args.ambassadorL1) {
      case (?l1) await* resolveSolAddress(treasury, l1, solConfig, api);
      case null null;
    };
    let l2SolAddr = if (l2Amount == 0) {
      null;
    } else switch (args.ambassadorL2) {
      case (?l2) await* resolveSolAddress(treasury, l2, solConfig, api);
      case null null;
    };

    // Force a commit point between Schnorr/address resolution and SOL RPC calls.
    // Helper to send a SOL/SPL transfer
    func sendSolOrSplTransfer(toAddr : Text, amount : Nat) : async Result.Result<Text, Text> {
      switch (getSolMintAddress(args.tokenId, solConfig)) {
        case (?mintAddress) {
          // SPL transfer
          await* SolRpc.sendSplTransfer(
            {
              solRpcCanisterId = solConfig.solRpcCanisterId;
              rpcSources;
              schnorrKeyName = treasury.store.thresholdKeyName;
              derivationPath = [];
              senderPubKey = treasuryPubKey;
              mintAddress;
              toAddress = toAddr;
              amount = Nat64.fromNat(amount);
              decimals = getSolTokenDecimals(args.tokenId, solConfig);
            },
            api,
          );
        };
        case null {
          // Native SOL transfer
          await* SolRpc.sendSolTransfer(
            {
              solRpcCanisterId = solConfig.solRpcCanisterId;
              rpcSources;
              schnorrKeyName = treasury.store.thresholdKeyName;
              derivationPath = [];
              senderPubKey = treasuryPubKey;
              toAddress = toAddr;
              lamports = Nat64.fromNat(amount);
            },
            api,
          );
        };
      };
    };

    // Treasury share: retained at treasurySolAddr (funds already arrived there).
    if (treasuryAmount > 0) {
      Vector.add(transfers, makeSolTransferRecord(treasury.canisterId, treasurySolAddr, treasuryAmount, args.tokenId, #ok("retained-at-treasury-address")));
    };

    // Transfer L1 share
    if (l1Amount > 0) {
      switch (args.ambassadorL1) {
        case (?l1) {
          switch (l1SolAddr) {
            case (?addr) {
              let result = await sendSolOrSplTransfer(addr, l1Amount);
              Vector.add(transfers, makeSolTransferRecord(l1, addr, l1Amount, args.tokenId, result));
            };
            case null return #err(#TransferFailed({ recipient = "l1"; error = "Failed to derive SOL address" }));
          };
        };
        case null {};
      };
    };

    // Transfer L2 share
    if (l2Amount > 0) {
      switch (args.ambassadorL2) {
        case (?l2) {
          switch (l2SolAddr) {
            case (?addr) {
              let result = await sendSolOrSplTransfer(addr, l2Amount);
              Vector.add(transfers, makeSolTransferRecord(l2, addr, l2Amount, args.tokenId, result));
            };
            case null return #err(#TransferFailed({ recipient = "l2"; error = "Failed to derive SOL address" }));
          };
        };
        case null {};
      };
    };

    finalizeDistribution(treasury, args, treasuryAmount, l1Amount, l2Amount, transfers);
  };

  func finalizeDistribution(
    treasury : Treasury,
    args : Types.DistributePaymentArgs,
    treasuryAmount : Nat,
    l1Amount : Nat,
    l2Amount : Nat,
    transfers : Vector.Vector<Types.TransferRecord>,
  ) : Types.DistributePaymentResult {
    let transfersArray = Vector.toArray(transfers);

    // Determine status: #partial if any transfer failed, #completed otherwise.
    var hasError = false;
    for (t in transfersArray.vals()) {
      switch (t.error) {
        case (?_) { hasError := true };
        case null {};
      };
    };
    let status : Types.DistributionStatus = if (hasError) #partial else #completed;

    let record : Types.DistributionRecord = {
      id = treasury.store.nextDistributionId;
      paymentId = args.paymentId;
      payer = args.payer;
      tokenId = args.tokenId;
      totalAmount = args.amount;
      treasuryAmount;
      l1Amount;
      l2Amount;
      ambassadorL1 = args.ambassadorL1;
      ambassadorL2 = args.ambassadorL2;
      timestamp = Time.now();
      transfers = transfersArray;
      status;
    };

    // Always persist the record and mark paymentId as processed,
    // even on partial failure — prevents double-sends on retry.
    Vector.add(treasury.store.distributions, record);
    treasury.store.nextDistributionId += 1;
    Set.add(treasury.store.processedPayments, Text.compare, args.paymentId);

    if (hasError) {
      #err(#PartiallyCompleted(record));
    } else {
      #ok(record);
    };
  };

  // ---- Withdraw ----

  /// Withdraw funds from user's subaccount (IC) or EVM wallet.
  public func withdraw(
    treasury : Treasury,
    caller : Principal,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    let minAmount = getMinWithdraw(args.tokenId, treasury.store.distributionConfig);

    if (args.amount < minAmount) {
      return #err(#BelowMinimum({ minimum = minAmount }));
    };

    if (isIcToken(args.tokenId)) {
      await* withdrawIc(treasury, caller, args);
    } else if (isSolToken(args.tokenId)) {
      await* withdrawSol(treasury, caller, args);
    } else {
      await* withdrawEvm(treasury, caller, args);
    };
  };

  func withdrawIc(
    treasury : Treasury,
    caller : Principal,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    // Check destination first — IC tokens can only go to IC addresses
    let (toOwner, toSubaccount) = switch (args.to) {
      case (#IC({ owner; subaccount })) (owner, subaccount);
      case (#EVM(_)) return #err(#TransferFailed("IC token cannot be withdrawn to EVM address"));
      case (#SOL(_)) return #err(#TransferFailed("IC token cannot be withdrawn to SOL address"));
    };

    let ledger = getIcLedger(args.tokenId);
    let fee = getIcFee(args.tokenId);

    let callerSubaccount = Account.principalToSubaccount(caller);
    let balance = await ledger.icrc1_balance_of({
      owner = treasury.canisterId;
      subaccount = ?callerSubaccount;
    });

    if (balance < args.amount + fee) {
      return #err(#InsufficientBalance({ available = balance }));
    };

    let result = await ledger.icrc1_transfer({
      to = { owner = toOwner; subaccount = toSubaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = ?callerSubaccount;
      created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
      amount = args.amount;
    });

    switch (result) {
      case (#Ok(blockIndex)) #ok({
        tokenId = args.tokenId;
        amount = args.amount;
        tx = #IC({ blockIndex = blockIndex });
      });
      case (#Err(err)) #err(#TransferFailed(debug_show (err)));
    };
  };

  func withdrawEvm(
    treasury : Treasury,
    caller : Principal,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    let evmConfig = switch (getEvmChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#EvmNotConfigured);
    };

    let toAddress = switch (args.to) {
      case (#EVM({ address })) address;
      case (#IC(_)) return #err(#TransferFailed("EVM token cannot be withdrawn to IC address"));
      case (#SOL(_)) return #err(#TransferFailed("EVM token cannot be withdrawn to SOL address"));
    };

    let api = treasury.ecdsaApi;
    let ecCtx = getEcCtx(treasury);
    let rpcServices = buildRpcServices(evmConfig);

    let callerPubKey = switch (await* getCachedPublicKey(treasury, caller, treasury.store.thresholdKeyName, api)) {
      case (?pk) pk;
      case null return #err(#TransferFailed("Failed to derive caller public key"));
    };

    let callerEvmAddr = switch (await* resolveEvmAddress(treasury, caller, evmConfig, api)) {
      case (?addr) addr;
      case null return #err(#TransferFailed("Failed to derive caller EVM address"));
    };

    let balance = switch (await getEvmTokenBalanceStep(evmConfig, args.tokenId, callerEvmAddr)) {
      case (#ok(b)) b;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    if (balance < args.amount) {
      return #err(#InsufficientBalance({ available = balance }));
    };

    let nonce = switch (await* EvmRpc.getNonce(evmConfig.evmRpcCanisterId, rpcServices, callerEvmAddr)) {
      case (#ok(n)) n;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    let feeEstimate = switch (await* getEvmFeeEstimate(evmConfig, rpcServices)) {
      case (#ok(value)) value;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    let transferContext : EvmTransferContext = {
      thresholdKeyName = treasury.store.thresholdKeyName;
      evmConfig;
      rpcServices;
      ecCtx;
      api;
    };

    let result = await sendEvmTransferMessage(
      transferContext,
      {
        tokenId = args.tokenId;
        signer = {
          derivationPath = [Principal.toBlob(caller)];
          publicKey = callerPubKey;
        };
        recipient = { address = toAddress; amount = args.amount };
        fee = evmTransferFee(nonce, feeEstimate);
      },
    );

    switch (result) {
      case (#ok(txHash)) #ok({
        tokenId = args.tokenId;
        amount = args.amount;
        tx = #EVM({ txHash = txHash });
      });
      case (#err(e)) #err(#TransferFailed(e));
    };
  };

  func withdrawSol(
    treasury : Treasury,
    caller : Principal,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    let solConfig = switch (getSolanaChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#SolNotConfigured);
    };

    let toAddress = switch (args.to) {
      case (#SOL({ address })) address;
      case (#IC(_)) return #err(#TransferFailed("SOL token cannot be withdrawn to IC address"));
      case (#EVM(_)) return #err(#TransferFailed("SOL token cannot be withdrawn to EVM address"));
    };

    let api = treasury.schnorrApi;
    let rpcSources = buildSolRpcSources(solConfig);

    // Derive caller's Solana address (source of the transfer)
    let callerSolAddr = switch (await* resolveSolAddress(treasury, caller, solConfig, api)) {
      case (?addr) addr;
      case null return #err(#TransferFailed("Failed to derive caller SOL address"));
    };

    // Get caller's Solana public key for signing
    let callerPubKeyResult = await* SolRpc.deriveSolAddress(treasury.store.thresholdKeyName, caller, api);
    let callerPubKey = switch (callerPubKeyResult) {
      case (#ok((_addr, pubKey))) pubKey;
      case (#err(e)) return #err(#TransferFailed("Failed to derive caller public key: " # e));
    };

    // Force a commit point between Schnorr/address resolution and SOL RPC calls.
    // Check balance
    let balance = switch (await getSolTokenBalanceStep(solConfig, args.tokenId, callerSolAddr)) {
      case (#ok(b)) b;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    if (balance < args.amount) {
      return #err(#InsufficientBalance({ available = balance }));
    };

    // Send transfer (from caller's derived address to destination)
    let result = switch (getSolMintAddress(args.tokenId, solConfig)) {
      case (?mintAddress) {
        await* SolRpc.sendSplTransfer(
          {
            solRpcCanisterId = solConfig.solRpcCanisterId;
            rpcSources;
            schnorrKeyName = treasury.store.thresholdKeyName;
            derivationPath = [Principal.toBlob(caller)];
            senderPubKey = callerPubKey;
            mintAddress;
            toAddress;
            amount = Nat64.fromNat(args.amount);
            decimals = getSolTokenDecimals(args.tokenId, solConfig);
          },
          api,
        );
      };
      case null {
        await* SolRpc.sendSolTransfer(
          {
            solRpcCanisterId = solConfig.solRpcCanisterId;
            rpcSources;
            schnorrKeyName = treasury.store.thresholdKeyName;
            derivationPath = [Principal.toBlob(caller)];
            senderPubKey = callerPubKey;
            toAddress;
            lamports = Nat64.fromNat(args.amount);
          },
          api,
        );
      };
    };

    switch (result) {
      case (#ok(signature)) #ok({
        tokenId = args.tokenId;
        amount = args.amount;
        tx = #SOL({ signature = signature });
      });
      case (#err(e)) #err(#TransferFailed(e));
    };
  };

  // ---- Charge and Distribute ----

  /// Charge from user's derived wallet and distribute to treasury + ambassadors in one step.
  /// Makes 1-3 transfers directly FROM user's wallet (subaccount/EVM/SOL)
  /// TO treasury and ambassador wallets. Access control delegated to parent canister.
  public func chargeAndDistribute(
    treasury : Treasury,
    args : Types.ChargeAndDistributeArgs,
  ) : async* Types.ChargeAndDistributeResult {
    if (Set.contains(treasury.store.processedPayments, Text.compare, args.paymentId)) {
      return #err(#AlreadyProcessed);
    };

    if (args.totalAmount == 0) {
      return #err(#InvalidAmount);
    };

    // Convert to DistributePaymentArgs-like structure for reuse of finalization
    let distArgs : Types.DistributePaymentArgs = {
      paymentId = args.paymentId;
      payer = args.userId;
      tokenId = args.tokenId;
      amount = args.totalAmount;
      ambassadorL1 = args.ambassadorL1;
      ambassadorL2 = args.ambassadorL2;
      metadata = args.metadata;
    };

    if (isIcToken(args.tokenId)) {
      await* chargeAndDistributeIc(treasury, args, distArgs);
    } else if (isSolToken(args.tokenId)) {
      await* chargeAndDistributeSol(treasury, args, distArgs);
    } else {
      await* chargeAndDistributeEvm(treasury, args, distArgs);
    };
  };

  /// Deferred ambassador payout for a previously-charged license.
  ///
  /// Contract: the original charge landed 100% in the treasury subaccount
  /// (caller should have passed `null` ambassadors to `chargeAndDistribute`
  /// for a refundable flow). This call transfers the L1/L2 ambassador shares
  /// from the treasury subaccount to the ambassador subaccounts — completing
  /// the two-phase payment once the transaction has moved past its refund
  /// window (e.g. canister successfully created).
  ///
  /// Dedup: `"ambassador:" # paymentId` in `processedPayments`. This is a
  /// separate key from the original charge so the two phases can coexist.
  ///
  /// Token scope: IC only for now. EVM/SOL returns `#ok` with an empty
  /// record — those chains keep charge-time distribution because their
  /// refund path is unsupported (see `simpleRefund`).
  public func distributeAmbassadorShare(
    treasury : Treasury,
    args : Types.DistributeAmbassadorShareArgs,
  ) : async* Types.DistributeAmbassadorShareResult {
    if (args.totalAmount == 0) return #err(#InvalidAmount);

    let dedupKey = "ambassador:" # args.paymentId;
    if (Set.contains(treasury.store.processedPayments, Text.compare, dedupKey)) {
      return #err(#AlreadyProcessed);
    };

    // Reuse DistributePaymentArgs shape for finalizeDistribution — we override
    // `paymentId` with the prefixed dedup key so the log row for the payout
    // phase is distinct from the charge phase row.
    let distArgs : Types.DistributePaymentArgs = {
      paymentId = dedupKey;
      payer = args.payer;
      tokenId = args.tokenId;
      amount = args.totalAmount;
      ambassadorL1 = args.ambassadorL1;
      ambassadorL2 = args.ambassadorL2;
      metadata = args.metadata;
    };

    if (isIcToken(args.tokenId)) {
      await* distributeAmbassadorShareIc(treasury, args, distArgs);
    } else {
      // EVM/SOL: charge-time split still applies (no refund path breaks it),
      // so the deferred payout is a no-op. Record an empty row for audit
      // symmetry and mark the dedup key processed.
      let emptyRecord : Types.DistributionRecord = {
        id = treasury.store.nextDistributionId;
        paymentId = dedupKey;
        payer = args.payer;
        tokenId = args.tokenId;
        totalAmount = args.totalAmount;
        treasuryAmount = 0;
        l1Amount = 0;
        l2Amount = 0;
        ambassadorL1 = args.ambassadorL1;
        ambassadorL2 = args.ambassadorL2;
        timestamp = Time.now();
        transfers = [];
        status = #completed;
      };
      Vector.add(treasury.store.distributions, emptyRecord);
      treasury.store.nextDistributionId += 1;
      Set.add(treasury.store.processedPayments, Text.compare, dedupKey);
      #ok(emptyRecord);
    };
  };

  /// IC: transfer ambassador shares FROM treasury subaccount TO L1/L2
  /// subaccounts. Treasury share is not moved — it already sits in the
  /// treasury subaccount from the original charge.
  func distributeAmbassadorShareIc(
    treasury : Treasury,
    args : Types.DistributeAmbassadorShareArgs,
    distArgs : Types.DistributePaymentArgs,
  ) : async* Types.DistributeAmbassadorShareResult {
    let (_treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.totalAmount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);

    // No ambassadors → record an empty payout row for audit and return.
    if (l1Amount == 0 and l2Amount == 0) {
      let emptyRecord : Types.DistributionRecord = {
        id = treasury.store.nextDistributionId;
        paymentId = distArgs.paymentId;
        payer = args.payer;
        tokenId = args.tokenId;
        totalAmount = args.totalAmount;
        treasuryAmount = 0;
        l1Amount = 0;
        l2Amount = 0;
        ambassadorL1 = null;
        ambassadorL2 = null;
        timestamp = Time.now();
        transfers = [];
        status = #completed;
      };
      Vector.add(treasury.store.distributions, emptyRecord);
      treasury.store.nextDistributionId += 1;
      Set.add(treasury.store.processedPayments, Text.compare, distArgs.paymentId);
      return #ok(emptyRecord);
    };

    let ledger = getIcLedger(args.tokenId);
    let fee = getIcFee(args.tokenId);
    let treasurySubaccount = Const.treasurySubaccount();
    let now = Time.now();

    var transfers = Vector.new<Types.TransferRecord>();

    // Transfer L1 share: treasury subaccount → L1 subaccount.
    switch (args.ambassadorL1) {
      case (?l1) {
        if (l1Amount > fee) {
          let l1Net = l1Amount - fee;
          let l1Subaccount = Account.principalToSubaccount(l1);
          let l1Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l1Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = ?treasurySubaccount;
            created_at_time = ?Nat64.fromNat(Int.abs(now));
            amount = l1Net;
          });
          Vector.add(transfers, makeIcTransferRecord(l1, ?l1Subaccount, l1Net, args.tokenId, l1Result));
        };
      };
      case null {};
    };

    // Transfer L2 share: treasury subaccount → L2 subaccount.
    switch (args.ambassadorL2) {
      case (?l2) {
        if (l2Amount > fee) {
          let l2Net = l2Amount - fee;
          let l2Subaccount = Account.principalToSubaccount(l2);
          let l2Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l2Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = ?treasurySubaccount;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 1);
            amount = l2Net;
          });
          Vector.add(transfers, makeIcTransferRecord(l2, ?l2Subaccount, l2Net, args.tokenId, l2Result));
        };
      };
      case null {};
    };

    // `treasuryAmount` in the payout row is 0 — no new treasury intake here.
    finalizeDistribution(treasury, distArgs, 0, l1Amount, l2Amount, transfers);
  };

  /// IC: charge from user subaccount → admin/L1/L2 subaccounts
  func chargeAndDistributeIc(
    treasury : Treasury,
    args : Types.ChargeAndDistributeArgs,
    distArgs : Types.DistributePaymentArgs,
  ) : async* Types.ChargeAndDistributeResult {
    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.totalAmount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);

    let ledger = getIcLedger(args.tokenId);
    let fee = getIcFee(args.tokenId);
    let userSubaccount = Account.principalToSubaccount(args.userId);
    let now = Time.now();

    // Pre-check: ensure user has enough balance
    let totalFees = fee * (
      1
      + (if (l1Amount > 0 and args.ambassadorL1 != null) 1 else 0)
      + (if (l2Amount > 0 and args.ambassadorL2 != null) 1 else 0)
    );
    let balance = await ledger.icrc1_balance_of({
      owner = treasury.canisterId;
      subaccount = ?userSubaccount;
    });
    if (balance < args.totalAmount + totalFees) {
      return #err(#TransferFailed({ recipient = "pre-check"; error = "Insufficient IC token balance for charge" }));
    };

    var transfers = Vector.new<Types.TransferRecord>();

    // Transfer treasury share: user subaccount → fixed TREASURY_SUBACCOUNT
    let treasurySubaccount = Const.treasurySubaccount();
    let treasuryNet = if (treasuryAmount > fee) { treasuryAmount - fee } else { 0 };
    let treasuryResult = await ledger.icrc1_transfer({
      to = { owner = treasury.canisterId; subaccount = ?treasurySubaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = ?userSubaccount;
      created_at_time = ?Nat64.fromNat(Int.abs(now));
      amount = treasuryNet;
    });
    Vector.add(transfers, makeIcTransferRecord(treasury.canisterId, ?treasurySubaccount, treasuryNet, args.tokenId, treasuryResult));

    // Transfer L1 share from user subaccount → L1 subaccount
    switch (args.ambassadorL1) {
      case (?l1) {
        if (l1Amount > fee) {
          let l1Net = l1Amount - fee;
          let l1Subaccount = Account.principalToSubaccount(l1);
          let l1Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l1Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = ?userSubaccount;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 1);
            amount = l1Net;
          });
          Vector.add(transfers, makeIcTransferRecord(l1, ?l1Subaccount, l1Net, args.tokenId, l1Result));
        };
      };
      case null {};
    };

    // Transfer L2 share from user subaccount → L2 subaccount
    switch (args.ambassadorL2) {
      case (?l2) {
        if (l2Amount > fee) {
          let l2Net = l2Amount - fee;
          let l2Subaccount = Account.principalToSubaccount(l2);
          let l2Result = await ledger.icrc1_transfer({
            to = { owner = treasury.canisterId; subaccount = ?l2Subaccount };
            fee = ?fee;
            memo = null;
            from_subaccount = ?userSubaccount;
            created_at_time = ?Nat64.fromNat(Int.abs(now) + 2);
            amount = l2Net;
          });
          Vector.add(transfers, makeIcTransferRecord(l2, ?l2Subaccount, l2Net, args.tokenId, l2Result));
        };
      };
      case null {};
    };

    finalizeDistribution(treasury, distArgs, treasuryAmount, l1Amount, l2Amount, transfers);
  };

  /// EVM: charge from user's derived EVM address → admin/L1/L2 EVM addresses
  func chargeAndDistributeEvm(
    treasury : Treasury,
    args : Types.ChargeAndDistributeArgs,
    distArgs : Types.DistributePaymentArgs,
  ) : async* Types.ChargeAndDistributeResult {
    let evmConfig = switch (getEvmChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#EvmNotConfigured);
    };

    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.totalAmount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);
    let api = treasury.ecdsaApi;
    let ecCtx = getEcCtx(treasury);
    let rpcServices = buildRpcServices(evmConfig);

    // Derive user's public key and EVM address (sender)
    let userPubKey = switch (await* getCachedPublicKey(treasury, args.userId, treasury.store.thresholdKeyName, api)) {
      case (?pk) pk;
      case null return #err(#TransferFailed({ recipient = "user"; error = "Failed to derive user public key" }));
    };
    let userEvmAddr = switch (await* resolveEvmAddress(treasury, args.userId, evmConfig, api)) {
      case (?addr) addr;
      case null return #err(#TransferFailed({ recipient = "user"; error = "Failed to derive user EVM address" }));
    };

    // Resolve recipient EVM addresses. Treasury destination = the fixed
    // treasury-derived address (empty derivation path), not admin-derived.
    let treasuryEvmAddr = switch (await* EvmRpc.deriveTreasuryAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok((addr, _))) addr;
      case (#err(e)) return #err(#TransferFailed({ recipient = "treasury"; error = e }));
    };
    let l1EvmAddr = if (l1Amount == 0) { null } else switch (args.ambassadorL1) { case (?l1) await* resolveEvmAddress(treasury, l1, evmConfig, api); case null null };
    let l2EvmAddr = if (l2Amount == 0) { null } else switch (args.ambassadorL2) { case (?l2) await* resolveEvmAddress(treasury, l2, evmConfig, api); case null null };

    // Pre-check balance
    let balance = switch (await getEvmTokenBalanceStep(evmConfig, args.tokenId, userEvmAddr)) {
      case (#ok(b)) b;
      case (#err(e)) return #err(#TransferFailed({ recipient = "pre-check"; error = e }));
    };
    if (balance < args.totalAmount) {
      return #err(#TransferFailed({ recipient = "pre-check"; error = "Insufficient EVM token balance for charge" }));
    };

    var nonce = switch (await* EvmRpc.getNonce(evmConfig.evmRpcCanisterId, rpcServices, userEvmAddr)) {
      case (#ok(n)) n;
      case (#err(e)) return #err(#TransferFailed({ recipient = "nonce"; error = e }));
    };
    let feeEstimate = switch (await* getEvmFeeEstimate(evmConfig, rpcServices)) {
      case (#ok(value)) value;
      case (#err(e)) return #err(#TransferFailed({ recipient = "fee-estimate"; error = e }));
    };
    let transferContext : EvmTransferContext = {
      thresholdKeyName = treasury.store.thresholdKeyName;
      evmConfig;
      rpcServices;
      ecCtx;
      api;
    };
    let userDerivationPath = [Principal.toBlob(args.userId)];

    var transfers = Vector.new<Types.TransferRecord>();

    // Treasury share → fixed treasury EVM address
    let result = await sendEvmTransferMessage(
      transferContext,
      {
        tokenId = args.tokenId;
        signer = { derivationPath = userDerivationPath; publicKey = userPubKey };
        recipient = { address = treasuryEvmAddr; amount = treasuryAmount };
        fee = evmTransferFee(nonce, feeEstimate);
      },
    );
    Vector.add(transfers, makeEvmTransferRecord(treasury.canisterId, treasuryEvmAddr, treasuryAmount, args.tokenId, result));
    nonce += 1;

    // L1 share
    if (l1Amount > 0) {
      switch (args.ambassadorL1) {
        case (?l1) {
          switch (l1EvmAddr) {
            case (?addr) {
              let result = await sendEvmTransferMessage(
                transferContext,
                {
                  tokenId = args.tokenId;
                  signer = { derivationPath = userDerivationPath; publicKey = userPubKey };
                  recipient = { address = addr; amount = l1Amount };
                  fee = evmTransferFee(nonce, feeEstimate);
                },
              );
              Vector.add(transfers, makeEvmTransferRecord(l1, addr, l1Amount, args.tokenId, result));
              nonce += 1;
            };
            case null return #err(#TransferFailed({ recipient = "l1"; error = "Failed to derive L1 EVM address" }));
          };
        };
        case null {};
      };
    };

    // L2 share
    if (l2Amount > 0) {
      switch (args.ambassadorL2) {
        case (?l2) {
          switch (l2EvmAddr) {
            case (?addr) {
              let result = await sendEvmTransferMessage(
                transferContext,
                {
                  tokenId = args.tokenId;
                  signer = { derivationPath = userDerivationPath; publicKey = userPubKey };
                  recipient = { address = addr; amount = l2Amount };
                  fee = evmTransferFee(nonce, feeEstimate);
                },
              );
              Vector.add(transfers, makeEvmTransferRecord(l2, addr, l2Amount, args.tokenId, result));
              nonce += 1;
            };
            case null return #err(#TransferFailed({ recipient = "l2"; error = "Failed to derive L2 EVM address" }));
          };
        };
        case null {};
      };
    };

    finalizeDistribution(treasury, distArgs, treasuryAmount, l1Amount, l2Amount, transfers);
  };

  /// SOL: charge from user's derived SOL address → admin/L1/L2 SOL addresses
  func chargeAndDistributeSol(
    treasury : Treasury,
    args : Types.ChargeAndDistributeArgs,
    distArgs : Types.DistributePaymentArgs,
  ) : async* Types.ChargeAndDistributeResult {
    let solConfig = switch (getSolanaChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#SolNotConfigured);
    };

    let (treasuryAmount, l1Amount, l2Amount) = calculateSplit(args.totalAmount, args.ambassadorL1, args.ambassadorL2, treasury.store.distributionConfig);
    let api = treasury.schnorrApi;
    let rpcSources = buildSolRpcSources(solConfig);

    // Derive user's SOL address and public key
    let userSolAddr = switch (await* resolveSolAddress(treasury, args.userId, solConfig, api)) {
      case (?addr) addr;
      case null return #err(#TransferFailed({ recipient = "user"; error = "Failed to derive user SOL address" }));
    };
    let userPubKeyResult = await* SolRpc.deriveSolAddress(treasury.store.thresholdKeyName, args.userId, api);
    let userPubKey = switch (userPubKeyResult) {
      case (#ok((_, pk))) pk;
      case (#err(e)) return #err(#TransferFailed({ recipient = "user"; error = "Failed to derive user public key: " # e }));
    };

    // Resolve recipient addresses. Treasury destination = fixed treasury-derived
    // address (empty derivation path), not admin-derived.
    let treasurySolAddr = switch (await* SolRpc.deriveTreasurySolAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok((addr, _))) addr;
      case (#err(e)) return #err(#TransferFailed({ recipient = "treasury"; error = e }));
    };
    let l1SolAddr = if (l1Amount == 0) { null } else switch (args.ambassadorL1) { case (?l1) await* resolveSolAddress(treasury, l1, solConfig, api); case null null };
    let l2SolAddr = if (l2Amount == 0) { null } else switch (args.ambassadorL2) { case (?l2) await* resolveSolAddress(treasury, l2, solConfig, api); case null null };

    // Pre-check balance
    let balance = switch (await getSolTokenBalanceStep(solConfig, args.tokenId, userSolAddr)) {
      case (#ok(b)) b;
      case (#err(e)) return #err(#TransferFailed({ recipient = "pre-check"; error = e }));
    };
    if (balance < args.totalAmount) {
      return #err(#TransferFailed({ recipient = "pre-check"; error = "Insufficient SOL token balance for charge" }));
    };

    let userDerivationPath = [Principal.toBlob(args.userId)];

    func sendSolOrSplTransfer(toAddr : Text, amount : Nat) : async Result.Result<Text, Text> {
      switch (getSolMintAddress(args.tokenId, solConfig)) {
        case (?mintAddress) {
          await* SolRpc.sendSplTransfer(
            { solRpcCanisterId = solConfig.solRpcCanisterId; rpcSources; schnorrKeyName = treasury.store.thresholdKeyName; derivationPath = userDerivationPath; senderPubKey = userPubKey; mintAddress; toAddress = toAddr; amount = Nat64.fromNat(amount); decimals = getSolTokenDecimals(args.tokenId, solConfig) },
            api,
          );
        };
        case null {
          await* SolRpc.sendSolTransfer(
            { solRpcCanisterId = solConfig.solRpcCanisterId; rpcSources; schnorrKeyName = treasury.store.thresholdKeyName; derivationPath = userDerivationPath; senderPubKey = userPubKey; toAddress = toAddr; lamports = Nat64.fromNat(amount) },
            api,
          );
        };
      };
    };

    var transfers = Vector.new<Types.TransferRecord>();

    // Treasury share → fixed treasury SOL address
    let result = await sendSolOrSplTransfer(treasurySolAddr, treasuryAmount);
    Vector.add(transfers, makeSolTransferRecord(treasury.canisterId, treasurySolAddr, treasuryAmount, args.tokenId, result));

    // L1 share
    if (l1Amount > 0) {
      switch (args.ambassadorL1) {
        case (?l1) {
          switch (l1SolAddr) {
            case (?addr) {
              let result = await sendSolOrSplTransfer(addr, l1Amount);
              Vector.add(transfers, makeSolTransferRecord(l1, addr, l1Amount, args.tokenId, result));
            };
            case null return #err(#TransferFailed({ recipient = "l1"; error = "Failed to derive L1 SOL address" }));
          };
        };
        case null {};
      };
    };

    // L2 share
    if (l2Amount > 0) {
      switch (args.ambassadorL2) {
        case (?l2) {
          switch (l2SolAddr) {
            case (?addr) {
              let result = await sendSolOrSplTransfer(addr, l2Amount);
              Vector.add(transfers, makeSolTransferRecord(l2, addr, l2Amount, args.tokenId, result));
            };
            case null return #err(#TransferFailed({ recipient = "l2"; error = "Failed to derive L2 SOL address" }));
          };
        };
        case null {};
      };
    };

    finalizeDistribution(treasury, distArgs, treasuryAmount, l1Amount, l2Amount, transfers);
  };

  // ---- Simple Transfer (no ambassador split) ----

  /// Transfer from user subaccount → treasury subaccount. Single ICRC-1 transfer.
  /// Used for top-up charges where no ambassador distribution is needed.
  /// Returns block index on success. Access control delegated to parent canister.
  public func simpleTransfer(
    treasury : Treasury,
    userId : Principal,
    tokenId : Types.TokenId,
    amount : Nat,
  ) : async* Result.Result<Nat, Text> {
    if (not isIcToken(tokenId)) {
      return #err("simpleTransfer only supports IC tokens");
    };

    let ledger = getIcLedger(tokenId);
    let fee = getIcFee(tokenId);
    let userSubaccount = Account.principalToSubaccount(userId);
    let treasurySubaccount = Const.treasurySubaccount();

    if (amount <= fee) return #err("Amount too small to cover fee");

    let result = await ledger.icrc1_transfer({
      to = { owner = treasury.canisterId; subaccount = ?treasurySubaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = ?userSubaccount;
      created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
      amount = amount - fee;
    });
    switch (result) {
      case (#Ok(idx)) #ok(idx);
      case (#Err(err)) #err("Transfer failed: " # debug_show err);
    };
  };

  func simpleRefundIc(
    treasury : Treasury,
    userId : Principal,
    tokenId : Types.TokenId,
    maxAmount : Nat,
  ) : async* Result.Result<Types.RefundReceipt, Text> {
    let ledger = getIcLedger(tokenId);
    let fee = getIcFee(tokenId);
    let treasurySubaccount = Const.treasurySubaccount();
    let userSubaccount = Account.principalToSubaccount(userId);

    // Check actual treasury balance to refund as much as possible
    let treasuryBalance = await ledger.icrc1_balance_of({
      owner = treasury.canisterId;
      subaccount = ?treasurySubaccount;
    });

    let refundAmount = Nat.min(treasuryBalance, maxAmount);
    if (refundAmount <= fee) return #err("Refund amount too small to cover fee");

    let result = await ledger.icrc1_transfer({
      to = { owner = treasury.canisterId; subaccount = ?userSubaccount };
      fee = ?fee;
      memo = null;
      from_subaccount = ?treasurySubaccount;
      created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
      amount = refundAmount - fee;
    });
    switch (result) {
      case (#Ok(blockIndex)) #ok({
        tokenId;
        amount = refundAmount - fee;
        recipient = userId;
        network = #ic;
        reference = #blockIndex(blockIndex);
        at = Time.now();
      });
      case (#Err(err)) #err("Refund failed: " # debug_show err);
    };
  };

  func simpleRefundEvm(
    treasury : Treasury,
    userId : Principal,
    tokenId : Types.TokenId,
    maxAmount : Nat,
  ) : async* Result.Result<Types.RefundReceipt, Text> {
    let evmConfig = switch (getEvmChainConfig(treasury.store.chains, tokenId)) {
      case (?cfg) cfg;
      case null return #err("EVM chain not configured for refund");
    };

    let api = treasury.ecdsaApi;
    let ecCtx = getEcCtx(treasury);
    let rpcServices = buildRpcServices(evmConfig);
    let (treasuryEvmAddr, treasuryPubKey) = switch (await* EvmRpc.deriveTreasuryAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok(pair)) pair;
      case (#err(e)) return #err("Failed to derive treasury EVM address: " # e);
    };
    let userEvmAddr = switch (await* resolveEvmAddress(treasury, userId, evmConfig, api)) {
      case (?addr) addr;
      case null return #err("Failed to derive user EVM address");
    };
    let balance = switch (await getEvmTokenBalanceStep(evmConfig, tokenId, treasuryEvmAddr)) {
      case (#ok(value)) value;
      case (#err(e)) return #err("Failed to read treasury EVM balance: " # e);
    };
    if (balance < maxAmount) {
      return #err("Insufficient treasury EVM balance for refund");
    };

    let remoteNonce = switch (await* EvmRpc.getNonce(evmConfig.evmRpcCanisterId, rpcServices, treasuryEvmAddr)) {
      case (#ok(n)) n;
      case (#err(e)) return #err("Failed to get treasury EVM nonce: " # e);
    };
    let nonce = switch (treasury.lastNonce) {
      case (?local) if (local > remoteNonce) local else remoteNonce;
      case null remoteNonce;
    };
    let feeEstimate = switch (await* getEvmFeeEstimate(evmConfig, rpcServices)) {
      case (#ok(value)) value;
      case (#err(e)) return #err("Failed to get EVM fee estimate: " # e);
    };
    let transferContext : EvmTransferContext = {
      thresholdKeyName = treasury.store.thresholdKeyName;
      evmConfig;
      rpcServices;
      ecCtx;
      api;
    };
    let result = await sendEvmTransferMessage(
      transferContext,
      {
        tokenId;
        signer = { derivationPath = []; publicKey = treasuryPubKey };
        recipient = { address = userEvmAddr; amount = maxAmount };
        fee = evmTransferFee(nonce, feeEstimate);
      },
    );
    switch (result) {
      case (#ok(txHash)) {
        treasury.lastNonce := ?(nonce + 1);
        #ok({
          tokenId;
          amount = maxAmount;
          recipient = userId;
          network = #evm;
          reference = #txHash(txHash);
          at = Time.now();
        });
      };
      case (#err(e)) #err("EVM refund failed: " # e);
    };
  };

  func simpleRefundSol(
    treasury : Treasury,
    userId : Principal,
    tokenId : Types.TokenId,
    maxAmount : Nat,
  ) : async* Result.Result<Types.RefundReceipt, Text> {
    let solConfig = switch (getSolanaChainConfig(treasury.store.chains, tokenId)) {
      case (?cfg) cfg;
      case null return #err("Solana chain not configured for refund");
    };

    let api = treasury.schnorrApi;
    let rpcSources = buildSolRpcSources(solConfig);
    let (treasurySolAddr, treasuryPubKey) = switch (await* SolRpc.deriveTreasurySolAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok(pair)) pair;
      case (#err(e)) return #err("Failed to derive treasury Solana address: " # e);
    };
    let userSolAddr = switch (await* resolveSolAddress(treasury, userId, solConfig, api)) {
      case (?addr) addr;
      case null return #err("Failed to derive user Solana address");
    };
    let balance = switch (await getSolTokenBalanceStep(solConfig, tokenId, treasurySolAddr)) {
      case (#ok(value)) value;
      case (#err(e)) return #err("Failed to read treasury Solana balance: " # e);
    };
    if (balance < maxAmount) {
      return #err("Insufficient treasury Solana balance for refund");
    };

    let result = switch (getSolMintAddress(tokenId, solConfig)) {
      case (?mintAddress) {
        await* SolRpc.sendSplTransfer(
          {
            solRpcCanisterId = solConfig.solRpcCanisterId;
            rpcSources;
            schnorrKeyName = treasury.store.thresholdKeyName;
            derivationPath = [];
            senderPubKey = treasuryPubKey;
            mintAddress;
            toAddress = userSolAddr;
            amount = Nat64.fromNat(maxAmount);
            decimals = getSolTokenDecimals(tokenId, solConfig);
          },
          api,
        );
      };
      case null {
        await* SolRpc.sendSolTransfer(
          {
            solRpcCanisterId = solConfig.solRpcCanisterId;
            rpcSources;
            schnorrKeyName = treasury.store.thresholdKeyName;
            derivationPath = [];
            senderPubKey = treasuryPubKey;
            toAddress = userSolAddr;
            lamports = Nat64.fromNat(maxAmount);
          },
          api,
        );
      };
    };
    switch (result) {
      case (#ok(signature)) #ok({
        tokenId;
        amount = maxAmount;
        recipient = userId;
        network = #solana;
        reference = #signature(signature);
        at = Time.now();
      });
      case (#err(e)) #err("Solana refund failed: " # e);
    };
  };

  /// Refund from treasury pool back to the user's derived wallet.
  /// IC tokens use the fixed treasury subaccount. EVM/SOL tokens use the
  /// treasury-derived chain address, which is where chargeAndDistribute stores
  /// top-up payments when no ambassadors are attached.
  public func simpleRefund(
    treasury : Treasury,
    userId : Principal,
    tokenId : Types.TokenId,
    maxAmount : Nat,
  ) : async* Result.Result<Types.RefundReceipt, Text> {
    if (isIcToken(tokenId)) {
      await* simpleRefundIc(treasury, userId, tokenId, maxAmount);
    } else if (isSolToken(tokenId)) {
      await* simpleRefundSol(treasury, userId, tokenId, maxAmount);
    } else {
      await* simpleRefundEvm(treasury, userId, tokenId, maxAmount);
    };
  };

  /// Get all non-zero balances for a user across all chains.
  /// Access control delegated to parent canister.
  public func getUserBalances(
    treasury : Treasury,
    userId : Principal,
  ) : async* [Types.BalanceEntry] {
    await* getBalances(treasury, userId);
  };

  // ---- Balance queries ----

  /// Get balance for a specific token.
  public func getBalance(
    treasury : Treasury,
    caller : Principal,
    tokenId : Types.TokenId,
  ) : async* Nat {
    if (isIcToken(tokenId)) {
      let ledger = getIcLedger(tokenId);
      let subaccount = Account.principalToSubaccount(caller);
      await ledger.icrc1_balance_of({
        owner = treasury.canisterId;
        subaccount = ?subaccount;
      });
    } else if (isSolToken(tokenId)) {
      let solConfig = switch (getSolanaChainConfig(treasury.store.chains, tokenId)) {
        case (?cfg) cfg;
        case null {
          Debug.print("[getBalance " # debug_show tokenId # "] no Solana chain config for caller=" # Principal.toText(caller));
          return 0;
        };
      };
      let callerSolAddr = switch (await* resolveSolAddress(treasury, caller, solConfig, treasury.schnorrApi)) {
        case (?addr) addr;
        case null {
          Debug.print("[getBalance " # debug_show tokenId # "] resolveSolAddress returned null for caller=" # Principal.toText(caller));
          return 0;
        };
      };
      Debug.print("[getBalance " # debug_show tokenId # "] caller=" # Principal.toText(caller) # " solAddr=" # callerSolAddr);
      switch (await getSolTokenBalanceStep(solConfig, tokenId, callerSolAddr)) {
        case (#ok(b)) {
          Debug.print("[getBalance " # debug_show tokenId # "] solRpc ok balance=" # Nat.toText(b));
          b;
        };
        case (#err(e)) {
          Debug.print("[getBalance " # debug_show tokenId # "] solRpc err=" # e);
          0;
        };
      };
    } else {
      let evmConfig = switch (getEvmChainConfig(treasury.store.chains, tokenId)) {
        case (?cfg) cfg;
        case null {
          Debug.print("[getBalance " # debug_show tokenId # "] no EVM chain config for caller=" # Principal.toText(caller));
          return 0;
        };
      };
      let callerEvmAddr = switch (await* resolveEvmAddress(treasury, caller, evmConfig, treasury.ecdsaApi)) {
        case (?addr) addr;
        case null {
          Debug.print("[getBalance " # debug_show tokenId # "] resolveEvmAddress returned null for caller=" # Principal.toText(caller));
          return 0;
        };
      };
      Debug.print("[getBalance " # debug_show tokenId # "] caller=" # Principal.toText(caller) # " evmAddr=" # callerEvmAddr);
      switch (await getEvmTokenBalanceStep(evmConfig, tokenId, callerEvmAddr)) {
        case (#ok(b)) {
          Debug.print("[getBalance " # debug_show tokenId # "] evmRpc ok balance=" # Nat.toText(b));
          b;
        };
        case (#err(e)) {
          Debug.print("[getBalance " # debug_show tokenId # "] evmRpc err=" # e);
          0;
        };
      };
    };
  };

  /// Get balances across all supported IC tokens.
  public func getBalances(
    treasury : Treasury,
    caller : Principal,
  ) : async* [Types.BalanceEntry] {
    let subaccount = Account.principalToSubaccount(caller);
    let tokens : [Types.TokenId] = [#ICP, #ckUSDC, #ckUSDT, #ckETH];
    var results = Vector.new<Types.BalanceEntry>();

    for (tokenId in tokens.vals()) {
      let ledger = getIcLedger(tokenId);
      let balance = await ledger.icrc1_balance_of({
        owner = treasury.canisterId;
        subaccount = ?subaccount;
      });
      Vector.add(results, { tokenId; balance });
    };

    Vector.toArray(results);
  };

  /// Get EVM token balance for an address.
  func getEvmTokenBalance(
    evmConfig : Types.EvmChainConfig,
    rpcServices : EvmRpc.RpcServices,
    tokenId : Types.TokenId,
    address : Text,
  ) : async* Result.Result<Nat, Text> {
    switch (getEvmContract(tokenId, evmConfig)) {
      case (?contract) await* EvmRpc.getErc20Balance(evmConfig.evmRpcCanisterId, rpcServices, contract, address);
      case null await* EvmRpc.getEthBalance(evmConfig.evmRpcCanisterId, rpcServices, address);
    };
  };

  // ---- EVM address management ----

  /// Get or derive EVM address for a principal. Caches result.
  public func getOrDeriveEvmAddress(
    treasury : Treasury,
    principal : Principal,
  ) : async* ?Text {
    if (not hasEvmChain(treasury.store.chains)) {
      return null;
    };
    let evmConfig = switch (getAnyEvmChainConfig(treasury.store.chains)) {
      case (?cfg) cfg;
      case null return null;
    };
    await* resolveEvmAddress(treasury, principal, evmConfig, treasury.ecdsaApi);
  };

  /// Get the treasury canister's own EVM signing address (empty derivation path).
  /// This is the address that signs `distributePayment` ERC-20 transfers.
  public func getTreasurySigningAddress(
    treasury : Treasury,
  ) : async* ?Text {
    if (not hasEvmChain(treasury.store.chains)) {
      return null;
    };
    let result = await* EvmRpc.deriveTreasuryAddress(treasury.store.thresholdKeyName, treasury.ecdsaApi);
    switch (result) {
      case (#ok((address, _publicKey))) ?address;
      case (#err(_)) null;
    };
  };

  // ---- SOL address management ----

  /// Get or derive Solana address for a principal. Caches result.
  public func getOrDeriveSolAddress(
    treasury : Treasury,
    principal : Principal,
  ) : async* ?Text {
    if (not hasSolanaChain(treasury.store.chains)) {
      return null;
    };
    let solConfig = switch (getAnySolanaChainConfig(treasury.store.chains)) {
      case (?cfg) cfg;
      case null return null;
    };
    await* resolveSolAddress(treasury, principal, solConfig, treasury.schnorrApi);
  };

  /// Get the treasury canister's own Solana signing address (empty derivation path).
  /// This is the address that signs `distributePayment` SOL/SPL transfers.
  public func getTreasurySolSigningAddress(
    treasury : Treasury,
  ) : async* ?Text {
    if (not hasSolanaChain(treasury.store.chains)) {
      return null;
    };
    let result = await* SolRpc.deriveTreasurySolAddress(treasury.store.thresholdKeyName, treasury.schnorrApi);
    switch (result) {
      case (#ok((address, _publicKey))) ?address;
      case (#err(_)) null;
    };
  };

  // ---- Admin queries ----

  /// Get distribution log with pagination.
  public func getDistributionLog(
    treasury : Treasury,
    opts : Types.DistributionLogOptions,
  ) : [Types.DistributionRecord] {
    let total = Vector.size(treasury.store.distributions);
    if (opts.offset >= total) return [];

    let end = if (opts.offset + opts.limit > total) { total } else { opts.offset + opts.limit };
    let size = end - opts.offset;

    Array.tabulate<Types.DistributionRecord>(
      size,
      func(i : Nat) : Types.DistributionRecord {
        Vector.get(treasury.store.distributions, opts.offset + i);
      },
    );
  };

  /// Get distributions for a specific user.
  public func getUserDistributions(
    treasury : Treasury,
    user : Principal,
  ) : [Types.DistributionRecord] {
    let total = Vector.size(treasury.store.distributions);
    var results = Vector.new<Types.DistributionRecord>();
    var i = 0;

    while (i < total) {
      let record = Vector.get(treasury.store.distributions, i);
      if (
        Principal.equal(record.payer, user) or
        (switch (record.ambassadorL1) { case (?l1) Principal.equal(l1, user); case null false }) or
        (switch (record.ambassadorL2) { case (?l2) Principal.equal(l2, user); case null false })
      ) {
        Vector.add(results, record);
      };
      i += 1;
    };

    Vector.toArray(results);
  };

  /// Verify on-chain status of EVM transfers in a distribution.
  /// Checks `eth_getTransactionReceipt` for each transfer that has a txHash.
  /// Access control delegated to parent canister.
  public func verifyDistribution(
    treasury : Treasury,
    paymentId : Text,
  ) : async* Types.VerifyDistributionResult {
    // Find the distribution record
    let total = Vector.size(treasury.store.distributions);
    var record : ?Types.DistributionRecord = null;
    var i = total;
    while (i > 0) {
      i -= 1;
      let r = Vector.get(treasury.store.distributions, i);
      if (Text.equal(r.paymentId, paymentId)) {
        record := ?r;
        i := 0; // break
      };
    };

    let dist = switch (record) {
      case (?r) r;
      case null return #err(#NotFound);
    };

    let evmConfig = switch (getEvmChainConfig(treasury.store.chains, dist.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#EvmNotConfigured);
    };

    let rpcServices = buildRpcServices(evmConfig);
    var verifications = Vector.new<Types.TransferVerification>();

    for (transfer in dist.transfers.vals()) {
      switch (transfer.txHash) {
        case (?hash) {
          let status = switch (await* EvmRpc.getTransactionReceipt(evmConfig.evmRpcCanisterId, rpcServices, hash)) {
            case (#ok(?receipt)) {
              switch (receipt.status) {
                case (?1) #confirmed;
                case (?0) #reverted;
                case _ #pending;
              };
            };
            case (#ok(null)) #pending;
            case (#err(e)) #error(e);
          };
          Vector.add(verifications, { txHash = hash; status });
        };
        case null {
          Vector.add(verifications, { txHash = ""; status = #notApplicable });
        };
      };
    };

    #ok(Vector.toArray(verifications));
  };

  /// Get the treasury ICP balance (single token). Used for hot-path
  /// reserve checks before debiting treasury for CMC top-ups — cheaper
  /// than `getTreasuryBalances` (1 ledger call vs 4).
  public func getTreasuryIcpBalance(treasury : Treasury) : async* Nat {
    let ledger = getIcLedger(#ICP);
    await ledger.icrc1_balance_of({
      owner = treasury.canisterId;
      subaccount = ?Const.treasurySubaccount();
    });
  };

  /// Get treasury IC balances from the fixed TREASURY_SUBACCOUNT across all 4 IC tokens.
  /// For EVM/SOL treasury pool balances use `getTreasuryEvmBalance` / `getTreasurySolBalance`.
  public func getTreasuryBalances(treasury : Treasury) : async* [Types.BalanceEntry] {
    let subaccount = Const.treasurySubaccount();
    let tokens : [Types.TokenId] = [#ICP, #ckUSDC, #ckUSDT, #ckETH];
    var results = Vector.new<Types.BalanceEntry>();
    for (tokenId in tokens.vals()) {
      let ledger = getIcLedger(tokenId);
      let balance = await ledger.icrc1_balance_of({
        owner = treasury.canisterId;
        subaccount = ?subaccount;
      });
      Vector.add(results, { tokenId; balance });
    };
    Vector.toArray(results);
  };

  func withdrawTreasuryEvm(
    treasury : Treasury,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    let evmConfig = switch (getEvmChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#EvmNotConfigured);
    };

    let toAddress = switch (args.to) {
      case (#EVM({ address })) address;
      case (#IC(_)) return #err(#TransferFailed("EVM token cannot be withdrawn to IC address"));
      case (#SOL(_)) return #err(#TransferFailed("EVM token cannot be withdrawn to SOL address"));
    };

    let api = treasury.ecdsaApi;
    let ecCtx = getEcCtx(treasury);
    let rpcServices = buildRpcServices(evmConfig);

    let (treasuryEvmAddr, treasuryPubKey) = switch (await* EvmRpc.deriveTreasuryAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok(pair)) pair;
      case (#err(e)) return #err(#TransferFailed("Failed to derive treasury EVM address: " # e));
    };

    let balance = switch (await getEvmTokenBalanceStep(evmConfig, args.tokenId, treasuryEvmAddr)) {
      case (#ok(value)) value;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    if (balance < args.amount) {
      return #err(#InsufficientBalance({ available = balance }));
    };

    let remoteNonce = switch (await* EvmRpc.getNonce(evmConfig.evmRpcCanisterId, rpcServices, treasuryEvmAddr)) {
      case (#ok(n)) n;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    let nonce = switch (treasury.lastNonce) {
      case (?local) if (local > remoteNonce) local else remoteNonce;
      case null remoteNonce;
    };
    let feeEstimate = switch (await* getEvmFeeEstimate(evmConfig, rpcServices)) {
      case (#ok(value)) value;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    let transferContext : EvmTransferContext = {
      thresholdKeyName = treasury.store.thresholdKeyName;
      evmConfig;
      rpcServices;
      ecCtx;
      api;
    };

    let result = await sendEvmTransferMessage(
      transferContext,
      {
        tokenId = args.tokenId;
        signer = { derivationPath = []; publicKey = treasuryPubKey };
        recipient = { address = toAddress; amount = args.amount };
        fee = evmTransferFee(nonce, feeEstimate);
      },
    );

    switch (result) {
      case (#ok(txHash)) {
        treasury.lastNonce := ?(nonce + 1);
        #ok({
          tokenId = args.tokenId;
          amount = args.amount;
          tx = #EVM({ txHash });
        });
      };
      case (#err(e)) #err(#TransferFailed(e));
    };
  };

  func withdrawTreasurySol(
    treasury : Treasury,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    let solConfig = switch (getSolanaChainConfig(treasury.store.chains, args.tokenId)) {
      case (?cfg) cfg;
      case null return #err(#SolNotConfigured);
    };

    let toAddress = switch (args.to) {
      case (#SOL({ address })) address;
      case (#IC(_)) return #err(#TransferFailed("SOL token cannot be withdrawn to IC address"));
      case (#EVM(_)) return #err(#TransferFailed("SOL token cannot be withdrawn to EVM address"));
    };

    let api = treasury.schnorrApi;
    let rpcSources = buildSolRpcSources(solConfig);

    let (treasurySolAddr, treasuryPubKey) = switch (await* SolRpc.deriveTreasurySolAddress(treasury.store.thresholdKeyName, api)) {
      case (#ok(pair)) pair;
      case (#err(e)) return #err(#TransferFailed("Failed to derive treasury SOL address: " # e));
    };

    let balance = switch (await getSolTokenBalanceStep(solConfig, args.tokenId, treasurySolAddr)) {
      case (#ok(value)) value;
      case (#err(e)) return #err(#TransferFailed(e));
    };
    if (balance < args.amount) {
      return #err(#InsufficientBalance({ available = balance }));
    };

    let result = switch (getSolMintAddress(args.tokenId, solConfig)) {
      case (?mintAddress) {
        await* SolRpc.sendSplTransfer(
          {
            solRpcCanisterId = solConfig.solRpcCanisterId;
            rpcSources;
            schnorrKeyName = treasury.store.thresholdKeyName;
            derivationPath = [];
            senderPubKey = treasuryPubKey;
            mintAddress;
            toAddress;
            amount = Nat64.fromNat(args.amount);
            decimals = getSolTokenDecimals(args.tokenId, solConfig);
          },
          api,
        );
      };
      case null {
        await* SolRpc.sendSolTransfer(
          {
            solRpcCanisterId = solConfig.solRpcCanisterId;
            rpcSources;
            schnorrKeyName = treasury.store.thresholdKeyName;
            derivationPath = [];
            senderPubKey = treasuryPubKey;
            toAddress;
            lamports = Nat64.fromNat(args.amount);
          },
          api,
        );
      };
    };

    switch (result) {
      case (#ok(signature)) #ok({
        tokenId = args.tokenId;
        amount = args.amount;
        tx = #SOL({ signature });
      });
      case (#err(e)) #err(#TransferFailed(e));
    };
  };

  /// Withdraw from the fixed treasury pool (admin use via parent canister guard).
  /// IC: source = TREASURY_SUBACCOUNT; EVM/SOL: source = treasury-derived address
  /// (empty derivation path). Mirrors `withdraw()` but with fixed sender.
  public func withdrawFromTreasury(
    treasury : Treasury,
    args : Types.WithdrawArgs,
  ) : async* Types.WithdrawResult {
    let minAmount = getMinWithdraw(args.tokenId, treasury.store.distributionConfig);
    if (args.amount < minAmount) return #err(#BelowMinimum({ minimum = minAmount }));

    if (isIcToken(args.tokenId)) {
      let (toOwner, toSubaccount) = switch (args.to) {
        case (#IC({ owner; subaccount })) (owner, subaccount);
        case (#EVM(_)) return #err(#TransferFailed("IC token cannot be withdrawn to EVM"));
        case (#SOL(_)) return #err(#TransferFailed("IC token cannot be withdrawn to SOL"));
      };
      let ledger = getIcLedger(args.tokenId);
      let fee = getIcFee(args.tokenId);
      let balance = await ledger.icrc1_balance_of({
        owner = treasury.canisterId;
        subaccount = ?Const.treasurySubaccount();
      });
      if (balance < args.amount + fee) return #err(#InsufficientBalance({ available = balance }));
      let result = await ledger.icrc1_transfer({
        to = { owner = toOwner; subaccount = toSubaccount };
        fee = ?fee;
        memo = null;
        from_subaccount = ?Const.treasurySubaccount();
        created_at_time = ?Nat64.fromNat(Int.abs(Time.now()));
        amount = args.amount;
      });
      switch (result) {
        case (#Ok(blockIndex)) #ok({
          tokenId = args.tokenId;
          amount = args.amount;
          tx = #IC({ blockIndex = blockIndex });
        });
        case (#Err(err)) #err(#TransferFailed(debug_show err));
      };
    } else if (isSolToken(args.tokenId)) {
      await* withdrawTreasurySol(treasury, args);
    } else {
      await* withdrawTreasuryEvm(treasury, args);
    };
  };

  // ---- Helpers ----

  func calculateSplit(
    amount : Nat,
    l1 : ?Principal,
    l2 : ?Principal,
    config : Types.DistributionConfig,
  ) : (Nat, Nat, Nat) {
    switch (l1, l2) {
      case (?_, ?_) {
        let l1Amount = amount * config.l1Bps / Const.BPS_BASE;
        let l2Amount = amount * config.l2Bps / Const.BPS_BASE;
        let treasuryAmount = amount - l1Amount - l2Amount;
        (treasuryAmount, l1Amount, l2Amount);
      };
      case (?_, null) {
        let l1Amount = amount * config.l1Bps / Const.BPS_BASE;
        let treasuryAmount = amount - l1Amount;
        (treasuryAmount, l1Amount, 0);
      };
      case _ (amount, 0, 0);
    };
  };

  func makeIcTransferRecord(
    recipient : Principal,
    subaccount : ?Blob,
    amount : Nat,
    tokenId : Types.TokenId,
    result : LedgerTypes.Icrc1TransferResult,
  ) : Types.TransferRecord {
    switch (result) {
      case (#Ok(blockIndex)) {
        { recipient; subaccount; evmAddress = null; solAddress = null; amount; tokenId; blockIndex = ?blockIndex; txHash = null; solSignature = null; error = null };
      };
      case (#Err(err)) {
        { recipient; subaccount; evmAddress = null; solAddress = null; amount; tokenId; blockIndex = null; txHash = null; solSignature = null; error = ?(debug_show (err)) };
      };
    };
  };

  func makeEvmTransferRecord(
    recipient : Principal,
    evmAddr : Text,
    amount : Nat,
    tokenId : Types.TokenId,
    result : Result.Result<Text, Text>,
  ) : Types.TransferRecord {
    switch (result) {
      case (#ok(txHash)) {
        { recipient; subaccount = null; evmAddress = ?evmAddr; solAddress = null; amount; tokenId; blockIndex = null; txHash = ?txHash; solSignature = null; error = null };
      };
      case (#err(err)) {
        { recipient; subaccount = null; evmAddress = ?evmAddr; solAddress = null; amount; tokenId; blockIndex = null; txHash = null; solSignature = null; error = ?err };
      };
    };
  };

  func makeSolTransferRecord(
    recipient : Principal,
    solAddr : Text,
    amount : Nat,
    tokenId : Types.TokenId,
    result : Result.Result<Text, Text>,
  ) : Types.TransferRecord {
    switch (result) {
      case (#ok(signature)) {
        { recipient; subaccount = null; evmAddress = null; solAddress = ?solAddr; amount; tokenId; blockIndex = null; txHash = null; solSignature = ?signature; error = null };
      };
      case (#err(err)) {
        { recipient; subaccount = null; evmAddress = null; solAddress = ?solAddr; amount; tokenId; blockIndex = null; txHash = null; solSignature = null; error = ?err };
      };
    };
  };
};
