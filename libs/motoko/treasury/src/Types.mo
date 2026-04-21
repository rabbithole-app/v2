import Result "mo:core/Result";
import ConfigTypes "ConfigTypes";

module {
  public type ThresholdKeyName = ConfigTypes.ThresholdKeyName;
  public type TokenId = ConfigTypes.TokenId;

  /// Distribution and withdrawal configuration.
  public type DistributionConfig = {
    /// L1 ambassador share in basis points (10000 = 100%). Default: 1500 (15%)
    l1Bps : Nat;
    /// L2 ambassador share in basis points. Default: 0
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
    sol : Nat;
    solUsdc : Nat;
    solUsdt : Nat;
  };

  public type AssetLocator = ConfigTypes.AssetLocator;
  public type SupportedAsset = ConfigTypes.SupportedAsset;

  /// EVM chain configuration, provided at deploy time via InitArgs.
  public type EvmChainConfig = ConfigTypes.EvmChainConfig;

  /// Solana configuration, provided at deploy time via InitArgs.
  public type SolanaChainConfig = ConfigTypes.SolanaChainConfig;

  public type ChainConfig = ConfigTypes.ChainConfig;

  /// Init args for the Treasury canister/library.
  /// Access control (who can call distributePayment/chargeAndDistribute/withdraw)
  /// is enforced by the parent canister, not by treasury itself.
  public type InitArgs = {
    thresholdKeyName : ThresholdKeyName;
    chains : [ChainConfig];
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
    #SolNotConfigured;
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
    solAddress : ?Text;
    amount : Nat;
    tokenId : TokenId;
    blockIndex : ?Nat;
    txHash : ?Text;
    solSignature : ?Text;
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

  /// Charge from user wallet and distribute in one step.
  /// Transfers directly from user's derived wallets to treasury/L1/L2.
  public type ChargeAndDistributeArgs = {
    paymentId : Text;
    userId : Principal;
    tokenId : TokenId;
    totalAmount : Nat;
    ambassadorL1 : ?Principal;
    ambassadorL2 : ?Principal;
    metadata : ?Text;
  };

  /// Same result type as DistributePaymentResult.
  public type ChargeAndDistributeResult = DistributePaymentResult;

  /// Args for deferred ambassador payout. Invoked after a refundable
  /// charge (e.g. license) is confirmed unrefundable — typically at
  /// canister-created time in the storage deployer. Transfers ambassador
  /// shares from the treasury subaccount (not from the user) to the
  /// L1/L2 subaccounts, using the original `totalAmount` to compute
  /// the split.
  public type DistributeAmbassadorShareArgs = {
    paymentId : Text;
    payer : Principal;
    tokenId : TokenId;
    totalAmount : Nat;
    ambassadorL1 : ?Principal;
    ambassadorL2 : ?Principal;
    metadata : ?Text;
  };

  /// Same result shape as `DistributePaymentResult`. The returned record
  /// reflects only the ambassador share (L1/L2 transfers); `treasuryAmount`
  /// is 0 because no new treasury intake happened in this call.
  public type DistributeAmbassadorShareResult = DistributePaymentResult;

  /// Withdraw destination — IC (ICRC-1), EVM, or Solana address.
  public type WithdrawDestination = {
    #IC : { owner : Principal; subaccount : ?Blob };
    #EVM : { address : Text };
    #SOL : { address : Text };
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
    #SolNotConfigured;
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
