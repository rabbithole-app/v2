import Result "mo:core/Result";

module {
  /// Supported IC tokens (Phase 1).
  public type TokenId = {
    #ICP;
    #ckUSDC;
    #ckUSDT;
    #ckETH;
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
    #Unauthorized;
  };

  /// Record of a single ICRC transfer within a distribution.
  public type TransferRecord = {
    recipient : Principal;
    subaccount : ?Blob;
    amount : Nat;
    tokenId : TokenId;
    blockIndex : ?Nat;
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
  };

  /// Withdraw request.
  public type WithdrawArgs = {
    tokenId : TokenId;
    amount : Nat;
    to : { owner : Principal; subaccount : ?Blob };
  };

  /// Withdraw result: blockIndex on success.
  public type WithdrawResult = Result.Result<Nat, WithdrawError>;

  public type WithdrawError = {
    #InsufficientBalance : { available : Nat };
    #TransferFailed : Text;
    #BelowMinimum : { minimum : Nat };
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

  /// Init args for the Treasury canister.
  public type InitArgs = {
    admin : Principal;
  };
};
