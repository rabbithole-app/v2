import { Actor, type Agent } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchTokenBalancesForWallet, TOKEN_CONFIGS } from './balance.service';

describe('fetchTokenBalancesForWallet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves balance order and provider calls while overlapping chain requests', async () => {
    const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 40));
    const ledger = {
      icrc1_balance_of: vi.fn(async () => {
        await delay();
        return 0n;
      }),
      icrc1_fee: vi.fn(async () => {
        await delay();
        return 10n;
      }),
    };
    vi.spyOn(Actor, 'createActor').mockReturnValue(ledger as never);

    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { method: string };
      methods.push(body.method);
      await delay();
      return {
        json: async () =>
          body.method === 'getBalance'
            ? { result: { value: 20 } }
            : { result: { value: [] } },
      } as Response;
    }));

    const startedAt = Date.now();
    const balances = await fetchTokenBalancesForWallet({
      ledgerAgent: {} as Agent,
      ownerPrincipal: Principal.anonymous(),
      rates: { ICP: 1, ETH: 1, SOL: 1 },
      rpcConfig: { evmRpcUrl: 'fixture:evm', solanaRpcUrl: 'fixture:sol' },
      wallet: {
        evmAddress: ['0x0000000000000000000000000000000000000001'],
        icSubaccount: new Uint8Array(32),
        solAddress: ['fixture-sol-address'],
      },
    });

    expect(Date.now() - startedAt).toBeLessThan(125);
    expect(balances.map(({ label }) => label)).toEqual(
      TOKEN_CONFIGS.map(({ label }) => label),
    );
    expect(balances.map(({ balance }) => balance)).toEqual(
      TOKEN_CONFIGS.map(({ chain, label }) =>
        chain === 'solana' && label === 'SOL' ? 20n : 0n,
      ),
    );
    expect(ledger.icrc1_balance_of).toHaveBeenCalledTimes(4);
    expect(ledger.icrc1_fee).toHaveBeenCalledTimes(4);
    expect(methods.sort()).toEqual(
      ['eth_call', 'getBalance', 'getTokenAccountsByOwner'].sort(),
    );
  });
});
