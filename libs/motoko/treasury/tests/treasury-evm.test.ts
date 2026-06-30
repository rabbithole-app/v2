import { createIdentity } from '@dfinity/pic';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runWithProxy } from '@rabbithole/testing';

import type { DistributePaymentResult, DistributionRecord, TransferRecord, WithdrawResult } from '../declarations/treasury/treasury.did.d.ts';
import { TreasuryManager } from './setup/treasury-manager.ts';

const l1Identity = createIdentity('evm-ambassador-l1');
const l2Identity = createIdentity('evm-ambassador-l2');
const payerIdentity = createIdentity('evm-payer');
const randomIdentity = createIdentity('evm-random');

// 0.0001 ETH — enough for gas fees on Sepolia
const FUND_ETH_WEI = 100_000_000_000_000n;
// $0.05 USDC (6 decimals) — enough for all distribution tests per run
const FUND_USDC = 50_000n;

describe('Treasury Canister — EVM', () => {
  let manager: TreasuryManager;
  /** Admin-derived EVM address (per-caller, used in getEvmAddress tests). */
  let treasuryEvmAddress: string;
  /** Canister's own signing address (empty derivation path, used for distributePayment transfers). */
  let treasurySigningAddress: string;

  beforeAll(async () => {
    manager = await TreasuryManager.createWithEvm();

    // Get admin-derived EVM address (per-caller identity)
    treasuryEvmAddress = await manager.getTreasuryEvmAddress();

    // Get the canister's own signing address — distributePayment signs txs from this address
    treasurySigningAddress = await manager.getTreasurySigningAddress();

    // Fund admin-derived address (for getBalance tests that check caller's balance)
    await TreasuryManager.fundWithEth(treasuryEvmAddress, FUND_ETH_WEI);
    await TreasuryManager.fundWithUsdc(treasuryEvmAddress, FUND_USDC);

    // Fund the signing address with ETH (for gas) and USDC (for distributePayment ERC-20 transfers)
    await TreasuryManager.fundWithEth(treasurySigningAddress, FUND_ETH_WEI);
    await TreasuryManager.fundWithUsdc(treasurySigningAddress, FUND_USDC);
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  // ==== Section 1: Tests that do NOT require HTTPS outcalls ====

  // ---- getEvmAddress (threshold ECDSA only, no HTTPS outcalls) ----

  test('getEvmAddress: returns null when evmConfig is not set + distributePayment returns #EvmNotConfigured', async () => {
    const noEvmManager = await TreasuryManager.create();
    try {
      noEvmManager.treasuryActor.setIdentity(noEvmManager.adminIdentity);

      // getEvmAddress without evmConfig → empty
      const address = await noEvmManager.treasuryActor.getEvmAddress();
      expect(address).toEqual([]);

      // distributePayment with EVM token without evmConfig → #EvmNotConfigured
      const result = await noEvmManager.treasuryActor.distributePayment({
        paymentId: 'evm-no-config',
        payer: payerIdentity.getPrincipal(),
        tokenId: { BaseUSDC: null },
        amount: 1_000_000n,
        ambassadorL1: [],
        ambassadorL2: [],
        metadata: [],
      });
      expect(result).toEqual({ err: { EvmNotConfigured: null } });
    } finally {
      await noEvmManager.afterAll();
    }
  });

  test('getEvmAddress: returns valid hex address when evmConfig is set', () => {
    expect(treasuryEvmAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  test('getEvmAddress: same caller gets same address (cached)', async () => {
    const addr2 = await manager.getTreasuryEvmAddress();
    expect(addr2).toEqual(treasuryEvmAddress);
  });

  test('getEvmAddress: different callers get different addresses', async () => {
    manager.deferredTreasuryActor.setIdentity(l1Identity);
    const getResult = await manager.deferredTreasuryActor.getEvmAddress();
    for (let i = 0; i < 10; i++) {
      await manager.pic.tick(2);
    }
    const l1Addr = await getResult();

    expect(l1Addr).toHaveLength(1);
    expect(l1Addr[0]).not.toEqual(treasuryEvmAddress);
  });

  test('getEvmAddress: derives address when wallet cache exists without evmAddress', async () => {
    const dualManager = await TreasuryManager.createWithEvmAndSol();
    try {
      dualManager.deferredTreasuryActor.setIdentity(l2Identity);

      const getSolResult = await dualManager.deferredTreasuryActor.getSolAddress();
      for (let i = 0; i < 10; i++) {
        await dualManager.pic.tick(2);
      }
      const solAddr = await getSolResult();

      expect(solAddr).toHaveLength(1);

      const getEvmResult = await dualManager.deferredTreasuryActor.getEvmAddress();
      for (let i = 0; i < 10; i++) {
        await dualManager.pic.tick(2);
      }
      const evmAddr = await getEvmResult();

      expect(evmAddr).toHaveLength(1);
      expect(evmAddr[0]).toMatch(/^0x[0-9a-fA-F]{40}$/);

      dualManager.treasuryActor.setIdentity(l2Identity);
      const cachedSolAddr = await dualManager.treasuryActor.getSolAddress();
      expect(cachedSolAddr).toEqual(solAddr);
    } finally {
      await dualManager.afterAll();
    }
  });

  test('distributePayment: unauthorized caller traps', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    await expect(
      manager.treasuryActor.distributePayment({
        paymentId: 'evm-unauth',
        payer: payerIdentity.getPrincipal(),
        tokenId: { BaseUSDC: null },
        amount: 1_000_000n,
        ambassadorL1: [],
        ambassadorL2: [],
        metadata: [],
      }),
    ).rejects.toThrow(/Unauthorized/);
  });

  test('distributePayment: zero amount returns #InvalidAmount', async () => {
    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'evm-zero',
      payer: payerIdentity.getPrincipal(),
      tokenId: { BaseUSDC: null },
      amount: 0n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(result).toEqual({ err: { InvalidAmount: null } });
  });

  test('distributePayment: EVM idempotency — already processed paymentId', async () => {
    await manager.mintToTreasury(1_000_000n);
    manager.treasuryActor.setIdentity(manager.adminIdentity);

    const first = await manager.treasuryActor.distributePayment({
      paymentId: 'evm-idem-test',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: 1_000_000n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(first).toHaveProperty('ok');

    // Same paymentId with EVM token → #AlreadyProcessed (no HTTP needed)
    const second = await manager.treasuryActor.distributePayment({
      paymentId: 'evm-idem-test',
      payer: payerIdentity.getPrincipal(),
      tokenId: { BaseUSDC: null },
      amount: 5_000_000n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(second).toEqual({ err: { AlreadyProcessed: null } });
  });

  // ---- withdraw error paths (no HTTPS outcalls) ----

  test('withdraw: EVM token below minimum returns #BelowMinimum', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { BaseUSDC: null },
      amount: 999n, // below minWithdraw.baseUsdc (1_000)
      to: { EVM: { address: '0x1234567890abcdef1234567890abcdef12345678' } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('BelowMinimum');
  });

  test('withdraw: IC token to EVM address returns #TransferFailed', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { ICP: null },
      amount: 100_000n,
      to: { EVM: { address: '0x1234567890abcdef1234567890abcdef12345678' } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('TransferFailed');
  });

  test('withdraw: EVM token to IC address returns #TransferFailed', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { BaseUSDC: null },
      amount: 1_000_000n,
      to: { IC: { owner: l1Identity.getPrincipal(), subaccount: [] } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('TransferFailed');
  });

  test('withdrawFromTreasury: EVM token below minimum returns #BelowMinimum', async () => {
    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.withdrawFromTreasury({
      tokenId: { BaseUSDC: null },
      amount: 999n,
      to: { EVM: { address: '0x1234567890abcdef1234567890abcdef12345678' } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('BelowMinimum');
  });

  test('withdrawFromTreasury: EVM token to IC address returns #TransferFailed', async () => {
    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.withdrawFromTreasury({
      tokenId: { BaseUSDC: null },
      amount: 1_000n,
      to: { IC: { owner: manager.adminIdentity.getPrincipal(), subaccount: [] } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('TransferFailed');
  });

  // ==== Section 2: Tests requiring HTTPS outcalls (real RPC via proxy) ====

  test('getBalance: returns funded USDC balance', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);

    const balance = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.getBalance({ BaseUSDC: null });
      return proxy(getResult);
    });

    expect(balance).toBeGreaterThan(0n);
  });

  test('getBalance: returns funded ETH balance', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);

    const balance = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.getBalance({ BaseETH: null });
      return proxy(getResult);
    });

    expect(balance).toBeGreaterThan(0n);
  });

  test('getBalance: returns 0 for unfunded user', async () => {
    manager.deferredTreasuryActor.setIdentity(randomIdentity);

    const balance = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.getBalance({ BaseUSDC: null });
      return proxy(getResult);
    });

    expect(balance).toBe(0n);
  });

  test('withdraw: EVM token insufficient balance returns #InsufficientBalance', async () => {
    manager.deferredTreasuryActor.setIdentity(randomIdentity);

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.withdraw({
        tokenId: { BaseUSDC: null },
        amount: 1_000_000n,
        to: { EVM: { address: '0x1234567890abcdef1234567890abcdef12345678' } },
      });
      return proxy(getResult);
    });

    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('InsufficientBalance');
  });

  test('withdrawFromTreasury: EVM token insufficient treasury balance returns #InsufficientBalance', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.withdrawFromTreasury({
        tokenId: { BaseUSDC: null },
        amount: FUND_USDC + 1_000_000n,
        to: { EVM: { address: '0x1234567890abcdef1234567890abcdef12345678' } },
      });
      return proxy(getResult);
    });

    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('InsufficientBalance');
  });

  test('distributePayment: BaseUSDC no ambassadors — 100% treasury', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);
    const amount = 10_000n; // $0.01 USDC

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.distributePayment({
        paymentId: 'evm-dist-100',
        payer: payerIdentity.getPrincipal(),
        tokenId: { BaseUSDC: null },
        amount,
        ambassadorL1: [],
        ambassadorL2: [],
        metadata: [],
      });
      return proxy(getResult);
    });

    if ('err' in (result as DistributePaymentResult)) {
      console.error('distributePayment no-amb error:', JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
    }
    expect(result).toHaveProperty('ok');
    const record = (result as Extract<DistributePaymentResult, { ok: DistributionRecord }>).ok;
    expect(record.treasuryAmount).toBe(amount);
    expect(record.l1Amount).toBe(0n);
    expect(record.l2Amount).toBe(0n);

    const transfers: TransferRecord[] = record.transfers;
    expect(transfers).toHaveLength(1);
    expect(transfers[0].evmAddress).toHaveLength(1);
    expect(transfers[0].error).toEqual([]);
    expect(record.status).toEqual({ completed: null });
  });

  test('distributePayment: BaseUSDC with L1 ambassador and disabled L2 share', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);
    const amount = 20_000n; // $0.02 USDC

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.distributePayment({
        paymentId: 'evm-dist-l1l2',
        payer: payerIdentity.getPrincipal(),
        tokenId: { BaseUSDC: null },
        amount,
        ambassadorL1: [l1Identity.getPrincipal()],
        ambassadorL2: [l2Identity.getPrincipal()],
        metadata: [],
      });
      return proxy(getResult);
    });

    if ('err' in (result as DistributePaymentResult)) {
      console.error('distributePayment L1+L2 error:', JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
    }
    expect(result).toHaveProperty('ok');
    const record = (result as Extract<DistributePaymentResult, { ok: DistributionRecord }>).ok;
    const grossL1 = (amount * 1500n) / 10000n; // 15%
    const grossL2 = 0n;
    const grossTreasury = amount - grossL1; // 85%
    expect(record.l1Amount).toBe(grossL1);
    expect(record.l2Amount).toBe(grossL2);
    expect(record.treasuryAmount).toBe(grossTreasury);

    const transfers: TransferRecord[] = record.transfers;
    expect(transfers).toHaveLength(2);
    for (const t of transfers) {
      expect(t.evmAddress).toHaveLength(1);
      expect(t.error).toEqual([]);
    }
    expect(record.status).toEqual({ completed: null });
  });
});
