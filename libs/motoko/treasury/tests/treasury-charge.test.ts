import { createIdentity } from '@dfinity/pic';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { E8S_PER_ICP, ICP_TRANSACTION_FEE } from '@rabbithole/testing';

import type { ChargeAndDistributeResult, DistributionRecord } from '../declarations/treasury/treasury.did.d.ts';
import { TreasuryManager } from './setup/treasury-manager.ts';

const userIdentity = createIdentity('charge-user');
const l1Identity = createIdentity('charge-l1');
const l2Identity = createIdentity('charge-l2');
const randomIdentity = createIdentity('charge-random');

const FEE = ICP_TRANSACTION_FEE;

// Current splits: 85% treasury, 15% L1, 0% L2
const TREASURY_BPS = 8500n;
const L1_BPS = 1500n;
const L2_BPS = 0n;
const BPS_BASE = 10000n;

describe('chargeAndDistribute', () => {
  let manager: TreasuryManager;

  beforeAll(async () => {
    manager = await TreasuryManager.create();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  test('ICP: current split (85/15/0) from user subaccount', async () => {
    const chargeAmount = 10n * E8S_PER_ICP;
    // Fund user's subaccount (not treasury main)
    await manager.mintToUserSubaccount(userIdentity.getPrincipal(), chargeAmount + 3n * FEE);

    const adminBefore = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    const l1Before = await manager.getSubaccountBalance(l1Identity.getPrincipal());
    const l2Before = await manager.getSubaccountBalance(l2Identity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-full-split',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: chargeAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [l2Identity.getPrincipal()],
      metadata: ['test charge'],
    });

    expect(result).toHaveProperty('ok');
    const record = (result as Extract<ChargeAndDistributeResult, { ok: DistributionRecord }>).ok;

    const expectedL1 = chargeAmount * L1_BPS / BPS_BASE;
    const expectedL2 = chargeAmount * L2_BPS / BPS_BASE;
    const expectedTreasury = chargeAmount - expectedL1 - expectedL2;

    expect(record.l1Amount).toBe(expectedL1);
    expect(record.l2Amount).toBe(expectedL2);
    expect(record.treasuryAmount).toBe(expectedTreasury);
    expect(record.status).toEqual({ completed: null });

    // Verify balances increased
    const adminAfter = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    expect(adminAfter - adminBefore).toBe(expectedTreasury - FEE);

    const l1After = await manager.getSubaccountBalance(l1Identity.getPrincipal());
    expect(l1After - l1Before).toBe(expectedL1 - FEE);

    const l2After = await manager.getSubaccountBalance(l2Identity.getPrincipal());
    expect(l2After - l2Before).toBe(0n);
  });

  test('ICP: no ambassadors -> 100% to admin', async () => {
    const chargeAmount = 5n * E8S_PER_ICP;
    await manager.mintToUserSubaccount(userIdentity.getPrincipal(), chargeAmount + FEE);

    const adminBefore = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-no-amb',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: chargeAmount,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });

    expect(result).toHaveProperty('ok');
    const record = (result as Extract<ChargeAndDistributeResult, { ok: DistributionRecord }>).ok;
    expect(record.treasuryAmount).toBe(chargeAmount);
    expect(record.l1Amount).toBe(0n);
    expect(record.l2Amount).toBe(0n);

    const adminAfter = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    expect(adminAfter - adminBefore).toBe(chargeAmount - FEE);
  });

  test('ICP: insufficient balance returns error', async () => {
    // User subaccount has 0 ICP (or very little from rounding)
    const freshUser = createIdentity('charge-poor-user');

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-insufficient',
      userId: freshUser.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: 5n * E8S_PER_ICP,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });

    expect(result).toHaveProperty('err');
    const err = (result as { err: unknown }).err;
    expect(err).toHaveProperty('TransferFailed');
  });

  test('unauthorized caller returns error', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-unauth',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: 1n * E8S_PER_ICP,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(result).toEqual({ err: { Unauthorized: null } });
  });

  test('idempotency: same paymentId returns #AlreadyProcessed', async () => {
    const chargeAmount = 1n * E8S_PER_ICP;
    await manager.mintToUserSubaccount(userIdentity.getPrincipal(), chargeAmount + FEE);

    manager.treasuryActor.setIdentity(manager.adminIdentity);

    const first = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-dup-test',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: chargeAmount,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(first).toHaveProperty('ok');

    const second = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-dup-test',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: chargeAmount,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(second).toEqual({ err: { AlreadyProcessed: null } });
  });

  test('zero amount returns #InvalidAmount', async () => {
    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-zero',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: 0n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(result).toEqual({ err: { InvalidAmount: null } });
  });
});

