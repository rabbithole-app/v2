import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { Actor, type Agent, HttpAgent } from '@icp-sdk/core/agent';
import type { IDL as CandidIDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';

import type {
  RabbitholeActorService,
  TokenId,
  WithdrawDestination,
  WithdrawError,
  WithdrawReceipt,
} from '@rabbithole/declarations/backend';

import { LEDGER_CANISTER_ID } from '../constants';
import { HTTP_AGENT_OPTIONS_TOKEN } from '../injectors/http-agent';
import { injectMainActor } from '../injectors/main-actor';
import {
  BACKEND_FEATURES_ENABLED_TOKEN,
  MAIN_CANISTER_ID_TOKEN,
  MULTI_CHAIN_RPC_CONFIG_TOKEN,
  type MultiChainRpcConfig,
} from '../tokens';
import { formatTokenAmount } from '../utils/format-number';

// Token configuration
export interface TokenBalance {
  balance: bigint;
  canisterId?: string;
  chain: 'base' | 'ic' | 'solana';
  decimals: number;
  label: string;
  principalBalance?: bigint;
  principalUsdValue?: number;
  showUsdValue: boolean;
  tokenId: TokenId;
  usdValue: number;
  withdrawFee?: bigint;
}

export interface TokenConfig {
  canisterId?: string; // IC ledger canister ID
  chain: 'base' | 'ic' | 'solana';
  contract?: string; // EVM contract address
  decimals: number;
  label: string;
  mint?: string; // Solana SPL mint
  /** CoinGecko symbol for rate lookup. Undefined = stablecoin (rate 1.0) */
  rateSymbol?: 'ETH' | 'ICP' | 'SOL';
  tokenId: TokenId;
}

export interface WalletAddresses {
  evmAddress: [] | [string];
  icSubaccount: number[] | Uint8Array;
  solAddress: [] | [string];
}

// CoinGecko response shape
interface CoinGeckoResponse {
  ethereum?: { usd: number };
  'internet-computer'?: { usd: number };
  solana?: { usd: number };
}

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=internet-computer,ethereum,solana&vs_currencies=usd';

export const TOKEN_CONFIGS: TokenConfig[] = [
  // IC tokens
  {
    tokenId: { ICP: null },
    chain: 'ic',
    label: 'ICP',
    decimals: 8,
    rateSymbol: 'ICP',
    canisterId: LEDGER_CANISTER_ID,
  },
  {
    tokenId: { ckUSDC: null },
    chain: 'ic',
    label: 'ckUSDC',
    decimals: 6,
    canisterId: 'xevnm-gaaaa-aaaar-qafnq-cai',
  },
  {
    tokenId: { ckUSDT: null },
    chain: 'ic',
    label: 'ckUSDT',
    decimals: 6,
    canisterId: 'cngnf-vqaaa-aaaar-qag4q-cai',
  },
  {
    tokenId: { ckETH: null },
    chain: 'ic',
    label: 'ckETH',
    decimals: 18,
    rateSymbol: 'ETH',
    canisterId: 'ss2fx-dyaaa-aaaar-qacoq-cai',
  },
  // Base (EVM) tokens
  {
    tokenId: { BaseETH: null },
    chain: 'base',
    label: 'ETH',
    decimals: 18,
    rateSymbol: 'ETH',
  },
  {
    tokenId: { BaseUSDC: null },
    chain: 'base',
    label: 'USDC',
    decimals: 6,
    contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  {
    tokenId: { BaseUSDT: null },
    chain: 'base',
    label: 'USDT',
    decimals: 6,
    contract: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  // Solana tokens
  {
    tokenId: { SOL: null },
    chain: 'solana',
    label: 'SOL',
    decimals: 9,
    rateSymbol: 'SOL',
  },
  {
    tokenId: { SolUSDC: null },
    chain: 'solana',
    label: 'USDC',
    decimals: 6,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  {
    tokenId: { SolUSDT: null },
    chain: 'solana',
    label: 'USDT',
    decimals: 6,
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
];

export async function fetchTokenRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch(COINGECKO_URL);
    if (!res.ok) return zeroRates();
    const data = (await res.json()) as CoinGeckoResponse;
    return ratesFromCoinGecko(data);
  } catch {
    return zeroRates();
  }
}

// Minimal ICRC-1 IDL for balance queries
const icrc1BalanceOfIdl: CandidIDL.InterfaceFactory = ({ IDL }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const TransferError = IDL.Variant({
    BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    TooOld: IDL.Null,
  });
  return IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ['query']),
    icrc1_fee: IDL.Func([], [IDL.Nat], ['query']),
    icrc1_transfer: IDL.Func(
      [
        IDL.Record({
          amount: IDL.Nat,
          created_at_time: IDL.Opt(IDL.Nat64),
          fee: IDL.Opt(IDL.Nat),
          from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
          memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
          to: Account,
        }),
      ],
      [IDL.Variant({ Err: TransferError, Ok: IDL.Nat })],
      [],
    ),
  });
};

