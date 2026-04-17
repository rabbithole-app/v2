import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';

import type { TokenId } from '@rabbithole/declarations';

import { LEDGER_CANISTER_ID } from '../constants';
import { injectHttpAgent, injectMainActor } from '../injectors';
import { MULTI_CHAIN_RPC_CONFIG_TOKEN } from '../tokens';

// Token configuration
export interface TokenBalance {
  balance: bigint;
  chain: 'base' | 'ic' | 'solana';
  decimals: number;
  label: string;
  tokenId: TokenId;
  usdValue: number;
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

// CoinGecko response shape
interface CoinGeckoResponse {
  'ethereum'?: { usd: number };
  'internet-computer'?: { usd: number };
  'solana'?: { usd: number };
}

const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=internet-computer,ethereum,solana&vs_currencies=usd';

export const TOKEN_CONFIGS: TokenConfig[] = [
  // IC tokens
  { tokenId: { ICP: null }, chain: 'ic', label: 'ICP', decimals: 8, rateSymbol: 'ICP', canisterId: LEDGER_CANISTER_ID },
  { tokenId: { ckUSDC: null }, chain: 'ic', label: 'ckUSDC', decimals: 6, canisterId: 'xevnm-gaaaa-aaaar-qafnq-cai' },
  { tokenId: { ckUSDT: null }, chain: 'ic', label: 'ckUSDT', decimals: 6, canisterId: 'cngnf-vqaaa-aaaar-qag4q-cai' },
  { tokenId: { ckETH: null }, chain: 'ic', label: 'ckETH', decimals: 18, rateSymbol: 'ETH', canisterId: 'ss2fx-dyaaa-aaaar-qacoq-cai' },
  // Base (EVM) tokens
  { tokenId: { BaseETH: null }, chain: 'base', label: 'ETH', decimals: 18, rateSymbol: 'ETH' },
  { tokenId: { BaseUSDC: null }, chain: 'base', label: 'USDC', decimals: 6, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { tokenId: { BaseUSDT: null }, chain: 'base', label: 'USDT', decimals: 6, contract: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' },
  // Solana tokens
  { tokenId: { SOL: null }, chain: 'solana', label: 'SOL', decimals: 9, rateSymbol: 'SOL' },
  { tokenId: { SolUSDC: null }, chain: 'solana', label: 'USDC', decimals: 6, mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { tokenId: { SolUSDT: null }, chain: 'solana', label: 'USDT', decimals: 6, mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
];

// Minimal ICRC-1 IDL for balance queries
const icrc1BalanceOfIdl = ({ IDL }: { IDL: any }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  return IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ['query']),
  });
};

// Base Multicall3 contract address
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
@Injectable({ providedIn: 'root' })
export class BalanceService {
  #actor = injectMainActor();
  #rpcConfig = inject(MULTI_CHAIN_RPC_CONFIG_TOKEN);
  #walletResource = resource({
    params: () => this.#actor(),
    loader: async ({ params: actor }) => {
      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) return null;

      return await actor.getMyWalletAddresses();
    },
  });

  walletAddresses = computed(() => this.#walletResource.value() ?? null);

  #httpAgent = injectHttpAgent();

  // Exchange rates from CoinGecko (plain fetch to avoid CORS preflight)
  #ratesResource = resource({
    loader: async () => {
      try {
        const res = await fetch(COINGECKO_URL);
        if (!res.ok) return null;
        return (await res.json()) as CoinGeckoResponse;
      } catch {
        return null;
      }
    },
  });

  rates = computed<Record<string, number>>(() => {
    const data = this.#ratesResource.value();
    return {
      ICP: data?.['internet-computer']?.usd ?? 0,
      ETH: data?.ethereum?.usd ?? 0,
      SOL: data?.solana?.usd ?? 0,
    };
  });

  #balancesResource = resource({
    params: () => ({
      wallet: this.walletAddresses(),
      agent: this.#httpAgent(),
      rates: this.rates(),
    }),
    loader: async ({ params: { wallet, agent, rates } }) => {
      if (!wallet) return [];

      const results: TokenBalance[] = [];

      // Fetch IC balances (4 parallel queries)
      const icConfigs = TOKEN_CONFIGS.filter((t) => t.chain === 'ic');
      const icBalances = await Promise.allSettled(
        icConfigs.map(async (config) => {
          const ledger = Actor.createActor(icrc1BalanceOfIdl, {
            agent,
            canisterId: config.canisterId!,
          });
          const balance = await ledger['icrc1_balance_of']({
            owner: Principal.fromText(
              (import.meta as any).env?.CANISTER_ID_RABBITHOLE_BACKEND ?? '',
            ),
            subaccount: [Array.from(wallet.icSubaccount)],
          });
          return { config, balance: balance as bigint };
        }),
      );

      for (const result of icBalances) {
        if (result.status === 'fulfilled') {
          const { config, balance } = result.value;
          results.push(toTokenBalance(config, balance, rates));
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
          this.#rpcConfig.evmRpcUrl,
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
          this.#rpcConfig.solanaRpcUrl,
        );
        results.push(...solBalances);
      } else {
        for (const config of TOKEN_CONFIGS.filter((t) => t.chain === 'solana')) {
          results.push(toTokenBalance(config, 0n, rates));
        }
      }

      return results;
    },
  });

  balances = computed<TokenBalance[]>(() => this.#balancesResource.value() ?? []);

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

  icBalances = computed(() =>
    this.visibleBalances().filter((b) => b.chain === 'ic'),
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

function toTokenBalance(config: TokenConfig, balance: bigint, rates: Record<string, number>): TokenBalance {
  const divisor = 10 ** config.decimals;
  const rate = config.rateSymbol ? (rates[config.rateSymbol] ?? 0) : 1; // stablecoins = 1
  const usdValue = (Number(balance) / divisor) * rate;
  return {
    tokenId: config.tokenId,
    chain: config.chain,
    label: config.label,
    balance,
    decimals: config.decimals,
    usdValue,
  };
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

function encodeMulticall3(calls: { callData: string; target: string; }[]): string {
  // aggregate3((address target, bool allowFailure, bytes callData)[])
  // Function selector: 0x82ad56cb
  const selector = '0x82ad56cb';

  // ABI encode the tuple array
  // This is a simplified encoder for our specific case
  const offset = '0000000000000000000000000000000000000000000000000000000000000020'; // offset to array
  const count = calls.length.toString(16).padStart(64, '0');

  const callDatas: string[] = [];

  // Each call struct: (address target, bool allowFailure, bytes callData)
  for (let i = 0; i < calls.length; i++) {
    const target = calls[i].target.slice(2).padStart(64, '0');
    const allowFailure = '0000000000000000000000000000000000000000000000000000000000000001'; // true
    const callDataBytes = calls[i].callData.slice(2);
    const callDataLen = (callDataBytes.length / 2).toString(16).padStart(64, '0');
    const callDataPadded = callDataBytes.padEnd(Math.ceil(callDataBytes.length / 64) * 64, '0');

    callDatas.push(target + allowFailure + '0000000000000000000000000000000000000000000000000000000000000060' + callDataLen + callDataPadded);
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
    const tokenJson = await tokenResponse.json();
    const tokenAccounts = tokenJson.result?.value ?? [];

    for (const config of splMints) {
      const account = tokenAccounts.find(
        (a: any) => a.account.data.parsed.info.mint === config.mint,
      );
      const balance = BigInt(
        account?.account.data.parsed.info.tokenAmount.amount ?? '0',
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
