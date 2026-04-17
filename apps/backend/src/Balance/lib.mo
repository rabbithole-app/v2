import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";

import TreasuryTypes "mo:treasury/Types";

module {
  // --- Constants ---

  public let CYCLES_PER_XDR : Nat = 1_000_000_000_000; // 1 trillion
  public let PERMYRIAD : Nat = 10_000;
  public let E8S_PER_ICP : Nat = 100_000_000;
  public let LEDGER_FEE : Nat = 10_000;

  // --- Types ---

  public type ChargeResult = {
    #ok : { tokenId : TreasuryTypes.TokenId; amount : Nat };
    #insufficientFunds : { required : Nat };
    #err : Text;
  };

  public type ChargeResultWithId = {
    #ok : { tokenId : TreasuryTypes.TokenId; amount : Nat; paymentId : Text };
    #insufficientFunds : { required : Nat };
    #err : Text;
  };

  /// XRC rate pair: (rate, decimals). Rate is scaled by 10^decimals.
  public type XrcRate = (Nat64, Nat32);

  // --- Stablecoin helpers ---

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

  // --- Cycles ↔ ICP (CMC XDR rate only, no USD) ---

  /// Calculate ICP e8s needed for a given number of cycles.
  /// Uses ceiling division to ensure enough ICP.
  public func cyclesToIcpE8s(cycles : Nat, xdrPermyriadPerIcp : Nat) : Nat {
    let numerator = cycles * PERMYRIAD * E8S_PER_ICP;
    let denominator = CYCLES_PER_XDR * xdrPermyriadPerIcp;
    (numerator + denominator - 1) / denominator;
  };

  /// Convert ICP e8s to cycles.
  public func icpE8sToCycles(icpE8s : Nat, xdrPermyriadPerIcp : Nat) : Nat {
    icpE8s * CYCLES_PER_XDR * xdrPermyriadPerIcp / (E8S_PER_ICP * PERMYRIAD);
  };

  // --- ICP ↔ USD (XRC ICP/USD rate) ---

  /// Convert ICP e8s to USD cents using XRC ICP/USD rate.
  public func icpE8sToUsdCents(icpE8s : Nat, icpUsdRate : XrcRate) : Nat {
    let (rate, decimals) = icpUsdRate;
    tokenAmountToUsdCents(icpE8s, rate, decimals, 8); // ICP has 8 decimals
  };

  /// Convert USD cents to ICP e8s using XRC ICP/USD rate.
  public func usdCentsToIcpE8s(usdCents : Nat, icpUsdRate : XrcRate) : Nat {
    let (rate, decimals) = icpUsdRate;
    usdCentsToTokenAmount(usdCents, rate, decimals, 8); // ICP has 8 decimals
  };

  // --- Cycles ↔ USD (requires both CMC and XRC rates) ---

  /// Convert cycles cost to USD cents.
  /// First converts cycles → ICP (via CMC), then ICP → USD (via XRC).
  public func cyclesToUsdCents(cycles : Nat, xdrPermyriadPerIcp : Nat, icpUsdRate : XrcRate) : Nat {
    let icpE8s = cyclesToIcpE8s(cycles, xdrPermyriadPerIcp);
    icpE8sToUsdCents(icpE8s, icpUsdRate);
  };

  /// Convert USD cents to cycles.
  /// First converts USD → ICP (via XRC), then ICP → cycles (via CMC).
  public func usdCentsToCycles(usdCents : Nat, xdrPermyriadPerIcp : Nat, icpUsdRate : XrcRate) : Nat {
    let icpE8s = usdCentsToIcpE8s(usdCents, icpUsdRate);
    icpE8sToCycles(icpE8s, xdrPermyriadPerIcp);
  };

  // --- XRC rate conversion (generic, for ETH, SOL, ICP) ---

  /// Convert USD cents to token smallest units using XRC exchange rate.
  /// xrcRate: price of 1 token in quote currency, scaled by 10^xrcDecimals
  /// tokenDecimals: smallest unit decimals (ETH=18, SOL=9, ICP=8)
  public func usdCentsToTokenAmount(
    usdCents : Nat,
    xrcRate : Nat64,
    xrcDecimals : Nat32,
    tokenDecimals : Nat,
  ) : Nat {
    let rate = Nat64.toNat(xrcRate);
    let decimals = Nat32.toNat(xrcDecimals);

    // tokenAmount = usdCents * 10^tokenDecimals * 10^xrcDecimals / (rate * 100)
    let numerator = usdCents * Nat.pow(10, tokenDecimals) * Nat.pow(10, decimals);
    let denominator = rate * 100;
    (numerator + denominator - 1) / denominator;
  };

  /// Reverse of usdCentsToTokenAmount: convert token smallest units back to USD cents.
  public func tokenAmountToUsdCents(
    tokenAmount : Nat,
    xrcRate : Nat64,
    xrcDecimals : Nat32,
    tokenDecimals : Nat,
  ) : Nat {
    let rate = Nat64.toNat(xrcRate);
    let decimals = Nat32.toNat(xrcDecimals);

    // usdCents = tokenAmount * rate * 100 / (10^tokenDecimals * 10^xrcDecimals)
    let numerator = tokenAmount * rate * 100;
    let denominator = Nat.pow(10, tokenDecimals) * Nat.pow(10, decimals);
    numerator / denominator;
  };

  /// Get the ICRC-1 ledger fee for an IC token.
  public func getIcTokenFee(tokenId : TreasuryTypes.TokenId) : Nat {
    switch (tokenId) {
      case (#ICP) 10_000;
      case (#ckUSDC or #ckUSDT) 10_000;
      case (#ckETH) 2_000_000_000_000; // 0.000002 ETH
      case _ 10_000;
    };
  };

  /// Get the token decimals for a given TokenId.
  public func tokenDecimals(tokenId : TreasuryTypes.TokenId) : Nat {
    switch (tokenId) {
      case (#ICP) 8;
      case (#ckETH or #BaseETH) 18;
      case (#SOL) 9;
      case _ 6; // stablecoins
    };
  };
};
