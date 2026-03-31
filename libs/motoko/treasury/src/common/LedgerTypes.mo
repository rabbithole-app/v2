module {
  public type Account = { owner : Principal; subaccount : ?SubAccount };
  public type SubAccount = Blob;
  public type Icrc1BlockIndex = Nat;
  public type Icrc1Tokens = Nat;
  public type Icrc1Timestamp = Nat64;

  public type TransferArg = {
    to : Account;
    fee : ?Icrc1Tokens;
    memo : ?Blob;
    from_subaccount : ?SubAccount;
    created_at_time : ?Icrc1Timestamp;
    amount : Icrc1Tokens;
  };

  public type Icrc1TransferError = {
    #GenericError : { message : Text; error_code : Nat };
    #TemporarilyUnavailable;
    #BadBurn : { min_burn_amount : Icrc1Tokens };
    #Duplicate : { duplicate_of : Icrc1BlockIndex };
    #BadFee : { expected_fee : Icrc1Tokens };
    #CreatedInFuture : { ledger_time : Nat64 };
    #TooOld;
    #InsufficientFunds : { balance : Icrc1Tokens };
  };

  public type Icrc1TransferResult = {
    #Ok : Icrc1BlockIndex;
    #Err : Icrc1TransferError;
  };

  public type Value = { #Int : Int; #Nat : Nat; #Blob : Blob; #Text : Text };

  /// Minimal ICRC-1 ledger interface used by Treasury.
  public type Self = actor {
    icrc1_balance_of : shared query Account -> async Icrc1Tokens;
    icrc1_fee : shared query () -> async Icrc1Tokens;
    icrc1_transfer : shared TransferArg -> async Icrc1TransferResult;
  };
};
