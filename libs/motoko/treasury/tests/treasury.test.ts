import { createIdentity } from '@dfinity/pic';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { E8S_PER_ICP, ICP_TRANSACTION_FEE } from '@rabbithole/testing';

import type { DistributePaymentResult, DistributionRecord, WithdrawResult } from '../declarations/treasury/treasury.did.d.ts';
import { TreasuryManager } from './setup/treasury-manager.ts';

// 5 identities for all tests — reuse with delta-based balance checks
const payerIdentity = createIdentity('payer-user');
const l1Identity = createIdentity('ambassador-l1');
const l2Identity = createIdentity('ambassador-l2');
const randomIdentity = createIdentity('random-user');
// adminIdentity is created inside TreasuryManager

const FEE = ICP_TRANSACTION_FEE;

describe('Treasury Canister', () => {
  let manager: TreasuryManager;

  beforeAll(async () => {
    manager = await TreasuryManager.create();
  });

  afterAll(async () => {
    await manager?.afterAll();
  });

  // ---- Authorization ----

  test('distributePayment: unauthorized caller returns #Unauthorized', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'pay-001',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
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
      paymentId: 'pay-zero',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: 0n,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(result).toEqual({ err: { InvalidAmount: null } });
  });

  // ---- Distribution without ambassadors (100% treasury) ----

  test('distributePayment: no ambassadors -> 100% to treasury subaccount', async () => {
    const paymentAmount = 7n * E8S_PER_ICP;
    // Exactly amount — fee is deducted from recipient's share
    await manager.mintToTreasury(paymentAmount);

    const treasuryBefore = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'pay-100',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });

    expect(result).toHaveProperty('ok');
    const record = (result as Extract<DistributePaymentResult, { ok: DistributionRecord }>).ok;
    // Record stores gross amounts (before fee deduction)
    expect(record.treasuryAmount).toBe(paymentAmount);
    expect(record.l1Amount).toBe(0n);
    expect(record.l2Amount).toBe(0n);
    expect(record.status).toEqual({ completed: null });

    // Subaccount receives net = gross - fee
    const treasuryAfter = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    expect(treasuryAfter - treasuryBefore).toBe(paymentAmount - FEE);
  });

  // ---- Distribution with L1 only (80% treasury, 20% L1) ----

  test('distributePayment: L1 only -> 80% treasury, 20% L1', async () => {
    const paymentAmount = 10n * E8S_PER_ICP;
    await manager.mintToTreasury(paymentAmount);

    const treasuryBefore = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    const l1Before = await manager.getSubaccountBalance(l1Identity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'pay-l1',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [],
      metadata: [],
    });

    expect(result).toHaveProperty('ok');
    const record = (result as Extract<DistributePaymentResult, { ok: DistributionRecord }>).ok;
    const grossL1 = paymentAmount * 1500n / 10000n;
    const grossTreasury = paymentAmount - grossL1;
    expect(record.l1Amount).toBe(grossL1);
    expect(record.l2Amount).toBe(0n);
    expect(record.treasuryAmount).toBe(grossTreasury);
    expect(record.status).toEqual({ completed: null });

    // Subaccounts receive net = gross - fee
    const treasuryAfter = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    expect(treasuryAfter - treasuryBefore).toBe(grossTreasury - FEE);

    const l1After = await manager.getSubaccountBalance(l1Identity.getPrincipal());
    expect(l1After - l1Before).toBe(grossL1 - FEE);
  });

  // ---- Distribution with L1 + L2 (75% treasury, 20% L1, 5% L2) ----

  test('distributePayment: L1 + L2 -> 75% treasury, 20% L1, 5% L2', async () => {
    const paymentAmount = 10n * E8S_PER_ICP;
    await manager.mintToTreasury(paymentAmount);

    const treasuryBefore = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    const l1Before = await manager.getSubaccountBalance(l1Identity.getPrincipal());
    const l2Before = await manager.getSubaccountBalance(l2Identity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const result = await manager.treasuryActor.distributePayment({
      paymentId: 'pay-l1l2',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [l2Identity.getPrincipal()],
      metadata: [],
    });

    expect(result).toHaveProperty('ok');
    const record = (result as Extract<DistributePaymentResult, { ok: DistributionRecord }>).ok;
    const grossL1 = paymentAmount * 1500n / 10000n;
    const grossL2 = paymentAmount * 500n / 10000n;
    const grossTreasury = paymentAmount - grossL1 - grossL2;
    expect(record.l1Amount).toBe(grossL1);
    expect(record.l2Amount).toBe(grossL2);
    expect(record.treasuryAmount).toBe(grossTreasury);
    expect(record.status).toEqual({ completed: null });

    // Subaccounts receive net = gross - fee
    const treasuryAfter = await manager.getSubaccountBalance(manager.adminIdentity.getPrincipal());
    expect(treasuryAfter - treasuryBefore).toBe(grossTreasury - FEE);

    const l1After = await manager.getSubaccountBalance(l1Identity.getPrincipal());
    expect(l1After - l1Before).toBe(grossL1 - FEE);

    const l2After = await manager.getSubaccountBalance(l2Identity.getPrincipal());
    expect(l2After - l2Before).toBe(grossL2 - FEE);
  });

  // ---- Idempotency ----

  test('distributePayment: duplicate paymentId returns #AlreadyProcessed', async () => {
    const paymentAmount = 1n * E8S_PER_ICP;
    await manager.mintToTreasury(paymentAmount);

    manager.treasuryActor.setIdentity(manager.adminIdentity);

    const first = await manager.treasuryActor.distributePayment({
      paymentId: 'pay-dup',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(first).toHaveProperty('ok');

    const second = await manager.treasuryActor.distributePayment({
      paymentId: 'pay-dup',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });
    expect(second).toEqual({ err: { AlreadyProcessed: null } });
  });

  // ---- Withdraw ----

  test('withdraw: successful withdrawal reduces subaccount balance', async () => {
    const paymentAmount = 10n * E8S_PER_ICP;
    await manager.mintToTreasury(paymentAmount);

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    await manager.treasuryActor.distributePayment({
      paymentId: 'pay-for-withdraw',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [],
      metadata: [],
    });

    // L1 subaccount balance = gross L1 share - distribution fee
    const l1BalanceBefore = await manager.getSubaccountBalance(l1Identity.getPrincipal());

    // L1 withdraws 1 ICP
    const withdrawAmount = 1n * E8S_PER_ICP;
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { ICP: null },
      amount: withdrawAmount,
      to: { IC: { owner: l1Identity.getPrincipal(), subaccount: [] } },
    });

    expect(result).toHaveProperty('ok');

    // Withdraw deducts amount + fee from subaccount
    const l1BalanceAfter = await manager.getSubaccountBalance(l1Identity.getPrincipal());
    expect(l1BalanceBefore - l1BalanceAfter).toBe(withdrawAmount + FEE);
  });

  test('withdraw: below minimum returns #BelowMinimum', async () => {
    manager.treasuryActor.setIdentity(l1Identity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { ICP: null },
      amount: 1_000n, // 0.00001 ICP, below minimum of 0.001 ICP
      to: { IC: { owner: l1Identity.getPrincipal(), subaccount: [] } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('BelowMinimum');
  });

  test('withdraw: insufficient balance returns #InsufficientBalance', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    const result = await manager.treasuryActor.withdraw({
      tokenId: { ICP: null },
      amount: 1n * E8S_PER_ICP,
      to: { IC: { owner: randomIdentity.getPrincipal(), subaccount: [] } },
    });
    expect(result).toHaveProperty('err');
    expect((result as Extract<WithdrawResult, { err: unknown }>).err).toHaveProperty('InsufficientBalance');
  });

  // ---- Balance queries ----

  test('getBalance: returns correct balance after distribution', async () => {
    const paymentAmount = 5n * E8S_PER_ICP;
    await manager.mintToTreasury(paymentAmount);

    const l1Before = await manager.getSubaccountBalance(l1Identity.getPrincipal());

    manager.treasuryActor.setIdentity(manager.adminIdentity);
    await manager.treasuryActor.distributePayment({
      paymentId: 'pay-balance-check',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: paymentAmount,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [l2Identity.getPrincipal()],
      metadata: [],
    });

    manager.treasuryActor.setIdentity(l1Identity);
    const l1Balance = await manager.treasuryActor.getBalance({ ICP: null });
    // L1 receives net = gross - fee
    const grossL1 = paymentAmount * 1500n / 10000n;
    expect(l1Balance - l1Before).toBe(grossL1 - FEE);
  });

  test('getBalance: returns 0 for user with no funds', async () => {
    const freshIdentity = createIdentity('fresh-user-no-funds');
    manager.treasuryActor.setIdentity(freshIdentity);
    const balance = await manager.treasuryActor.getBalance({ ICP: null });
    expect(balance).toBe(0n);
  });

  // ---- Admin queries ----

  test('getDistributionLog: returns paginated audit log', async () => {
    manager.treasuryActor.setIdentity(manager.adminIdentity);
    const existingLog = await manager.treasuryActor.getDistributionLog({ offset: 0n, limit: 1000n });
    const baseOffset = BigInt(existingLog.length);

    await manager.mintToTreasury(30n * E8S_PER_ICP);

    for (let i = 0; i < 3; i++) {
      await manager.treasuryActor.distributePayment({
        paymentId: `pay-log-${i}`,
        payer: payerIdentity.getPrincipal(),
        tokenId: { ICP: null },
        amount: 10n * E8S_PER_ICP,
        ambassadorL1: [],
        ambassadorL2: [],
        metadata: [],
      });
    }

    const page1 = await manager.treasuryActor.getDistributionLog({ offset: baseOffset, limit: 2n });
    expect(page1).toHaveLength(2);
    expect(page1[0].paymentId).toBe('pay-log-0');
    expect(page1[1].paymentId).toBe('pay-log-1');

    const page2 = await manager.treasuryActor.getDistributionLog({ offset: baseOffset + 2n, limit: 2n });
    expect(page2).toHaveLength(1);
    expect(page2[0].paymentId).toBe('pay-log-2');
  });

  test('getUserDistributions: returns distributions for specific user', async () => {
    await manager.mintToTreasury(20n * E8S_PER_ICP);

    manager.treasuryActor.setIdentity(manager.adminIdentity);

    await manager.treasuryActor.distributePayment({
      paymentId: 'pay-user-dist-1',
      payer: payerIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: 10n * E8S_PER_ICP,
      ambassadorL1: [l1Identity.getPrincipal()],
      ambassadorL2: [],
      metadata: [],
    });

    await manager.treasuryActor.distributePayment({
      paymentId: 'pay-user-dist-2',
      payer: randomIdentity.getPrincipal(),
      tokenId: { ICP: null },
      amount: 10n * E8S_PER_ICP,
      ambassadorL1: [],
      ambassadorL2: [],
      metadata: [],
    });

    const l1Distributions = await manager.treasuryActor.getUserDistributions(l1Identity.getPrincipal());
    const l1PaymentIds = l1Distributions.map((d: DistributionRecord) => d.paymentId);
    expect(l1PaymentIds).toContain('pay-user-dist-1');
    expect(l1PaymentIds).not.toContain('pay-user-dist-2');

    const payerDistributions = await manager.treasuryActor.getUserDistributions(payerIdentity.getPrincipal());
    const payerPaymentIds = payerDistributions.map((d: DistributionRecord) => d.paymentId);
    expect(payerPaymentIds).toContain('pay-user-dist-1');
  });

  test('getDistributionLog: non-admin gets rejected', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    await expect(
      manager.treasuryActor.getDistributionLog({ offset: 0n, limit: 10n }),
    ).rejects.toThrow();
  });

  test('getTreasuryBalances: non-admin gets rejected', async () => {
    manager.treasuryActor.setIdentity(randomIdentity);
    await expect(manager.treasuryActor.getTreasuryBalances()).rejects.toThrow();
  });
});