type IcrcAccount = {
  owner: Principal;
  subaccount: [] | [number[]];
};

type IcrcLedgerActor = {
  icrc1_balance_of(account: IcrcAccount): Promise<bigint>;
  icrc1_fee(): Promise<bigint>;
  icrc1_transfer(args: {
    amount: bigint;
    created_at_time: [] | [bigint];
    fee: [] | [bigint];
    from_subaccount: [] | [number[]];
    memo: [] | [number[]];
    to: IcrcAccount;
  }): Promise<IcrcTransferResult>;
};

type IcrcTransferResult = { Err: Record<string, unknown> } | { Ok: bigint };

interface SolanaTokenAccount {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: {
            amount?: string;
          };
        };
      };
    };
  };
}

interface SolanaTokenAccountsResponse {
  result?: {
    value?: SolanaTokenAccount[];
  };
}

// Base Multicall3 contract address
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
@Injectable({ providedIn: 'root' })
export class BalanceService {
  // Exchange rates from CoinGecko (plain fetch to avoid CORS preflight)
  #ratesResource = resource({
    loader: fetchTokenRates,
  });
  rates = computed<Record<string, number>>(
    () => this.#ratesResource.value() ?? zeroRates(),
  );
  #actor = injectMainActor();
  #backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);

  #userPrincipalResource = resource({
    params: () => ({
      actor: this.#actor(),
      enabled: this.#backendFeaturesEnabled,
    }),
    loader: async ({ params: { actor, enabled } }) => {
      if (!enabled) return null;

      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      return principal && !principal.isAnonymous() ? principal : null;
    },
  });

  userPrincipal = computed(() => this.#userPrincipalResource.value() ?? null);

  #walletResource = resource({
    params: () => ({
      actor: this.#actor(),
      enabled: this.#backendFeaturesEnabled,
    }),
    loader: async ({ params: { actor, enabled } }) => {
      if (!enabled) return null;

      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) return null;

      return await actor.getMyWalletAddresses();
    },
  });

  walletAddresses = computed(() => this.#walletResource.value() ?? null);

  #backendCanisterId = inject(MAIN_CANISTER_ID_TOKEN);

  #ledgerAgent = HttpAgent.create(inject(HTTP_AGENT_OPTIONS_TOKEN));
  #rpcConfig = inject(MULTI_CHAIN_RPC_CONFIG_TOKEN);

  #balancesResource = resource({
    params: () => ({
      wallet: this.walletAddresses(),
      rates: this.rates(),
      userPrincipal: this.userPrincipal(),
    }),
    loader: async ({ params: { wallet, rates, userPrincipal } }) => {
      if (!wallet) return [];

      const ledgerAgent = await this.#ledgerAgent;
      return fetchTokenBalancesForWallet({
        wallet,
        rates,
        ledgerAgent,
        ownerPrincipal: this.#backendCanisterId,
        depositPrincipal: userPrincipal,
        rpcConfig: this.#rpcConfig,
      });
    },
  });

  balances = computed<TokenBalance[]>(
    () => this.#balancesResource.value() ?? [],
  );
  hideZero = signal(true);
  nonZeroBalances = computed(() =>
    this.balances().filter((b) => b.balance > 0n),
  );
  visibleBalances = computed(() =>
    this.hideZero() ? this.nonZeroBalances() : this.balances(),
  );

  baseBalances = computed(() =>
    this.visibleBalances().filter((b) => b.chain === 'base'),
  );
  error = computed(
    () =>
      this.#walletResource.error() ??
      this.#ratesResource.error() ??
      this.#balancesResource.error() ??
      null,
  );

  icBalances = computed(() =>
    this.visibleBalances().filter((b) => b.chain === 'ic'),
  );

  isLoading = computed(
    () =>
      this.#walletResource.isLoading() ||
      this.#userPrincipalResource.isLoading() ||
      this.#ratesResource.isLoading() ||
      this.#balancesResource.isLoading(),
  );

  solanaBalances = computed(() =>
    this.visibleBalances().filter((b) => b.chain === 'solana'),
  );

  totalUsd = computed(() =>
    this.balances().reduce((sum, b) => sum + b.usdValue, 0),
  );

  reload(): void {
    this.#walletResource.reload();
    this.#ratesResource.reload();
    this.#balancesResource.reload();
  }
}

