import { formatTokenAmount } from '@rabbithole/core';
import { TOKEN_CONFIGS, type TokenConfig } from '@rabbithole/core/wallet';
import type { TokenId } from '@rabbithole/declarations/backend';

/** Token config keyed by its candid variant key (e.g. `{ ICP: null }` → `'ICP'`). */
const configByKey = new Map<string, TokenConfig>(
  TOKEN_CONFIGS.map((config) => [Object.keys(config.tokenId)[0], config]),
);

/** Formats a base-unit amount for a token key as `"12.5 ICP"`. */
export function formatTokenById(key: string, amount: bigint): string {
  const config = configByKey.get(key);
  const value = formatTokenAmount(amount, config?.decimals ?? 8);
  return config ? `${value} ${config.label}` : value;
}

/** Variant key of a candid TokenId (e.g. `{ ICP: null }` → `'ICP'`). */
export function tokenKey(tokenId: TokenId): string {
  return Object.keys(tokenId)[0] ?? '';
}

/**
 * USD value of a base-unit amount at current rates, mirroring BalanceService:
 * a stablecoin (no rateSymbol) is 1:1, a missing rate counts as 0, and an
 * unknown token can't be valued so it counts as 0.
 */
export function tokenUsdValue(
  key: string,
  amount: bigint,
  rates: Record<string, number>,
): number {
  const config = configByKey.get(key);
  if (!config) return 0;
  const units = Number(amount) / 10 ** config.decimals;
  const rate = config.rateSymbol ? (rates[config.rateSymbol] ?? 0) : 1;
  return units * rate;
}