describe('chargeAndDistribute edge cases', () => {
  let manager: TreasuryManager;

  beforeAll(async () => {
    manager = await TreasuryManager.create();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  test('small amount: L2 stays disabled, treasury + L1 succeed', async () => {
    const chargeAmount = 100_000n; // 0.001 ICP
    // Fund enough for pre-check: totalAmount + 3*fee (pre-check is conservative)
    await manager.mintToUserSubaccount(userIdentity.getPrincipal(), chargeAmount + 3n * FEE);

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-small-amt',
      userId: userIdentity.getPrincipal(),
      tokenId: { ICP: null },
      totalAmount: chargeAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [l2Identity.getPrincipal()],
      metadata: [],
    });

    // Should succeed — only treasury + L1 are active
    expect(result).toHaveProperty('ok');
    const record = (result as Extract<ChargeAndDistributeResult, { ok: DistributionRecord }>).ok;
    // Treasury + L1 transfers only
    expect(record.transfers.length).toBe(2);
    expect(record.status).toEqual({ completed: null });
  });
});

describe('chargeAndDistribute ckUSDC', () => {
  let manager: TreasuryManager;

  beforeAll(async () => {
    manager = await TreasuryManager.createWithCkUsdc();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  test('ckUSDC: current split (85/15/0)', async () => {
    // Use small amounts for testing — $1 = 1_000_000 (6 decimals)
    const chargeAmount = 1_000_000n; // $1
    const ckusdcFee = 10_000n;
    // Fund user with enough for charge + 3 fees
    await manager.mintCkUsdcToUserSubaccount(userIdentity.getPrincipal(), chargeAmount + 3n * ckusdcFee);

    const adminBefore = await manager.getCkUsdcSubaccountBalance(manager.adminIdentity.getPrincipal());
    const l1Before = await manager.getCkUsdcSubaccountBalance(l1Identity.getPrincipal());
    const l2Before = await manager.getCkUsdcSubaccountBalance(l2Identity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.chargeAndDistribute({
      paymentId: 'charge-ckusdc-split',
      userId: userIdentity.getPrincipal(),
      tokenId: { ckUSDC: null },
      totalAmount: chargeAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [l2Identity.getPrincipal()],
      metadata: ['ckusdc test'],
    });

    expect(result).toHaveProperty('ok');
    const record = (result as Extract<ChargeAndDistributeResult, { ok: DistributionRecord }>).ok;

    const expectedL1 = chargeAmount * L1_BPS / BPS_BASE;
    const expectedL2 = chargeAmount * L2_BPS / BPS_BASE;
    const expectedTreasury = chargeAmount - expectedL1 - expectedL2;

    expect(record.l1Amount).toBe(expectedL1);
    expect(record.l2Amount).toBe(expectedL2);
    expect(record.treasuryAmount).toBe(expectedTreasury);

    const adminAfter = await manager.getCkUsdcSubaccountBalance(manager.adminIdentity.getPrincipal());
    expect(adminAfter - adminBefore).toBe(expectedTreasury - ckusdcFee);

    const l1After = await manager.getCkUsdcSubaccountBalance(l1Identity.getPrincipal());
    expect(l1After - l1Before).toBe(expectedL1 - ckusdcFee);

    const l2After = await manager.getCkUsdcSubaccountBalance(l2Identity.getPrincipal());
    expect(l2After - l2Before).toBe(0n);
  });
});

describe('getUserBalances', () => {
  let manager: TreasuryManager;

  beforeAll(async () => {
    manager = await TreasuryManager.create();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  // Note: getUserBalances queries all IC ledgers (ICP, ckUSDC, ckUSDT, ckETH).
  // PocketIC only has ICP ledger, so getBalances will fail on ckUSDC/ckUSDT/ckETH.
  // Use getBalance(#ICP) for individual token tests instead.

  test('getBalance: returns 0 for empty user', async () => {
    const freshUser = createIdentity('balance-empty-user');
    manager.treasuryActor.setIdentity(freshUser);
    const balance = await manager.treasuryActor.getBalance({ ICP: null });
    expect(balance).toBe(0n);
  });

  test('getBalance: returns correct ICP balance after funding', async () => {
    const fundAmount = 5n * E8S_PER_ICP;
    const testUser = createIdentity('balance-funded-user');
    await manager.mintToUserSubaccount(testUser.getPrincipal(), fundAmount);

    manager.treasuryActor.setIdentity(testUser);
    const balance = await manager.treasuryActor.getBalance({ ICP: null });
    expect(balance).toBe(fundAmount);
  });

  test('getUserBalances: unauthorized caller gets rejected', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    await expect(
      manager.treasuryActor.getUserBalances(userIdentity.getPrincipal()),
    ).rejects.toThrow();
  });
});
