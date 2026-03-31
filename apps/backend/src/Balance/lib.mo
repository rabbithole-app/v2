import TreasuryTypes "mo:treasury/Types";

module {
  public type ChargeResult = {
    #ok : { tokenId : TreasuryTypes.TokenId; amount : Nat };
    #insufficientFunds : { required : Nat };
    #err : Text;
  };

  /// Convert USD cents to token amount for stablecoins (6 decimals).
  /// e.g., 990 cents ($9.90) = 9_900_000 smallest units
  public func usdCentsToStablecoin(cents : Nat) : Nat {
    cents * 10_000; // cents × 10^4 = amount with 6 decimals
  };

  /// Check if a token is a stablecoin (1:1 USD).
  public func isStablecoin(tokenId : TreasuryTypes.TokenId) : Bool {
    switch (tokenId) {
      case (#ckUSDC or #ckUSDT or #BaseUSDC or #BaseUSDT or #SolUSDC or #SolUSDT) true;
      case _ false;
    };
  };
};