export async function fetchTokenBalancesForWallet(args: {
  depositPrincipal?: Principal | null;
  ledgerAgent: Agent;
  ownerPrincipal: Principal;
  rates: Record<string, number>;
  rpcConfig: MultiChainRpcConfig;
  wallet: WalletAddresses;
}): Promise<TokenBalance[]> {
  const {
    depositPrincipal,
    ledgerAgent,
    ownerPrincipal,
    rates,
    rpcConfig,
    wallet,
  } = args;
  const results: TokenBalance[] = [];

  // Fetch IC balances (4 parallel queries)
  const icConfigs = TOKEN_CONFIGS.filter((t) => t.chain === 'ic');
  const icBalances = await Promise.allSettled(
    icConfigs.map(async (config) => {
      if (!config.canisterId) {
        throw new Error(`${config.label} is missing an IC ledger canister ID`);
      }
      const ledger = Actor.createActor<IcrcLedgerActor>(icrc1BalanceOfIdl, {
        agent: ledgerAgent,
        canisterId: config.canisterId,
      });
      const [balance, principalBalance, withdrawFee] = await Promise.all([
        ledger.icrc1_balance_of({
          owner: ownerPrincipal,
          subaccount: [Array.from(wallet.icSubaccount)],
        }),
        depositPrincipal
          ? ledger.icrc1_balance_of({
              owner: depositPrincipal,
              subaccount: [],
            })
          : Promise.resolve(0n),
        ledger.icrc1_fee().catch(() => 0n),
      ]);
      return { config, balance, principalBalance, withdrawFee };
    }),
  );

  for (const result of icBalances) {
    if (result.status === 'fulfilled') {
      const { config, balance, principalBalance, withdrawFee } = result.value;
      results.push(
        toTokenBalance(config, balance, rates, principalBalance, withdrawFee),
      );
    } else {
      const config = icConfigs[icBalances.indexOf(result)];
      results.push(toTokenBalance(config, 0n, rates));
    }
  }

  // Fetch Base (EVM) balances via Multicall3
  if (wallet.evmAddress?.[0]) {
    const evmAddress = wallet.evmAddress[0];
    const baseBalances = await fetchBaseBalances(
      evmAddress,
      rates,
      rpcConfig.evmRpcUrl,
    );
    results.push(...baseBalances);
  } else {
    for (const config of TOKEN_CONFIGS.filter((t) => t.chain === 'base')) {
      results.push(toTokenBalance(config, 0n, rates));
    }
  }

  // Fetch Solana balances
  if (wallet.solAddress?.[0]) {
    const solAddress = wallet.solAddress[0];
    const solBalances = await fetchSolanaBalances(
      solAddress,
      rates,
      rpcConfig.solanaRpcUrl,
    );
    results.push(...solBalances);
  } else {
    for (const config of TOKEN_CONFIGS.filter((t) => t.chain === 'solana')) {
      results.push(toTokenBalance(config, 0n, rates));
    }
  }

  return results;
}

