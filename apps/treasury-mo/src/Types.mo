import Result "mo:core/Result";

module {
  /// Supported tokens across chains.
  public type TokenId = {
    // Phase 1: IC (ICRC-1)
    #ICP;
    #ckUSDC;
    #ckUSDT;
    #ckETH;
    // Phase 2: Base EVM
    #BaseETH;
    #BaseUSDC;
    #BaseUSDT;
  };

  /// Distribution and withdrawal configuration.
  public type DistributionConfig = {
    /// L1 ambassador share in basis points (10000 = 100%). Default: 2000 (20%)
    l1Bps : Nat;
    /// L2 ambassador share in basis points. Default: 500 (5%)
    l2Bps : Nat;
    /// Minimum withdrawal amounts per token (in smallest unit).
    minWithdraw : MinWithdrawConfig;
  };

  public type MinWithdrawConfig = {
    icp : Nat;
    ckUsdc : Nat;
    ckUsdt : Nat;
    ckEth : Nat;
    baseEth : Nat;
    baseUsdc : Nat;
    baseUsdt : Nat;
  };

  /// EVM chain configuration, provided at deploy time via InitArgs.
  public type EvmConfig = {
    chainId : Nat;
    ecdsaKeyName : Text;
    evmRpcCanisterId : Text;
    usdcContract : Text;
    usdtContract : Text;
    /// Custom RPC URLs. If empty, built-in evm_rpc providers are used
    /// (BaseMainnet, EthMainnet, EthSepolia). Required for custom/testnet chains.
    rpcUrls : [Text];
  };

  /// Init args for the Treasury canister.
  public type InitArgs = {
    admin : Principal;
    evmConfig : ?EvmConfig;
    distributionConfig : ?DistributionConfig;
  };

  /// Distribution request from Backend.
  public type DistributePaymentArgs = {
    paymentId : Text;
    payer : Principal;
    tokenId : TokenId;
    amount : Nat;
    ambassadorL1 : ?Principal;
    ambassadorL2 : ?Principal;
    metadata : ?Text;
  };

  /// Distribution result.
  public type DistributePaymentResult = Result.Result<DistributionRecord, DistributePaymentError>;

  public type DistributePaymentError = {
    #AlreadyProcessed;
    #InvalidAmount;
    #TransferFailed : { recipient : Text; error : Text };
    #PartiallyCompleted : DistributionRecord;
    #EvmNotConfigured;
    #Unauthorized;
  };

  /// Status of a distribution: fully completed or partially failed.
  public type DistributionStatus = {
    #completed;
    #partial;
  };

  /// Record of a single transfer within a distribution.
  public type TransferRecord = {
    recipient : Principal;
    subaccount : ?Blob;
    evmAddress : ?Text;
    amount : Nat;
    tokenId : TokenId;
    blockIndex : ?Nat;
    txHash : ?Text;
    error : ?Text;
  };

  /// Audit log record for each distribution.
  public type DistributionRecord = {
    id : Nat;
    paymentId : Text;
    payer : Principal;
    tokenId : TokenId;
    totalAmount : Nat;
    treasuryAmount : Nat;
    l1Amount : Nat;
    l2Amount : Nat;
    ambassadorL1 : ?Principal;
    ambassadorL2 : ?Principal;
    timestamp : Int;
    transfers : [TransferRecord];
    status : DistributionStatus;
  };

  /// Withdraw destination — IC (ICRC-1) or EVM address.
  public type WithdrawDestination = {
    #IC : { owner : Principal; subaccount : ?Blob };
    #EVM : { address : Text };
  };

  /// Withdraw request.
  public type WithdrawArgs = {
    tokenId : TokenId;
    amount : Nat;
    to : WithdrawDestination;
  };

  /// Withdraw result: block index (IC) or tx hash identifier (EVM) as Nat.
  public type WithdrawResult = Result.Result<Nat, WithdrawError>;

  public type WithdrawError = {
    #InsufficientBalance : { available : Nat };
    #TransferFailed : Text;
    #BelowMinimum : { minimum : Nat };
    #EvmNotConfigured;
  };

  /// Balance entry for a single token.
  public type BalanceEntry = {
    tokenId : TokenId;
    balance : Nat;
  };

  /// Distribution log query options.
  public type DistributionLogOptions = {
    offset : Nat;
    limit : Nat;
  };

  /// On-chain confirmation status for a single EVM transfer.
  public type TransferVerification = {
    txHash : Text;
    status : TransferOnChainStatus;
  };

  public type TransferOnChainStatus = {
    #confirmed;          // receipt status = 1
    #reverted;           // receipt status = 0
    #pending;            // no receipt yet
    #notApplicable;      // IC transfer, no txHash
    #error : Text;       // RPC error during verification
  };

  /// Result of verifying a distribution's EVM transfers on-chain.
  public type VerifyDistributionResult = Result.Result<[TransferVerification], VerifyDistributionError>;

  public type VerifyDistributionError = {
    #NotFound;
    #EvmNotConfigured;
    #Unauthorized;
  };
};
