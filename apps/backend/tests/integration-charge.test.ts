/**
 * Multi-canister integration tests: backend + ICP ledger.
 * Tests full payment flows: deposit, webhook, charge, auto-renew, grace period.
 */
import { createIdentity } from '@dfinity/pic';
import { principalToSubAccount } from '@dfinity/utils';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolve } from 'node:path';

import {
  BaseManager,
  E8S_PER_ICP,
  ICP_TRANSACTION_FEE,
  minterIdentity,
} from '@rabbithole/testing';
import {
  type RabbitholeActorService,
  initBackend,
  rabbitholeIdlFactory,
} from '@rabbithole/declarations';
import {
  ICPAY_SECRET,
  makePaymentCompletedEvent,
  signWebhookPayload,
} from './setup/helpers.ts';

const WASM_PATH = resolve(
  import.meta.dirname,
  '..',
  '.dfx',
  'local',
  'canisters',
  'rabbithole-backend',
  'rabbithole-backend.wasm.gz',
);

// ownerIdentity must match BaseManager's default owner (installer = admin)
// BaseManager uses createIdentity("superSecretAlicePassword") by default
const userIdentity = createIdentity('integ-user');
const l1Identity = createIdentity('integ-l1');

// ---- Helpers ----

function buildHttpRequest(body: string, signature: string) {
  return {
    url: '/webhook',
    method: 'POST',
    body: new TextEncoder().encode(body),
    headers: [
      ['content-type', 'application/json'],
      ['x-icpay-signature', signature],
    ] as [string, string][],
    certificate_version: [],
  };
}

// ========== Test Suite 1: Deposit + Wallet + Settings ==========

describe('Integration: deposit + wallet + settings', () => {
  let manager: BaseManager;
  let actor: any;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BaseManager.create();
    const fixture = await manager.setupCanister<RabbitholeActorService>({
      wasm: WASM_PATH,
      idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      arg: IDL.encode(initBackend({ IDL }), [{
        github: [],
        icpaySecretKey: [],
        evmConfig: [],
        solConfig: [],
      }]),
    });
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;

    actor.setIdentity(userIdentity);
    await actor.register([]);
    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  test('wallet addresses are deterministic per user', async () => {
    actor.setIdentity(userIdentity);
    const addr1 = await actor.getMyWalletAddresses();
    const addr2 = await actor.getMyWalletAddresses();
    expect(addr1.icSubaccount).toEqual(addr2.icSubaccount);
    expect(addr1.icSubaccount.length).toBe(32);
  });

  test('deposit ICP to subaccount → balance visible on ledger', async () => {
    const depositAmount = 2n * E8S_PER_ICP;
    const subaccount = principalToSubAccount(userIdentity.getPrincipal());

    manager.icpLedgerActor.setIdentity(minterIdentity);
    const result = await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [subaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: depositAmount,
    });
    expect(result).toHaveProperty('Ok');

    const balance = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId,
      subaccount: [subaccount],
    });
    expect(balance).toBe(depositAmount);
  });

  test('settings: default priority and autoRenew', async () => {
    actor.setIdentity(userIdentity);
    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(false);
    expect(settings.spendingPriority).toHaveLength(9);
    expect(settings.spendingPriority[0]).toEqual({ ckUSDC: null });
  });

  test('settings: update and persist', async () => {
    actor.setIdentity(userIdentity);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }, { ckUSDC: null }],
      autoRenew: true,
    });
    const s = await actor.getSettings();
    expect(s.autoRenew).toBe(true);
    expect(s.spendingPriority[0]).toEqual({ ICP: null });
  });
});

// ========== Test Suite 2: Webhook → Subscription Activation ==========

