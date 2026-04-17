module {
  // ---- Phase 1: IC (ICRC-1) ----

  // ICRC Ledger canister IDs
  public let ICP_LEDGER    = "ryjl3-tyaaa-aaaaa-aaaba-cai";
  public let CKUSDC_LEDGER = "xevnm-gaaaa-aaaar-qafnq-cai";
  public let CKUSDT_LEDGER = "cngnf-vqaaa-aaaar-qag4q-cai";
  public let CKETH_LEDGER  = "ss2fx-dyaaa-aaaar-qacoq-cai";

  // IC transfer fees (smallest unit)
  public let ICP_FEE    : Nat = 10_000;
  public let CKUSDC_FEE : Nat = 10_000;
  public let CKUSDT_FEE : Nat = 10_000;
  public let CKETH_FEE  : Nat = 2_000_000_000_000;

  // IC minimum withdrawal amounts
  public let MIN_WITHDRAW_ICP    : Nat = 100_000;
  public let MIN_WITHDRAW_CKUSDC : Nat = 100_000;
  public let MIN_WITHDRAW_CKUSDT : Nat = 100_000;
  public let MIN_WITHDRAW_CKETH  : Nat = 10_000_000_000_000;

  // ---- Phase 2: Base EVM ----

  // ERC-20 decimals
  public let BASE_USDC_DECIMALS : Nat = 6;
  public let BASE_USDT_DECIMALS : Nat = 6;
  public let BASE_ETH_DECIMALS  : Nat = 18;

  // Gas limits
  public let EVM_ERC20_GAS_LIMIT : Nat = 65_000;
  public let EVM_ETH_GAS_LIMIT   : Nat = 21_000;

  // EVM minimum withdrawal amounts (in smallest unit)
  public let MIN_WITHDRAW_BASE_USDC : Nat = 100_000;
  public let MIN_WITHDRAW_BASE_USDT : Nat = 100_000;
  public let MIN_WITHDRAW_BASE_ETH  : Nat = 10_000_000_000_000;

  // ---- Phase 3: Solana ----

  public let SOL_DECIMALS : Nat = 9;
  public let SOL_USDC_DECIMALS : Nat = 6;
  public let SOL_USDT_DECIMALS : Nat = 6;

  // Solana rent-exempt minimum for a basic account (~0.00089 SOL)
  public let SOL_RENT_EXEMPT_MIN : Nat = 890_880;

  // Solana minimum withdrawal amounts (in smallest unit)
  // SOL min must exceed rent-exempt minimum to avoid InsufficientFundsForRent errors
  public let MIN_WITHDRAW_SOL      : Nat = 1_000_000;   // 0.001 SOL (> rent-exempt 890_880)
  public let MIN_WITHDRAW_SOL_USDC : Nat = 1_000;       // $0.001
  public let MIN_WITHDRAW_SOL_USDT : Nat = 1_000;       // $0.001

  // ---- Distribution (all tokens) ----

  // Distribution percentages (basis points, 10000 = 100%)
  public let TREASURY_BPS : Nat = 8500;
  public let L1_BPS       : Nat = 1500;
  public let L2_BPS       : Nat = 0;
  public let BPS_BASE     : Nat = 10000;
};