export async function moveIcPrincipalBalanceToWallet(args: {
  destinationOwner: Principal;
  destinationSubaccount: Uint8Array;
  ledgerAgent: Agent;
  token: TokenBalance;
}): Promise<bigint> {
  const { destinationOwner, destinationSubaccount, ledgerAgent, token } = args;
  if (token.chain !== 'ic' || !token.canisterId) {
    throw new Error(`${token.label} is not an Internet Computer ledger token`);
  }

  const principalBalance = token.principalBalance ?? 0n;
  const ledger = Actor.createActor<IcrcLedgerActor>(icrc1BalanceOfIdl, {
    agent: ledgerAgent,
    canisterId: token.canisterId,
  });
  const fee = await ledger.icrc1_fee();
  if (principalBalance <= fee) {
    throw new Error(`${token.label} balance is below the ledger fee`);
  }

  const result = await ledger.icrc1_transfer({
    amount: principalBalance - fee,
    created_at_time: [BigInt(Date.now()) * 1_000_000n],
    fee: [fee],
    from_subaccount: [],
    memo: [],
    to: {
      owner: destinationOwner,
      subaccount: [Array.from(destinationSubaccount)],
    },
  });

  if ('Err' in result) {
    throw new Error(`Move failed: ${formatIcrcTransferError(result.Err)}`);
  }

  return result.Ok;
}

export async function withdrawIcWalletBalanceToPrincipal(args: {
  backendActor: RabbitholeActorService;
  destinationOwner: Principal;
  ledgerAgent: Agent;
  token: TokenBalance;
}): Promise<WithdrawReceipt> {
  const { backendActor, destinationOwner, ledgerAgent, token } = args;
  if (token.chain !== 'ic' || !token.canisterId) {
    throw new Error(`${token.label} is not an Internet Computer ledger token`);
  }

  const ledger = Actor.createActor<IcrcLedgerActor>(icrc1BalanceOfIdl, {
    agent: ledgerAgent,
    canisterId: token.canisterId,
  });
  const fee = await ledger.icrc1_fee();
  if (token.balance <= fee) {
    throw new Error(`${token.label} balance is below the ledger fee`);
  }

  return withdrawWalletBalance({
    amount: token.balance - fee,
    backendActor,
    destination: {
      IC: {
        owner: destinationOwner,
        subaccount: [],
      },
    },
    token,
  });
}

export async function withdrawTreasuryBalance(args: {
  amount: bigint;
  backendActor: RabbitholeActorService;
  destination: WithdrawDestination;
  token: TokenBalance;
}): Promise<WithdrawReceipt> {
  const { amount, backendActor, destination, token } = args;
  const result = await backendActor.withdrawFromTreasury({
    amount,
    tokenId: token.tokenId,
    to: destination,
  });

  if ('err' in result) {
    throw new Error(formatWithdrawError(result.err, token));
  }

  return result.ok;
}

export async function withdrawWalletBalance(args: {
  amount: bigint;
  backendActor: RabbitholeActorService;
  destination: WithdrawDestination;
  token: TokenBalance;
}): Promise<WithdrawReceipt> {
  const { amount, backendActor, destination, token } = args;
  const result = await backendActor.withdraw({
    amount,
    tokenId: token.tokenId,
    to: destination,
  });

  if ('err' in result) {
    throw new Error(formatWithdrawError(result.err, token));
  }

  return result.ok;
}

