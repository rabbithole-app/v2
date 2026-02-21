export const idlFactory = ({ IDL }) => {
  const InitArgs = IDL.Record({ 'admin' : IDL.Principal });
  const TokenId = IDL.Variant({
    'ICP' : IDL.Null,
    'ckETH' : IDL.Null,
    'ckUSDC' : IDL.Null,
    'ckUSDT' : IDL.Null,
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
  const TransferRecord = IDL.Record({
    'tokenId' : TokenId,
    'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'recipient' : IDL.Principal,
    'error' : IDL.Opt(IDL.Text),
    'blockIndex' : IDL.Opt(IDL.Nat),
    'amount' : IDL.Nat,
  });
  const DistributionRecord = IDL.Record({
    'id' : IDL.Nat,
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
    'TransferFailed' : IDL.Record({
      'recipient' : IDL.Text,
      'error' : IDL.Text,
    }),
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
  const WithdrawArgs = IDL.Record({
    'to' : IDL.Record({
      'owner' : IDL.Principal,
      'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    }),
    'tokenId' : TokenId,
    'amount' : IDL.Nat,
  });
  const WithdrawError = IDL.Variant({
    'BelowMinimum' : IDL.Record({ 'minimum' : IDL.Nat }),
    'InsufficientBalance' : IDL.Record({ 'available' : IDL.Nat }),
    'TransferFailed' : IDL.Text,
  });
  const WithdrawResult = IDL.Variant({ 'ok' : IDL.Nat, 'err' : WithdrawError });
  const TreasuryCanister = IDL.Service({
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
    'getTreasuryBalances' : IDL.Func([], [IDL.Vec(BalanceEntry)], []),
    'getUserDistributions' : IDL.Func(
        [IDL.Principal],
        [IDL.Vec(DistributionRecord)],
        ['query'],
      ),
    'withdraw' : IDL.Func([WithdrawArgs], [WithdrawResult], []),
  });
  return TreasuryCanister;
};
export const init = ({ IDL }) => {
  const InitArgs = IDL.Record({ 'admin' : IDL.Principal });
  return [InitArgs];
};
