export const idlFactory = ({ IDL }) => {
  const ThresholdKeyName = IDL.Text;
  const MinWithdrawConfig = IDL.Record({
    'icp' : IDL.Nat,
    'sol' : IDL.Nat,
    'baseUsdc' : IDL.Nat,
    'baseUsdt' : IDL.Nat,
    'baseEth' : IDL.Nat,
    'ckEth' : IDL.Nat,
    'ckUsdc' : IDL.Nat,
    'ckUsdt' : IDL.Nat,
    'solUsdc' : IDL.Nat,
    'solUsdt' : IDL.Nat,
  });
  const DistributionConfig = IDL.Record({
    'l1Bps' : IDL.Nat,
    'l2Bps' : IDL.Nat,
    'minWithdraw' : MinWithdrawConfig,
  });
  const TokenId = IDL.Variant({
    'ICP' : IDL.Null,
    'SOL' : IDL.Null,
    'SolUSDC' : IDL.Null,
    'SolUSDT' : IDL.Null,
    'ckETH' : IDL.Null,
    'ckUSDC' : IDL.Null,
    'ckUSDT' : IDL.Null,
    'BaseUSDC' : IDL.Null,
    'BaseUSDT' : IDL.Null,
    'BaseETH' : IDL.Null,
  });
  const AssetLocator = IDL.Variant({
    'Contract' : IDL.Text,
    'Mint' : IDL.Text,
    'Native' : IDL.Null,
  });
  const SupportedAsset = IDL.Record({
    'decimals' : IDL.Nat8,
    'tokenId' : TokenId,
    'locator' : AssetLocator,
    'symbol' : IDL.Text,
  });
  const EvmChainConfig = IDL.Record({
    'evmRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrls' : IDL.Vec(IDL.Text),
    'chainId' : IDL.Nat,
    'networkId' : IDL.Text,
  });
  const SolanaChainConfig = IDL.Record({
    'solRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrl' : IDL.Opt(IDL.Text),
    'networkId' : IDL.Text,
  });
  const ChainConfig = IDL.Variant({
    'Evm' : EvmChainConfig,
    'Solana' : SolanaChainConfig,
  });
  const InitArgs = IDL.Record({
    'thresholdKeyName' : ThresholdKeyName,
    'admin' : IDL.Principal,
    'distributionConfig' : IDL.Opt(DistributionConfig),
    'chains' : IDL.Vec(ChainConfig),
  });
  const ChargeAndDistributeArgs = IDL.Record({
    'tokenId' : TokenId,
    'metadata' : IDL.Opt(IDL.Text),
    'userId' : IDL.Principal,
    'ambassadorL1' : IDL.Opt(IDL.Principal),
    'ambassadorL2' : IDL.Opt(IDL.Principal),
    'totalAmount' : IDL.Nat,
    'paymentId' : IDL.Text,
  });
  const DistributionStatus = IDL.Variant({
    'completed' : IDL.Null,
    'partial' : IDL.Null,
  });
  const TransferRecord = IDL.Record({
    'tokenId' : TokenId,
    'solSignature' : IDL.Opt(IDL.Text),
    'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'recipient' : IDL.Principal,
    'solAddress' : IDL.Opt(IDL.Text),
    'error' : IDL.Opt(IDL.Text),
    'blockIndex' : IDL.Opt(IDL.Nat),
    'txHash' : IDL.Opt(IDL.Text),
    'amount' : IDL.Nat,
    'evmAddress' : IDL.Opt(IDL.Text),
  });
  const DistributionRecord = IDL.Record({
    'id' : IDL.Nat,
    'status' : DistributionStatus,
    'tokenId' : TokenId,
    'l1Amount' : IDL.Nat,
    'transfers' : IDL.Vec(TransferRecord),
    'l2Amount' : IDL.Nat,
    'ambassadorL1' : IDL.Opt(IDL.Principal),
    'ambassadorL2' : IDL.Opt(IDL.Principal),
    'totalAmount' : IDL.Nat,
    'paymentId' : IDL.Text,
    'timestamp' : IDL.Int,
    'payer' : IDL.Principal,
    'treasuryAmount' : IDL.Nat,
  });
  const DistributePaymentError = IDL.Variant({
    'InvalidAmount' : IDL.Null,
    'AlreadyProcessed' : IDL.Null,
    'Unauthorized' : IDL.Null,
    'PartiallyCompleted' : DistributionRecord,
    'TransferFailed' : IDL.Record({
      'recipient' : IDL.Text,
      'error' : IDL.Text,
    }),
    'EvmNotConfigured' : IDL.Null,
    'SolNotConfigured' : IDL.Null,
  });
  const ChargeAndDistributeResult = IDL.Variant({
    'ok' : DistributionRecord,
    'err' : DistributePaymentError,
  });
  const DistributePaymentArgs = IDL.Record({
    'tokenId' : TokenId,
    'metadata' : IDL.Opt(IDL.Text),
    'ambassadorL1' : IDL.Opt(IDL.Principal),
    'ambassadorL2' : IDL.Opt(IDL.Principal),
    'paymentId' : IDL.Text,
    'payer' : IDL.Principal,
    'amount' : IDL.Nat,
  });
  const DistributePaymentResult = IDL.Variant({
    'ok' : DistributionRecord,
    'err' : DistributePaymentError,
  });
  const BalanceEntry = IDL.Record({ 'tokenId' : TokenId, 'balance' : IDL.Nat });
  const DistributionLogOptions = IDL.Record({
    'offset' : IDL.Nat,
    'limit' : IDL.Nat,
  });
  const TransferOnChainStatus = IDL.Variant({
    'pending' : IDL.Null,
    'error' : IDL.Text,
    'reverted' : IDL.Null,
    'confirmed' : IDL.Null,
    'notApplicable' : IDL.Null,
  });
  const TransferVerification = IDL.Record({
    'status' : TransferOnChainStatus,
    'txHash' : IDL.Text,
  });
  const VerifyDistributionError = IDL.Variant({
    'NotFound' : IDL.Null,
    'Unauthorized' : IDL.Null,
    'EvmNotConfigured' : IDL.Null,
  });
  const VerifyDistributionResult = IDL.Variant({
    'ok' : IDL.Vec(TransferVerification),
    'err' : VerifyDistributionError,
  });
  const WithdrawDestination = IDL.Variant({
    'IC' : IDL.Record({
      'owner' : IDL.Principal,
      'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    }),
    'EVM' : IDL.Record({ 'address' : IDL.Text }),
    'SOL' : IDL.Record({ 'address' : IDL.Text }),
  });
  const WithdrawArgs = IDL.Record({
    'to' : WithdrawDestination,
    'tokenId' : TokenId,
    'amount' : IDL.Nat,
  });
  const WithdrawError = IDL.Variant({
    'BelowMinimum' : IDL.Record({ 'minimum' : IDL.Nat }),
    'InsufficientBalance' : IDL.Record({ 'available' : IDL.Nat }),
    'TransferFailed' : IDL.Text,
    'EvmNotConfigured' : IDL.Null,
    'SolNotConfigured' : IDL.Null,
  });
  const WithdrawResult = IDL.Variant({ 'ok' : IDL.Nat, 'err' : WithdrawError });
  const TreasuryCanister = IDL.Service({
    'chargeAndDistribute' : IDL.Func(
        [ChargeAndDistributeArgs],
        [ChargeAndDistributeResult],
        [],
      ),
    'distributePayment' : IDL.Func(
        [DistributePaymentArgs],
        [DistributePaymentResult],
        [],
      ),
    'getBalance' : IDL.Func([TokenId], [IDL.Nat], []),
    'getBalances' : IDL.Func([], [IDL.Vec(BalanceEntry)], []),
    'getDistributionLog' : IDL.Func(
        [DistributionLogOptions],
        [IDL.Vec(DistributionRecord)],
        ['query'],
      ),
    'getEvmAddress' : IDL.Func([], [IDL.Opt(IDL.Text)], []),
    'getSolAddress' : IDL.Func([], [IDL.Opt(IDL.Text)], []),
    'getTreasuryBalances' : IDL.Func([], [IDL.Vec(BalanceEntry)], []),
    'getTreasurySigningAddress' : IDL.Func([], [IDL.Opt(IDL.Text)], []),
    'getTreasurySolSigningAddress' : IDL.Func([], [IDL.Opt(IDL.Text)], []),
    'getUserBalances' : IDL.Func([IDL.Principal], [IDL.Vec(BalanceEntry)], []),
    'getUserDistributions' : IDL.Func(
        [IDL.Principal],
        [IDL.Vec(DistributionRecord)],
        ['query'],
      ),
    'verifyDistribution' : IDL.Func([IDL.Text], [VerifyDistributionResult], []),
    'withdraw' : IDL.Func([WithdrawArgs], [WithdrawResult], []),
  });
  return TreasuryCanister;
};
export const init = ({ IDL }) => {
  const ThresholdKeyName = IDL.Text;
  const MinWithdrawConfig = IDL.Record({
    'icp' : IDL.Nat,
    'sol' : IDL.Nat,
    'baseUsdc' : IDL.Nat,
    'baseUsdt' : IDL.Nat,
    'baseEth' : IDL.Nat,
    'ckEth' : IDL.Nat,
    'ckUsdc' : IDL.Nat,
    'ckUsdt' : IDL.Nat,
    'solUsdc' : IDL.Nat,
    'solUsdt' : IDL.Nat,
  });
  const DistributionConfig = IDL.Record({
    'l1Bps' : IDL.Nat,
    'l2Bps' : IDL.Nat,
    'minWithdraw' : MinWithdrawConfig,
  });
  const TokenId = IDL.Variant({
    'ICP' : IDL.Null,
    'SOL' : IDL.Null,
    'SolUSDC' : IDL.Null,
    'SolUSDT' : IDL.Null,
    'ckETH' : IDL.Null,
    'ckUSDC' : IDL.Null,
    'ckUSDT' : IDL.Null,
    'BaseUSDC' : IDL.Null,
    'BaseUSDT' : IDL.Null,
    'BaseETH' : IDL.Null,
  });
  const AssetLocator = IDL.Variant({
    'Contract' : IDL.Text,
    'Mint' : IDL.Text,
    'Native' : IDL.Null,
  });
  const SupportedAsset = IDL.Record({
    'decimals' : IDL.Nat8,
    'tokenId' : TokenId,
    'locator' : AssetLocator,
    'symbol' : IDL.Text,
  });
  const EvmChainConfig = IDL.Record({
    'evmRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrls' : IDL.Vec(IDL.Text),
    'chainId' : IDL.Nat,
    'networkId' : IDL.Text,
  });
  const SolanaChainConfig = IDL.Record({
    'solRpcCanisterId' : IDL.Text,
    'assets' : IDL.Vec(SupportedAsset),
    'rpcUrl' : IDL.Opt(IDL.Text),
    'networkId' : IDL.Text,
  });
  const ChainConfig = IDL.Variant({
    'Evm' : EvmChainConfig,
    'Solana' : SolanaChainConfig,
  });
  const InitArgs = IDL.Record({
    'thresholdKeyName' : ThresholdKeyName,
    'admin' : IDL.Principal,
    'distributionConfig' : IDL.Opt(DistributionConfig),
    'chains' : IDL.Vec(ChainConfig),
  });
  return [InitArgs];
};
