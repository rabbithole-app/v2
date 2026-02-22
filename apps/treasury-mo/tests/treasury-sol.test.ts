import { createIdentity } from '@dfinity/pic';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runWithProxy } from '@rabbithole/testing';

import type { DistributePaymentResult, DistributionRecord, TransferRecord, WithdrawResult } from '../declarations/treasury/treasury.did.d.ts';
import { TreasuryManager } from './setup/treasury-manager.ts';

const l1Identity = createIdentity('sol-ambassador-l1');
const l2Identity = createIdentity('sol-ambassador-l2');
const payerIdentity = createIdentity('sol-payer');
const randomIdentity = createIdentity('sol-random');

// 0.05 SOL in lamports — enough for distribution tests (L2 5% share must cover rent-exemption ~890k lamports)
const FUND_SOL_LAMPORTS = 50_000_000n;

// ==== Section 1: Tests that do NOT require HTTPS outcalls ====

describe('Treasury Canister — SOL (no outcalls)', () => {
  let manager: TreasuryManager;
  let treasurySolAddress: string;
  let treasurySolSigningAddress: string;

  beforeAll(async () => {
    manager = await TreasuryManager.createWithSol();

    // These only use threshold Schnorr (PocketIC-internal), no Devnet needed
    treasurySolAddress = await manager.getTreasurySolAddress();
    treasurySolSigningAddress = await manager.getTreasurySolSigningAddress();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  // ---- getSolAddress (threshold Schnorr only, no HTTPS outcalls) ----

  test('getSolAddress: returns null when solConfig is not set + distributePayment returns #SolNotConfigured', async () => {
    const noSolManager = await TreasuryManager.create();
    try {
      noSolManager.treasuryActor.setIdentity(noSolManager.adminIdentity);

      const address = await noSolManager.treasuryActor.getSolAddress();
      expect(address).toEqual([]);

      const result = await noSolManager.treasuryActor.distributePayment({
        paymentId: 'sol-no-config',
        payer: payerIdentity.getPrincipal(),
        tokenId: { SOL: null },
        amount: 1_000_000n,
        ambassadorL1: [],
        ambassadorL2: [],
        metadata: [],
      });
      expect(result).toEqual({ err: { SolNotConfigured: null } });
    } finally {
      await noSolManager.afterAll();
    }
  });

  test('getSolAddress: returns valid base58 address when solConfig is set', () => {
    expect(treasurySolAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  test('getSolAddress: same caller gets same address (cached)', async () => {
    const addr2 = await manager.getTreasurySolAddress();
    expect(addr2).toEqual(treasurySolAddress);
  });

  test('getSolAddress: different callers get different addresses', async () => {
    manager.deferredTreasuryActor.setIdentity(l1Identity);
    const getResult = await manager.deferredTreasuryActor.getSolAddress();
    for (let i = 0; i < 10; i++) {
      await manager.pic.tick(2);
    }
    const l1Addr = await getResult();

    expect(l1Addr).toHaveLength(1);
    expect(l1Addr[0]).not.toEqual(treasurySolAddress);
  });

  test('getTreasurySolSigningAddress: returns valid base58 address', () => {
    expect(treasurySolSigningAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  test('getTreasurySolSigningAddress: differs from per-caller address', () => {
    expect(treasurySolSigningAddress).not.toEqual(treasurySolAddress);
  });

  test('distributePayment: unauthorized caller returns #Unauthorized', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'sol-unauth',
      payer: payerIdentity.getPrincipal(),
      tokenId: { SOL: null },
      amount: 1_000_000n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(result).toEqual({ err: { Unauthorized: null } });
  });

  test('distributePayment: zero amount returns #InvalidAmount', async () => {
    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'sol-zero',
      payer: payerIdentity.getPrincipal(),
      tokenId: { SOL: null },
      amount: 0n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(result).toEqual({ err: { InvalidAmount: null } });
  });

  test('distributePayment: SOL idempotency — already processed paymentId', async () => {
    await manager.mintToTreasury(1_000_000n);
    manager.treasuryActor.setIdentity(manager.adminIdentity);

    const first = await manager.treasuryActor.distributePayment({
      paymentId: 'sol-idem-test',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: 1_000_000n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(first).toHaveProperty('ok');

    const second = await manager.treasuryActor.distributePayment({
      paymentId: 'sol-idem-test',
      payer: payerIdentity.getPrincipal(),
      tokenId: { SOL: null },
      amount: 5_000_000n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(second).toEqual({ err: { AlreadyProcessed: null } });
  });

  // ---- withdraw error paths (no HTTPS outcalls) ----

  test('withdraw: SOL token below minimum returns #BelowMinimum', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { SOL: null },
      amount: 999n, // below minWithdraw.sol (1_000_000)
      to: { SOL: { address: treasurySolSigningAddress } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('BelowMinimum');
  });

  test('withdraw: IC token to SOL address returns #TransferFailed', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { ICP: null },
      amount: 100_000n,
      to: { SOL: { address: treasurySolSigningAddress } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('TransferFailed');
  });

  test('withdraw: SOL token to IC address returns #TransferFailed', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { SOL: null },
      amount: 1_000_000n,
      to: { IC: { owner: l1Identity.getPrincipal(), subaccount: [] } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('TransferFailed');
  });

  test('withdraw: SOL token to EVM address returns #TransferFailed', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { SOL: null },
      amount: 1_000_000n,
      to: { EVM: { address: '0x1234567890abcdef1234567890abcdef12345678' } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('TransferFailed');
  });
});

// ==== Section 2: Tests requiring HTTPS outcalls (real Solana RPC via proxy) ====
// These tests need the test funder to have SOL on Devnet.
// Fund it first: solana airdrop 2 A3N3odocG5GR2JiQvhzgwKJJBXXQRHE5Zar9NDkDzWxC --url devnet

describe('Treasury Canister — SOL (with outcalls)', () => {
  let manager: TreasuryManager;
  let treasurySolAddress: string;
  let treasurySolSigningAddress: string;

  beforeAll(async () => {
    manager = await TreasuryManager.createWithSol();

    treasurySolAddress = await manager.getTreasurySolAddress();
    treasurySolSigningAddress = await manager.getTreasurySolSigningAddress();

    // Fund addresses on Solana Devnet (requires funded test funder)
    await TreasuryManager.fundWithSol(treasurySolAddress, FUND_SOL_LAMPORTS);
    await TreasuryManager.fundWithSol(treasurySolSigningAddress, FUND_SOL_LAMPORTS);
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  test('getBalance: returns funded SOL balance', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);

    const balance = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.getBalance({ SOL: null });
      return proxy(getResult);
    });

    expect(balance).toBeGreaterThan(0n);
  });

  test('getBalance: returns 0 for unfunded user', async () => {
    manager.deferredTreasuryActor.setIdentity(randomIdentity);

    const balance = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.getBalance({ SOL: null });
      return proxy(getResult);
    });

    expect(balance).toBe(0n);
  });

  test('withdraw: SOL token insufficient balance returns #InsufficientBalance', async () => {
    manager.deferredTreasuryActor.setIdentity(randomIdentity);

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.withdraw({
        tokenId: { SOL: null },
        amount: 1_000_000_000n, // 1 SOL — unfunded user
        to: { SOL: { address: treasurySolSigningAddress } },
      });
      return proxy(getResult);
    });

    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('InsufficientBalance');
  });

  test('distributePayment: SOL no ambassadors — 100% treasury', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);
    const amount = 1_000_000n; // 0.001 SOL

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.distributePayment({
        paymentId: 'sol-dist-100',
        payer: payerIdentity.getPrincipal(),
        tokenId: { SOL: null },
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
    expect(transfers[0].solAddress).toHaveLength(1);
    expect(transfers[0].solSignature).toHaveLength(1);
    expect(transfers[0].error).toEqual([]);
    expect(record.status).toEqual({ completed: null });
  });

  test('distributePayment: SOL with L1 + L2 ambassadors', async () => {
    manager.deferredTreasuryActor.setIdentity(manager.adminIdentity);
    const amount = 20_000_000n; // 0.02 SOL — L2 (5%) = 1_000_000 lamports, above rent-exemption minimum

    const result = await runWithProxy(manager.pic, async (proxy) => {
      const getResult = await manager.deferredTreasuryActor.distributePayment({
        paymentId: 'sol-dist-l1l2',
        payer: payerIdentity.getPrincipal(),
        tokenId: { SOL: null },
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
    const grossL1 = (amount * 2000n) / 10000n; // 20%
    const grossL2 = (amount * 500n) / 10000n;  // 5%
    const grossTreasury = amount - grossL1 - grossL2; // 75%
    expect(record.l1Amount).toBe(grossL1);
    expect(record.l2Amount).toBe(grossL2);
    expect(record.treasuryAmount).toBe(grossTreasury);

    const transfers: TransferRecord[] = record.transfers;
    expect(transfers).toHaveLength(3);
    for (const t of transfers) {
      expect(t.solAddress).toHaveLength(1);
      expect(t.error).toEqual([]);
    }
    expect(record.status).toEqual({ completed: null });
  });
});