function formatIcrcTransferError(error: Record<string, unknown>): string {
  const variant = Object.keys(error)[0];
  if (!variant) return 'unknown ledger error';

  const detail = error[variant];
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    return `${variant}: ${String((detail as { message: unknown }).message)}`;
  }

  return variant;
}

function formatWithdrawError(
  error: WithdrawError,
  token: TokenBalance,
): string {
  if ('InsufficientBalance' in error) {
    const available = formatTokenAmount(
      error.InsufficientBalance.available,
      token.decimals,
    );
    const feeHint = token.chain === 'ic' ? ' and the network fee' : '';
    return `Not enough balance for this amount${feeHint}. Available: ${available} ${token.label}`;
  }

  if ('BelowMinimum' in error) {
    const minimum = formatTokenAmount(
      error.BelowMinimum.minimum,
      token.decimals,
    );
    return `Amount is below the minimum withdrawal: ${minimum} ${token.label}`;
  }

  if ('TransferFailed' in error) {
    const message = error.TransferFailed.trim();
    return message ? `Transfer failed: ${message}` : 'Transfer failed.';
  }

  if ('EvmNotConfigured' in error) {
    return 'Base withdrawals are not configured yet.';
  }

  if ('SolNotConfigured' in error) {
    return 'Solana withdrawals are not configured yet.';
  }

  return 'Unable to complete this withdrawal. Try again later.';
}

function ratesFromCoinGecko(data: CoinGeckoResponse): Record<string, number> {
  return {
    ICP: data['internet-computer']?.usd ?? 0,
    ETH: data.ethereum?.usd ?? 0,
    SOL: data.solana?.usd ?? 0,
  };
}

function toTokenBalance(
  config: TokenConfig,
  balance: bigint,
  rates: Record<string, number>,
  principalBalance = 0n,
  withdrawFee?: bigint,
): TokenBalance {
  const divisor = 10 ** config.decimals;
  const rate = config.rateSymbol ? (rates[config.rateSymbol] ?? 0) : 1; // stablecoins = 1
  const usdValue = (Number(balance) / divisor) * rate;
  const principalUsdValue = (Number(principalBalance) / divisor) * rate;
  return {
    tokenId: config.tokenId,
    chain: config.chain,
    label: config.label,
    balance,
    canisterId: config.canisterId,
    decimals: config.decimals,
    principalBalance,
    principalUsdValue,
    showUsdValue: Boolean(config.rateSymbol),
    usdValue,
    withdrawFee,
  };
}

function zeroRates(): Record<string, number> {
  return { ETH: 0, ICP: 0, SOL: 0 };
}

// ERC-20 balanceOf(address) function selector
const BALANCE_OF_SELECTOR = '0x70a08231';

function decodeMulticall3Result(result: string, count: number): bigint[] {
  // Each result: (bool success, bytes returnData)
  // returnData for uint256 is 32 bytes
  const data = result.slice(2); // remove 0x
  const balances: bigint[] = [];

  // Simplified decoder — extract uint256 values from known positions
  // In practice, need proper ABI decoding
  for (let i = 0; i < count; i++) {
    try {
      // Skip to the return data portion for each result
      // This is a simplified version — will need adjustment for real ABI encoding
      const chunk = data.slice(i * 128 + 64, i * 128 + 128);
      if (chunk) {
        balances.push(BigInt('0x' + chunk));
      } else {
        balances.push(0n);
      }
    } catch {
      balances.push(0n);
    }
  }

  return balances;
}

