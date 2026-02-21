module {
  // ICRC Ledger canister IDs
  public let ICP_LEDGER    = "ryjl3-tyaaa-aaaaa-aaaba-cai";
  public let CKUSDC_LEDGER = "xevnm-gaaaa-aaaar-qafnq-cai";
  public let CKUSDT_LEDGER = "cngnf-vqaaa-aaaar-qag4q-cai";
  public let CKETH_LEDGER  = "ss2fx-dyaaa-aaaar-qacoq-cai";

  // Transfer fees (smallest unit)
  public let ICP_FEE    : Nat = 10_000;                // 0.0001 ICP
  public let CKUSDC_FEE : Nat = 10_000;                // 0.01 USDC
  public let CKUSDT_FEE : Nat = 10_000;                // 0.01 USDT
  public let CKETH_FEE  : Nat = 2_000_000_000_000;     // 0.000002 ETH

  // Distribution percentages (basis points, 10000 = 100%)
  public let TREASURY_BPS : Nat = 7500;  // 75%
  public let L1_BPS       : Nat = 2000;  // 20%
  public let L2_BPS       : Nat = 500;   // 5%
  public let BPS_BASE     : Nat = 10000;

  // Minimum withdrawal amounts
  public let MIN_WITHDRAW_ICP    : Nat = 100_000;                // 0.001 ICP
  public let MIN_WITHDRAW_CKUSDC : Nat = 100_000;                // 0.1 USDC
  public let MIN_WITHDRAW_CKUSDT : Nat = 100_000;                // 0.1 USDT
  public let MIN_WITHDRAW_CKETH  : Nat = 10_000_000_000_000;     // 0.00001 ETH
};