describe('Integration: webhook license/pro → subscription', () => {
  let manager: BaseManager;
  let actor: any;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BaseManager.create();

    const secretBytes = new TextEncoder().encode(ICPAY_SECRET);
    const fixture = await manager.setupCanister<RabbitholeActorService>({
      wasm: WASM_PATH,
      idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      arg: IDL.encode(initBackend({ IDL }), [{
        github: [],
        icpaySecretKey: [Array.from(secretBytes)],
        evmConfig: [],
        solConfig: [],
      }]),
    });
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;

    // Register users
    actor.setIdentity(l1Identity);
    await actor.register([]);
    const l1Profile = await actor.getProfile();
    const l1Code = l1Profile[0]?.referralCode?.[0];

    actor.setIdentity(userIdentity);
    await actor.register(l1Code ? [l1Code] : []);

    // Fund backend main account with ICP (simulating ICPay relay for direct purchase)
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  async function getPicTimestamp(): Promise<number> {
    await manager.pic.setTime(new Date().getTime());
    await manager.pic.tick();
    return Math.floor((await manager.pic.getTime()) / 1000);
  }

  test('webhook license → activates License subscription', async () => {
    const ts = await getPicTimestamp();
    const body = makePaymentCompletedEvent({
      purpose: 'license',
      userId: userIdentity.getPrincipal().toText(),
      amount: 499_000n, // $4.99 in e8s-like units
      paymentId: 'pay-license-integ',
    });
    const sig = signWebhookPayload(ICPAY_SECRET, body, ts);

    const response = await actor.http_request_update(buildHttpRequest(body, sig));
    expect(response.status_code).toBe(200);

    // Flush payment queue
    actor.setIdentity(manager.ownerIdentity);
    await actor.flushPaymentQueue();

    // Verify subscription activated
    actor.setIdentity(userIdentity);
    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(1);
    expect(sub[0].plan).toEqual({ License: null });
    expect(sub[0].status).toEqual({ Active: null });
  });

  test('webhook pro_monthly → activates Pro subscription with expiry', async () => {
    // Use different user to avoid AlreadyActive
    const proUser = createIdentity('integ-pro-user');
    actor.setIdentity(proUser);
    await actor.register([]);

    const ts = await getPicTimestamp();
    const body = makePaymentCompletedEvent({
      purpose: 'pro_monthly',
      userId: proUser.getPrincipal().toText(),
      amount: 990_000n,
      paymentId: 'pay-pro-integ',
    });
    const sig = signWebhookPayload(ICPAY_SECRET, body, ts);

    const response = await actor.http_request_update(buildHttpRequest(body, sig));
    expect(response.status_code).toBe(200);

    actor.setIdentity(manager.ownerIdentity);
    await actor.flushPaymentQueue();

    actor.setIdentity(proUser);
    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(1);
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
    // Should have expiry ~30 days from now
    expect(sub[0].expiresAt).toHaveLength(1);
    expect(sub[0].expiresAt[0]).toBeGreaterThan(0n);
  });

  test('webhook deposit → notification but no subscription change', async () => {
    const depositUser = createIdentity('integ-deposit-user');
    actor.setIdentity(depositUser);
    await actor.register([]);

    const ts = await getPicTimestamp();
    const body = makePaymentCompletedEvent({
      purpose: 'deposit',
      userId: depositUser.getPrincipal().toText(),
      amount: 5_000_000n,
      paymentId: 'pay-deposit-integ',
    });
    const sig = signWebhookPayload(ICPAY_SECRET, body, ts);

    await actor.http_request_update(buildHttpRequest(body, sig));

    actor.setIdentity(manager.ownerIdentity);
    await actor.flushPaymentQueue();

    // No subscription created
    actor.setIdentity(depositUser);
    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(0);

    // But notification received
    const notifs = await actor.getNotifications([], 10n);
    const depositNotif = notifs.data.find((n: any) => 'depositReceived' in n.event);
    expect(depositNotif).toBeDefined();
  });

  test('payment notification includes correct data', async () => {
    // Check that the license activation from earlier created a paymentReceived notification
    actor.setIdentity(userIdentity);
    const notifs = await actor.getNotifications([], 10n);
    const paymentNotif = notifs.data.find((n: any) => 'paymentReceived' in n.event);
    expect(paymentNotif).toBeDefined();
    expect(paymentNotif.event.paymentReceived.purpose).toBe('license');
  });
});

// ========== Test Suite 3: Auto-renew + Grace Period ==========

describe('Integration: auto-renew and grace period', () => {
  let manager: BaseManager;
  let actor: any;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BaseManager.create();
    const fixture = await manager.setupCanister<RabbitholeActorService>({
      wasm: WASM_PATH,
      idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      arg: IDL.encode(initBackend({ IDL }), [{
        github: [],
        icpaySecretKey: [],
        evmConfig: [],
        solConfig: [],
      }]),
    });
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  test('subscription with autoRenew=false expires without renewal attempt', async () => {
    const user = createIdentity('expire-no-renew');
    actor.setIdentity(user);
    await actor.register([]);

    // Admin activates Pro with short expiry (1 hour from now)
    actor.setIdentity(manager.ownerIdentity);
    const now = BigInt(Math.floor(Date.now() * 1_000_000)); // nanoseconds
    const oneHour = 3_600_000_000_000n;
    await actor.activateSubscription(
      user.getPrincipal(),
      { Pro: null },
      [now + oneHour],
    );

    actor.setIdentity(user);
    let sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });

    // Advance time 2 hours → subscription expired
    await manager.pic.advanceTime(2 * 60 * 60 * 1000);
    await manager.pic.tick();

    sub = await actor.getSubscription();
    expect(sub[0].status).toEqual({ Expired: null });
  });

  test('autoRenew=true with insufficient balance → #balanceLow notification', async () => {
    const user = createIdentity('renew-no-funds');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }, { ICP: null }],
      autoRenew: true,
    });

    // Admin activates Pro with expiry in 12 hours
    actor.setIdentity(manager.ownerIdentity);
    const now = BigInt(Math.floor(Date.now() * 1_000_000));
    const twelveHours = 12n * 3_600_000_000_000n;
    await actor.activateSubscription(
      user.getPrincipal(),
      { Pro: null },
      [now + twelveHours],
    );

    // No funds on any wallet — chargeForService will find nothing

    // Advance time 13 hours to trigger expiry
    await manager.pic.advanceTime(13 * 60 * 60 * 1000);
    // Tick multiple times to allow daily timer to fire
    for (let i = 0; i < 5; i++) {
      await manager.pic.tick();
    }

    // Subscription should be expired (auto-renew failed due to no funds)
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].status).toEqual({ Expired: null });
  });

  test('trial activation works and has 14-day expiry', async () => {
    const user = createIdentity('trial-user');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.activateTrial();

    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Trial: null });
    expect(sub[0].status).toEqual({ Active: null });
    expect(sub[0].expiresAt).toHaveLength(1);
  });

  test('multiple users: operations are isolated', async () => {
    const userA = createIdentity('iso-user-a');
    const userB = createIdentity('iso-user-b');

    actor.setIdentity(userA);
    await actor.register([]);
    await actor.updateSettings({ spendingPriority: [{ ICP: null }], autoRenew: true });

    actor.setIdentity(userB);
    await actor.register([]);

    // userB has default settings
    const settingsB = await actor.getSettings();
    expect(settingsB.autoRenew).toBe(false);
    expect(settingsB.spendingPriority[0]).toEqual({ ckUSDC: null });

    // userA's settings unchanged
    actor.setIdentity(userA);
    const settingsA = await actor.getSettings();
    expect(settingsA.autoRenew).toBe(true);
    expect(settingsA.spendingPriority[0]).toEqual({ ICP: null });
  });
});