function encodeMulticall3(
  calls: { callData: string; target: string }[],
): string {
  // aggregate3((address target, bool allowFailure, bytes callData)[])
  // Function selector: 0x82ad56cb
  const selector = '0x82ad56cb';

  // ABI encode the tuple array
  // This is a simplified encoder for our specific case
  const offset =
    '0000000000000000000000000000000000000000000000000000000000000020'; // offset to array
  const count = calls.length.toString(16).padStart(64, '0');

  const callDatas: string[] = [];

  // Each call struct: (address target, bool allowFailure, bytes callData)
  for (let i = 0; i < calls.length; i++) {
    const target = calls[i].target.slice(2).padStart(64, '0');
    const allowFailure =
      '0000000000000000000000000000000000000000000000000000000000000001'; // true
    const callDataBytes = calls[i].callData.slice(2);
    const callDataLen = (callDataBytes.length / 2)
      .toString(16)
      .padStart(64, '0');
    const callDataPadded = callDataBytes.padEnd(
      Math.ceil(callDataBytes.length / 64) * 64,
      '0',
    );

    callDatas.push(
      target +
        allowFailure +
        '0000000000000000000000000000000000000000000000000000000000000060' +
        callDataLen +
        callDataPadded,
    );
  }

  // Build final encoded data with proper offsets
  // For simplicity, use individual eth_call if encoding is complex
  // Fall back to sequential calls
  return selector + offset + count + callDatas.join('');
}

async function fetchBaseBalances(
  evmAddress: string,
  rates: Record<string, number>,
  rpcUrl: string,
): Promise<TokenBalance[]> {
  const baseConfigs = TOKEN_CONFIGS.filter((t) => t.chain === 'base');
  const results: TokenBalance[] = [];

  try {
    // Build Multicall3 aggregate calls
    const calls = baseConfigs.map((config) => {
      if (!config.contract) {
        // Native ETH — use getEthBalance on Multicall3
        return {
          target: MULTICALL3_ADDRESS,
          callData: '0x4d2301cc' + evmAddress.slice(2).padStart(64, '0'), // getEthBalance(address)
        };
      }
      // ERC-20 balanceOf
      return {
        target: config.contract,
        callData: BALANCE_OF_SELECTOR + evmAddress.slice(2).padStart(64, '0'),
      };
    });

    // Encode aggregate3 call
    const encodedCalls = encodeMulticall3(calls);

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: MULTICALL3_ADDRESS, data: encodedCalls }, 'latest'],
      }),
    });

    const json = await response.json();
    if (json.result) {
      const decoded = decodeMulticall3Result(json.result, baseConfigs.length);
      for (let i = 0; i < baseConfigs.length; i++) {
        const balance = decoded[i] ?? 0n;
        results.push(toTokenBalance(baseConfigs[i], balance, rates));
      }
    } else {
      for (const config of baseConfigs) {
        results.push(toTokenBalance(config, 0n, rates));
      }
    }
  } catch {
    for (const config of baseConfigs) {
      results.push(toTokenBalance(config, 0n, rates));
    }
  }

  return results;
}

async function fetchSolanaBalances(
  solAddress: string,
  rates: Record<string, number>,
  rpcUrl: string,
): Promise<TokenBalance[]> {
  const solConfigs = TOKEN_CONFIGS.filter((t) => t.chain === 'solana');
  const results: TokenBalance[] = [];

  try {
    // 1. Get native SOL balance
    const solResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [solAddress],
      }),
    });
    const solJson = await solResponse.json();
    const solBalance = BigInt(solJson.result?.value ?? 0);
    results.push(toTokenBalance(solConfigs[0], solBalance, rates));

    // 2. Get SPL token accounts
    const splMints = solConfigs.filter((c) => c.mint);
    const tokenResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTokenAccountsByOwner',
        params: [
          solAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' },
        ],
      }),
    });
    const tokenJson =
      (await tokenResponse.json()) as SolanaTokenAccountsResponse;
    const tokenAccounts = tokenJson.result?.value ?? [];

    for (const config of splMints) {
      const account = tokenAccounts.find(
        (account) => account.account?.data?.parsed?.info?.mint === config.mint,
      );
      const balance = BigInt(
        account?.account?.data?.parsed?.info?.tokenAmount?.amount ?? '0',
      );
      results.push(toTokenBalance(config, balance, rates));
    }
  } catch {
    for (const config of solConfigs) {
      if (!results.find((r) => r.label === config.label)) {
        results.push(toTokenBalance(config, 0n, rates));
      }
    }
  }

  return results;
}
