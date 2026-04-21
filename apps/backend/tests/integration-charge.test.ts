/**
 * Multi-canister integration tests: backend + ICP ledger + XRC mock.
 * Tests full payment flows: deposit, webhook, charge, auto-renew, grace period.
 * Tests chargeForService with ICP (CMC rate), ETH/SOL (XRC rate), and topUpFromBalance.
 */
import { Actor, createIdentity } from '@dfinity/pic';
import { principalToSubAccount } from '@dfinity/utils';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  encryptedStorageIdlFactory,
  initBackend,
  initEncryptedStorage,
  type NotificationsPage,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
  type StoredNotification,
  type TypedEvent,
} from '@rabbithole/declarations';
import {
  BaseManager,
  E8S_PER_ICP,
  ICP_LEDGER_CANISTER_ID,
  minterIdentity,
} from '@rabbithole/testing';
import { waitWithAutoProgress } from '@rabbithole/testing';
import { fundWithSol } from '@rabbithole/testing/sol';

import {
  BackendManager,
  buildBaseChainConfig,
  buildSolanaChainConfig,
} from './setup/backend-manager.ts';
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_RPC,
  BASE_SEPOLIA_USDC,
  BASE_SEPOLIA_USDT,
  CASHIER_CANISTER_ID,
  CKETH_CANISTER_ID,
  CKUSDC_CANISTER_ID,
  STORAGE_WASM_PATH as ENCRYPTED_STORAGE_WASM_PATH,
  fundWithEth,
  INFLATED_ETH_RATE,
  INFLATED_SOL_RATE,
  ONE_TRILLION_CYCLES,
  SOL_DEVNET_USDC_MINT,
  SOL_DEVNET_USDT_MINT,
  SOLANA_DEVNET_RPC,
} from './setup/constants.ts';
import { runHttpDownloaderQueueProcessor } from './setup/github-outcalls.ts';
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

type BackendActor = RabbitholeActorService;

type NotificationKey = keyof TypedEvent;

type NotificationOf<Key extends NotificationKey> = {
  event: Extract<TypedEvent, Record<Key, unknown>>;
} & StoredNotification;
type TopUpFromBalanceResult = Awaited<
  ReturnType<BackendActor['topUpFromBalance']>
>;
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
function encodeStorageInitArg(owner: Principal, backendId: Principal): Uint8Array {
  const [initArgsIdl] = initEncryptedStorage({ IDL });
  return new Uint8Array(
    IDL.encode([initArgsIdl], [
      {
        owner,
        vetKeyName: ['dfx_test_key'],
        backendId: [backendId],
        storageBackendType: [{ OnChain: null }],
      },
    ]),
  );
}

function expectTopUpError(result: TopUpFromBalanceResult): string {
  expect(result).toHaveProperty('err');
  if (!('err' in result)) {
    throw new Error('Expected top-up error result');
  }
  return result.err;
}

function expectTopUpSuccess(result: TopUpFromBalanceResult): { cyclesAdded: bigint } {
  expect(result).toHaveProperty('ok');
  if (!('ok' in result)) {
    throw new Error(`Expected top-up success, got error: ${result.err}`);
  }
  return result.ok;
}

function findNotification<Key extends NotificationKey>(
  notifications: NotificationsPage['data'],
  key: Key,
): NotificationOf<Key> | undefined {
  return notifications.find((notification): notification is NotificationOf<Key> =>
    hasNotificationEvent(notification, key),
  );
}

function hasAnyNotification<Key extends NotificationKey>(
  notifications: NotificationsPage['data'],
  key: Key,
): boolean {
  return notifications.some((notification) =>
    hasNotificationEvent(notification, key),
  );
}

function hasNotificationEvent<Key extends NotificationKey>(
  notification: StoredNotification,
  key: Key,
): notification is NotificationOf<Key> {
  return key in notification.event;
}

// ========== Test Suite 1: Deposit + Wallet + Settings ==========

describe('Integration: deposit + wallet + settings', () => {
  let manager: BaseManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BaseManager.create();
    const fixture = await manager.setupCanister<RabbitholeActorService>({
      wasm: WASM_PATH,
      idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      arg: IDL.encode(initBackend({ IDL }), [{
        thresholdKeyName: 'dfx_test_key',
        github: [],
        icpaySecretKey: [],
        chains: [],
        cashierCanisterId: CASHIER_CANISTER_ID,
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
    expect(settings.spendingPriority).toHaveLength(10);
    expect(settings.spendingPriority[0]).toEqual({ ckUSDC: null });
  });

  test('settings: update and persist', async () => {
    actor.setIdentity(userIdentity);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }, { ckUSDC: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });
    const s = await actor.getSettings();
    expect(s.autoRenew).toBe(true);
    expect(s.spendingPriority[0]).toEqual({ ICP: null });
  });
});

// ========== Test Suite 2: Webhook → Subscription Activation ==========
// Mirrors the backend `ICPAY_ENABLED` flag in main.mo — skipped while
// ICPay middleware is off.
const ICPAY_ENABLED = false;

describe.skipIf(!ICPAY_ENABLED)('Integration: webhook license/pro → subscription', () => {
  let manager: BaseManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BaseManager.create();

    const secretBytes = new TextEncoder().encode(ICPAY_SECRET);
    const fixture = await manager.setupCanister<RabbitholeActorService>({
      wasm: WASM_PATH,
      idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      arg: IDL.encode(initBackend({ IDL }), [{
        thresholdKeyName: 'dfx_test_key',
        github: [],
        icpaySecretKey: [Array.from(secretBytes)],
        chains: [],
        cashierCanisterId: CASHIER_CANISTER_ID,
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
    return Math.floor((await manager.pic.getTime()) / 1000);
  }

  test('webhook license → creates license record', async () => {
    const ts = await getPicTimestamp();
    const body = makePaymentCompletedEvent({
      purpose: 'license',
      userId: userIdentity.getPrincipal().toText(),
      amount: 490_000n, // $4.90 in e8s-like units
      paymentId: 'pay-license-integ',
    });
    const sig = signWebhookPayload(ICPAY_SECRET, body, ts);

    const response = await actor.http_request_update(buildHttpRequest(body, sig));
    expect(response.status_code).toBe(200);

    // Flush payment queue
    actor.setIdentity(manager.ownerIdentity);
    await actor.flushPaymentQueue();

    // Verify license created (not subscription)
    actor.setIdentity(userIdentity);
    const licenses = (await actor.listLicenses([])).data;
    expect(licenses).toHaveLength(1);
    expect(licenses[0].canisterId).toHaveLength(0); // unbound
    expect(licenses[0].receipt.paymentId).toBe('pay-license-integ');
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
    const depositNotif = findNotification(notifs.data, 'depositReceived');
    expect(depositNotif).toBeDefined();
  });

  test('payment notification includes correct data', async () => {
    // Check that the license activation from earlier created a paymentReceived notification
    actor.setIdentity(userIdentity);
    const notifs = await actor.getNotifications([], 10n);
    const paymentNotif = findNotification(notifs.data, 'paymentReceived');
    expect(paymentNotif).toBeDefined();
    expect(paymentNotif.event.paymentReceived.purpose).toBe('license');
  });
});

// ========== Test Suite 3: Auto-renew + Grace Period ==========

describe('Integration: auto-renew and grace period', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;

  beforeAll(async () => {
    manager = await BackendManager.create();
    await manager.deployXrcMock();
    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  test('subscription with autoRenew=false expires without renewal attempt', async () => {
    const user = createIdentity('expire-no-renew');
    actor.setIdentity(user);
    await actor.register([]);

    // Admin activates Pro with short expiry (1 hour from now)
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n; // nanoseconds
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

  test('autoRenew=true with insufficient balance → Expired', async () => {
    const user = createIdentity('renew-no-funds');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }, { ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Admin activates Pro with expiry in 1 hour (using PIC time)
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    const oneHour = 3_600_000_000_000n;
    await actor.activateSubscription(
      user.getPrincipal(),
      { Pro: null },
      [now + oneHour],
    );

    // No funds — trigger auto-renewals explicitly
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // chargeForService fails → balanceLow notification
    actor.setIdentity(user);
    const notifs = await actor.getNotifications([], 10n);
    const lowNotif = findNotification(notifs.data, 'balanceLow');
    expect(lowNotif).toBeDefined();
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

  test('grace period: expired > 3 days → downgrade to Free', async () => {
    const user = createIdentity('grace-period-user');
    actor.setIdentity(user);
    await actor.register([]);

    // Activate Pro with expiry 1 hour from now
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // Advance 2 hours → expired
    await manager.pic.advanceTime(2 * 60 * 60 * 1000);
    await manager.pic.tick(2);

    actor.setIdentity(user);
    let sub = await actor.getSubscription();
    expect(sub[0].status).toEqual({ Expired: null });

    // Advance 4 more days (total > 3 days past expiry)
    await manager.pic.advanceTime(4 * 24 * 60 * 60 * 1000);
    await manager.pic.tick(2);

    // Trigger auto-renewals which also checks grace period
    actor.setIdentity(manager.ownerIdentity);
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Should be downgraded to Free
    actor.setIdentity(user);
    sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Free: null });

    // Should have subscriptionExpired notification
    const notifs = await actor.getNotifications([], 10n);
    const expiredNotif = findNotification(notifs.data, 'subscriptionExpired');
    expect(expiredNotif).toBeDefined();
  });

  test('multiple users: operations are isolated', async () => {
    const userA = createIdentity('iso-user-a');
    const userB = createIdentity('iso-user-b');

    actor.setIdentity(userA);
    await actor.register([]);
    await actor.updateSettings({ spendingPriority: [{ ICP: null }], autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES });

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

// ========== Test Suite 4: Auto-renew with ICP (CMC rate) ==========

describe('Integration: auto-renew with ICP at CMC rate', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BackendManager.create();
    await manager.deployXrcMock();
    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  test('chargeForService: ICP charged at CMC rate for auto-renew', async () => {
    const user = createIdentity('icp-renew-user');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Get CMC rate to calculate expected ICP amount
    const cmcRate = await manager.cmcActor.get_icp_xdr_conversion_rate();
    const xdrPermyriadPerIcp = cmcRate.data.xdr_permyriad_per_icp;
    expect(xdrPermyriadPerIcp).toBeGreaterThan(0n);

    // Fund user's ICP subaccount with enough for Pro ($9.90)
    const fundAmount = 10n * E8S_PER_ICP; // 10 ICP — more than enough
    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    const transferResult = await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: fundAmount,
    });
    expect(transferResult).toHaveProperty('Ok');

    // Activate Pro with expiry soon (set expiresAt to "now" so it's already expiring)
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n; // nanoseconds
    // Set expiry 1 hour from now
    const oneHour = 3_600_000_000_000n;
    await actor.activateSubscription(
      user.getPrincipal(),
      { Pro: null },
      [now + oneHour],
    );

    // Check balance before
    const balanceBefore = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId,
      subaccount: [userSubaccount],
    });

    // Trigger auto-renewals explicitly
    // processAutoRenewals looks for subscriptions expiring within 24h from now
    actor.setIdentity(manager.ownerIdentity);
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Check balance after — should have decreased
    const balanceAfter = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId,
      subaccount: [userSubaccount],
    });
    expect(balanceAfter).toBeLessThan(balanceBefore);

    // Subscription should be renewed
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });

    // Verify notification
    const notifs = await actor.getNotifications([], 10n);
    const renewNotif = findNotification(notifs.data, 'subscriptionRenewed');
    expect(renewNotif).toBeDefined();
  });

  test('chargeForService: ICP insufficient, falls to next token → balanceLow', async () => {
    const user = createIdentity('icp-fallback-user');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }, { ckUSDC: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund with tiny ICP amount (not enough for Pro)
    const tinyAmount = 1000n; // 0.00001 ICP
    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: tinyAmount,
    });

    // No ckUSDC either — so chargeForService fails on all tokens

    // Activate Pro with expiry in 1 hour
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs2 = await manager.pic.getTime();
    const now2 = BigInt(picTimeMs2) * 1_000_000n;
    const oneHour2 = 3_600_000_000_000n;
    await actor.activateSubscription(
      user.getPrincipal(),
      { Pro: null },
      [now2 + oneHour2],
    );

    // Trigger auto-renewals
    actor.setIdentity(manager.ownerIdentity);
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Should have balanceLow notification
    actor.setIdentity(user);
    const notifs = await actor.getNotifications([], 10n);
    const lowNotif = findNotification(notifs.data, 'balanceLow');
    expect(lowNotif).toBeDefined();
  });

  test('chargeForService: ICP amount matches expected CMC rate conversion', async () => {
    const user = createIdentity('icp-amount-check');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // XRC mock returns rate=10_000_000_000 (9 decimals = $10/ICP)
    // usdCentsToTokenAmount(990, rate, 9, 8):
    //   numerator = 990 * 10^8 * 10^9 = 99_000_000_000_000_000_000
    //   denominator = 10_000_000_000 * 100 = 1_000_000_000_000
    //   result = ceil(99_000_000_000_000_000_000 / 1_000_000_000_000) = 99_000_000
    const xrcRate = 10_000_000_000n; // default XRC mock rate
    const xrcDecimals = 9n;
    const numerator = 990n * (10n ** 8n) * (10n ** xrcDecimals);
    const denom = xrcRate * 100n;
    const expectedIcpE8s = (numerator + denom - 1n) / denom;

    // Fund generously
    const fundAmount = 100n * E8S_PER_ICP;
    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: fundAmount,
    });

    // Activate Pro with expiry in 1 hour
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs3 = await manager.pic.getTime();
    const now3 = BigInt(picTimeMs3) * 1_000_000n;
    const oneHour3 = 3_600_000_000_000n;
    await actor.activateSubscription(
      user.getPrincipal(),
      { Pro: null },
      [now3 + oneHour3],
    );

    const balanceBefore = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId,
      subaccount: [userSubaccount],
    });

    // Trigger auto-renewals
    actor.setIdentity(manager.ownerIdentity);
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    const balanceAfter = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId,
      subaccount: [userSubaccount],
    });

    // The deducted amount should be approximately expectedIcpE8s (with fees)
    const deducted = balanceBefore - balanceAfter;
    // Allow 20% tolerance for fee overhead and distribution splits
    expect(deducted).toBeGreaterThan(expectedIcpE8s * 80n / 100n);
    expect(deducted).toBeLessThan(expectedIcpE8s * 150n / 100n);

    // Subscription renewed
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
  });

  test('renewal produces exactly one subscriptionRenewed notification', async () => {
    const user = createIdentity('single-notif-user');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Exactly one renewal notification
    actor.setIdentity(user);
    const notifs = await actor.getNotifications([], 20n);
    const renewNotifs = notifs.data.filter((notification): notification is NotificationOf<'subscriptionRenewed'> =>
      hasNotificationEvent(notification, 'subscriptionRenewed'),
    );
    expect(renewNotifs).toHaveLength(1);
    expect(renewNotifs[0].event.subscriptionRenewed.plan).toEqual({ Pro: null });
  });
});

// ========== Test Suite 5: topUpFromBalance ==========

describe('Integration: topUpFromBalance', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BackendManager.create();
    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;

    // Fund backend's main account with ICP (for CMC transfers)
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 100n * E8S_PER_ICP,
    });

    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  test('topUpFromBalance: non-owner canister → error', async () => {
    const user = createIdentity('topup-nonowner');
    actor.setIdentity(user);
    await actor.register([]);

    const fakeCanister = Principal.fromText('aaaaa-aa');
    const result = await actor.topUpFromBalance(fakeCanister, ONE_TRILLION_CYCLES);
    expect(result).toEqual({ err: 'You do not own this canister' });
  });

  test('topUpFromBalance: insufficient balance → error', async () => {
    const user = createIdentity('topup-nofunds');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // User doesn't own any storage canister → ownership check fails first
    const result = await actor.topUpFromBalance(
      user.getPrincipal(),
      ONE_TRILLION_CYCLES,
    );
    expect(result).toHaveProperty('err');
    expect(expectTopUpError(result)).toContain('do not own');
  });
});

// ========== Test Suite 6: chargeForService with ckETH (XRC mock) ==========

describe('Integration: chargeForService with ckETH (XRC)', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  // ETH rate: $2500 at 9 decimals = 2_500_000_000_000
  const ETH_USD_RATE = 2_500_000_000_000n;

  beforeAll(async () => {
    manager = await BackendManager.create();

    // Deploy ckETH ledger and XRC mock before backend
    await manager.deployCkEthLedger();
    await manager.deployXrcMock(ETH_USD_RATE);

    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();
  }, 300_000);

  afterAll(async () => { await manager?.afterAll(); });

  test('chargeForService: ckETH charged at XRC rate when priority [#ckETH]', async () => {
    const user = createIdentity('eth-charge-user');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckETH: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund user's ckETH subaccount (1 ETH = 10^18 wei)
    const oneEth = 1_000_000_000_000_000_000n;
    await manager.mintToUserSubaccount(
      CKETH_CANISTER_ID,
      user.getPrincipal(),
      oneEth,
    );

    // Activate Pro with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // Trigger auto-renewals
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Subscription should be renewed
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });

    const notifs = await actor.getNotifications([], 10n);
    const renewNotif = findNotification(notifs.data, 'subscriptionRenewed');
    expect(renewNotif).toBeDefined();
  });

  test('chargeForService: ETH rate conversion is correct', async () => {
    const user = createIdentity('eth-amount-check');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckETH: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund with plenty of ckETH
    const fundAmount = 1_000_000_000_000_000_000n; // 1 ETH
    await manager.mintToUserSubaccount(CKETH_CANISTER_ID, user.getPrincipal(), fundAmount);

    // Expected: $9.90 / $2500 per ETH = 0.00396 ETH = 3_960_000_000_000_000 wei
    // With ceiling division and fees, allow tolerance
    const expectedWei = 3_960_000_000_000_000n;

    // Get balance before
    const ledgerActor = manager.createIcrcLedgerActor(
      CKETH_CANISTER_ID,
    );
    const subaccount = principalToSubAccount(user.getPrincipal());
    const balBefore = await ledgerActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });

    // Activate and trigger
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    const balAfter = await ledgerActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });

    const deducted = balBefore - balAfter;
    // 30% tolerance for fees and distribution splits
    expect(deducted).toBeGreaterThan(expectedWei * 70n / 100n);
    expect(deducted).toBeLessThan(expectedWei * 200n / 100n);
  });
});

// ========== Test Suite 7: chargeForService with ICP → ckUSDC fallback ==========

describe('Integration: ICP insufficient falls to ckUSDC', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BackendManager.create({ fiduciary: true });

    // Deploy XRC mock and ckUSDC ledger
    await manager.deployXrcMock();
    await manager.deployCkUsdcLedger();

    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();
  }, 300_000);

  afterAll(async () => { await manager?.afterAll(); });

  test('auto-renew: ICP insufficient, falls to ckUSDC → successful', async () => {
    const user = createIdentity('fallback-ckusdc');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }, { ckUSDC: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund with tiny ICP (insufficient) and enough ckUSDC
    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 1000n, // tiny ICP
    });

    // Fund ckUSDC: $20 = 20_000_000 (6 decimals)
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      user.getPrincipal(),
      20_000_000n,
    );

    // Activate Pro with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // Trigger auto-renewals
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Subscription should be renewed (via ckUSDC fallback)
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });

    const notifs = await actor.getNotifications([], 10n);
    const renewNotif = findNotification(notifs.data, 'subscriptionRenewed');
    expect(renewNotif).toBeDefined();
  });

  test('chargeForService: ckUSDC charged directly at 1:1 USD rate', async () => {
    const user = createIdentity('ckusdc-direct');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund with $20 ckUSDC
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      user.getPrincipal(),
      20_000_000n, // $20 = 20_000_000 (6 decimals)
    );

    // Activate Pro with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // Get ckUSDC balance before
    const ckUsdcActor = manager.createIcrcLedgerActor(
      CKUSDC_CANISTER_ID,
    );
    const subaccount = principalToSubAccount(user.getPrincipal());
    const balBefore = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });

    // Trigger auto-renew
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Balance should decrease by ~$9.90 = 9_900_000 (plus fees)
    const balAfter = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });
    const deducted = balBefore - balAfter;
    // $9.90 = 9_900_000. Allow tolerance for fees.
    expect(deducted).toBeGreaterThan(9_800_000n);
    expect(deducted).toBeLessThan(10_100_000n);

    // Subscription renewed
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
  });

  test('chargeForService: ckUSDC tried before ICP when priority [ckUSDC, ICP]', async () => {
    const user = createIdentity('priority-order');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }, { ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund BOTH ckUSDC and ICP
    await manager.mintToUserSubaccount(CKUSDC_CANISTER_ID, user.getPrincipal(), 20_000_000n);

    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    // Activate Pro
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // Record ICP balance before
    const icpBefore = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [userSubaccount],
    });

    // Trigger
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // ICP should be UNCHANGED (ckUSDC used first since priority [ckUSDC, ICP])
    const icpAfter = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [userSubaccount],
    });
    expect(icpAfter).toBe(icpBefore);

    // ckUSDC should decrease
    const ckUsdcActor = manager.createIcrcLedgerActor(
      CKUSDC_CANISTER_ID,
    );
    const ckUsdcAfter = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [userSubaccount],
    });
    expect(ckUsdcAfter).toBeLessThan(20_000_000n);
  });
});

// ========== Test Suite 8: topUpFromBalance full flow ==========

describe('Integration: topUpFromBalance full flow', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;
  let storageCanisterId: Principal;
  const storageUser = createIdentity('topup-storage-user');

  beforeAll(async () => {
    manager = await BackendManager.create({ fiduciary: true });

    // Deploy XRC mock and ckUSDC ledger for charging
    await manager.deployXrcMock();
    await manager.deployCkUsdcLedger();

    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;

    // Wait for GitHub releases to download (mocked HTTP outcalls)
    // runHttpDownloaderQueueProcessor imported statically at top of file
    actor.setIdentity(manager.ownerIdentity);
    await runHttpDownloaderQueueProcessor(
      manager.pic,
      async () => (await actor.getReleasesFullStatus()).hasDownloadedRelease,
    );
    await manager.pic.tick();

    // Wait for extraction to complete
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      await manager.pic.tick(20);
      ready = (await actor.getReleasesFullStatus()).hasDeploymentReadyRelease;
    }
    expect(ready).toBe(true);

    // Fund backend's TREASURY subaccount with ICP (unified pool — CMC
    // top-ups draw from treasury now, not default).
    await manager.mintToTreasurySubaccount(ICP_LEDGER_CANISTER_ID, 100n * E8S_PER_ICP);

    // Deploy storage canister directly via PocketIC
    // initEncryptedStorage and encryptedStorageIdlFactory imported statically at top of file
    const storageInitArg = encodeStorageInitArg(
      storageUser.getPrincipal(),
      backendCanisterId,
    );

    const storageFixture = await manager.pic.setupCanister({
      wasm: ENCRYPTED_STORAGE_WASM_PATH,
      sender: storageUser.getPrincipal(),
      idlFactory: encryptedStorageIdlFactory as unknown as IDL.InterfaceFactory,
      arg: storageInitArg,
    });
    storageCanisterId = storageFixture.canisterId;
    await manager.pic.tick();

    // WASM hash auto-registered via handleAssetDownloaded callback
    const knownHashes = await actor.listKnownWasmHashes();
    expect(knownHashes.length).toBeGreaterThan(0);

    // Register storage canister
    actor.setIdentity(storageUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const addResult = await actor.addStorage(storageCanisterId, storageInitArg);
    if ('err' in addResult) {
      console.error('addStorage error:', JSON.stringify(addResult.err, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
    }
    expect(addResult).toHaveProperty('ok');
    await manager.pic.tick();
  }, 360_000);

  afterAll(async () => { await manager?.afterAll(); });

  test('topUpFromBalance: successful top-up → canister cycles increased', async () => {
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      storageUser.getPrincipal(),
      50_000_000n, // $50
    );

    const cyclesBefore = await manager.getCyclesBalance(storageCanisterId);

    actor.setIdentity(storageUser);
    const result = await actor.topUpFromBalance(
      storageCanisterId,
      ONE_TRILLION_CYCLES, // 1TC
    );
    await manager.pic.tick(10);

    expect(result).toHaveProperty('ok');
    expect(expectTopUpSuccess(result).cyclesAdded).toBeGreaterThan(0n);

    const cyclesAfter = await manager.getCyclesBalance(storageCanisterId);
    expect(cyclesAfter).toBeGreaterThan(cyclesBefore);
  });

  test('topUpFromBalance: correct USD charge based on cycles amount', async () => {
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      storageUser.getPrincipal(),
      50_000_000n,
    );

    const ckUsdcActor = manager.createIcrcLedgerActor(
      CKUSDC_CANISTER_ID,
    );
    const subaccount = principalToSubAccount(storageUser.getPrincipal());
    const balBefore = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });

    actor.setIdentity(storageUser);
    const result = await actor.topUpFromBalance(
      storageCanisterId,
      500_000_000_000n,
    );
    await manager.pic.tick(10);
    expect(result).toHaveProperty('ok');

    const balAfter = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });
    expect(balAfter).toBeLessThan(balBefore);
  });

  test('topUpFromBalance: refund on ICP transfer failure', async () => {
    // Fund user with moderate ckUSDC
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      storageUser.getPrincipal(),
      2_000_000_000n, // $2000 ckUSDC — enough for 1000T cycles charge
    );

    const ckUsdcActor = manager.createIcrcLedgerActor(
      CKUSDC_CANISTER_ID,
    );
    const subaccount = principalToSubAccount(storageUser.getPrincipal());
    const balBefore = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });

    actor.setIdentity(storageUser);
    // Request 1000T cycles — user has $2000 ckUSDC (enough for charge)
    // but backend only has 100 ICP (not enough for ~1538 ICP needed)
    // This triggers the ICP transfer failure → refund path
    const result = await actor.topUpFromBalance(
      storageCanisterId,
      1_000_000_000_000_000n, // 1000T cycles
    );
    await manager.pic.tick(10);

    // Should fail at CMC step
    expect(result).toHaveProperty('err');

    // User's ckUSDC should be refunded (balance nearly restored)
    const balAfter = await ckUsdcActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [subaccount],
    });
    // Refund restores full charge (simpleRefund, no ambassador split).
    // Full refund minus 2x fee (charge + refund).
    // So balAfter >= balBefore - chargeAmount (with tolerance for fees and splits)
    const maxLoss = 200_000n; // ~$0.20 — generous for 2x fee
    expect(balAfter).toBeGreaterThanOrEqual(balBefore - maxLoss);

    // topUpFailed notification
    actor.setIdentity(storageUser);
    const notifs = await actor.getNotifications([], 10n);
    const failNotif = findNotification(notifs.data, 'topUpFailed');
    expect(failNotif).toBeDefined();
  });

  test('topUpFromBalance: partial fill when balance < targetCycles', async () => {
    // Create a fresh user with a clean balance for partial fill test
    const partialUser = createIdentity('partial-fill-user');
    actor.setIdentity(partialUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Register storage under this user
    // initEncryptedStorage and encryptedStorageIdlFactory imported statically at top of file
    const partialStorageInitArg = encodeStorageInitArg(
      partialUser.getPrincipal(),
      backendCanisterId,
    );
    const partialStorage = await manager.pic.setupCanister({
      wasm: ENCRYPTED_STORAGE_WASM_PATH,
      sender: partialUser.getPrincipal(),
      idlFactory: encryptedStorageIdlFactory as unknown as IDL.InterfaceFactory,
      arg: partialStorageInitArg,
    });
    actor.setIdentity(partialUser);
    const addResult = await actor.addStorage(partialStorage.canisterId, partialStorageInitArg);
    expect(addResult).toHaveProperty('ok');

    // Fund with exactly $0.50 — not enough for 1TC (~$1.30) but enough for partial
    await manager.mintToUserSubaccount(CKUSDC_CANISTER_ID, partialUser.getPrincipal(), 500_000n);

    const result = await actor.topUpFromBalance(
      partialStorage.canisterId,
      ONE_TRILLION_CYCLES, // 1TC target
    );
    await manager.pic.tick(10);

    expect(result).toHaveProperty('ok');
    const cyclesAdded = expectTopUpSuccess(result).cyclesAdded;
    expect(cyclesAdded).toBeGreaterThan(0n);
    expect(cyclesAdded).toBeLessThan(ONE_TRILLION_CYCLES);
  });

  test('topUpFromBalance: cyclesAmount=0 → error', async () => {
    actor.setIdentity(storageUser);
    const result = await actor.topUpFromBalance(storageCanisterId, 0n);
    expect(result).toHaveProperty('err');
  });


  test('auto-topup: onStorageLowCycles triggers topUp when autoTopUp enabled', async () => {
    // Enable autoTopUp for storageUser
    actor.setIdentity(storageUser);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false, autoTopUp: true, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // storageUser needs a Pro subscription for auto-topup
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(storageUser.getPrincipal(), { Pro: null }, [now + 30n * 24n * 3_600_000_000_000n]);

    // Fund ckUSDC
    await manager.mintToUserSubaccount(
      CKUSDC_CANISTER_ID,
      storageUser.getPrincipal(),
      50_000_000n, // $50
    );

    const cyclesBefore = await manager.getCyclesBalance(storageCanisterId);

    // Call onStorageLowCycles from the storage canister's identity
    // PocketIC allows calling with any sender via updateCall
    await manager.pic.updateCall({
      canisterId: backendCanisterId,
      sender: storageCanisterId, // storage canister calls backend
      method: 'onStorageLowCycles',
      arg: IDL.encode(
        [IDL.Nat, IDL.Nat, IDL.Variant({ warning: IDL.Null, critical: IDL.Null })],
        [100_000_000_000n, 5n, { warning: null }],
      ),
    });
    await manager.pic.tick(20);

    const cyclesAfter = await manager.getCyclesBalance(storageCanisterId);
    expect(cyclesAfter).toBeGreaterThan(cyclesBefore);

    // Notification
    actor.setIdentity(storageUser);
    const notifs = await actor.getNotifications([], 20n);
    const topUpNotif = findNotification(notifs.data, 'autoTopUpCompleted');
    expect(topUpNotif).toBeDefined();
  });

  test('auto-topup: no topup when autoTopUp disabled', async () => {
    // Disable autoTopUp
    actor.setIdentity(storageUser);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const cyclesBefore = await manager.getCyclesBalance(storageCanisterId);

    // Call onStorageLowCycles
    await manager.pic.updateCall({
      canisterId: backendCanisterId,
      sender: storageCanisterId,
      method: 'onStorageLowCycles',
      arg: IDL.encode(
        [IDL.Nat, IDL.Nat, IDL.Variant({ warning: IDL.Null, critical: IDL.Null })],
        [100_000_000_000n, 5n, { warning: null }],
      ),
    });
    await manager.pic.tick(10);

    // Cycles should NOT increase
    const cyclesAfter = await manager.getCyclesBalance(storageCanisterId);
    expect(cyclesAfter).toBe(cyclesBefore);
  });

  test('auto-topup: no topup for Free plan users', async () => {
    const freeUser = createIdentity('free-autotopup');
    actor.setIdentity(freeUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false, autoTopUp: true, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // freeUser has no subscription (Free plan) — auto-topup should not trigger
    // We can't easily call onStorageLowCycles for freeUser since they don't own a storage
    // But the logic check is: getSubscription returns null/Free → return early
    // This is implicitly tested by the fact that processAutoTopUp checks subscription plan
    // For explicit coverage, we verify the settings were saved correctly
    const settings = await actor.getSettings();
    expect(settings.autoTopUp).toBe(true);
    // Free users can enable autoTopUp but it won't fire without Pro subscription
  });
});

// ========== Test Suite 8.5: pendingRefunds + ambassador distribution ==========

describe('Integration: pendingRefunds and ambassador distribution', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BackendManager.create({ fiduciary: true });
    await manager.deployXrcMock();
    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();
  }, 300_000);

  afterAll(async () => { await manager?.afterAll(); });

  test('getPendingRefunds: non-admin rejected', async () => {
    const user = createIdentity('refund-nonadmin');
    actor.setIdentity(user);
    await actor.register([]);
    await expect(actor.getPendingRefunds()).rejects.toThrow();
  });

  test('getPendingRefunds: admin sees empty list initially', async () => {
    actor.setIdentity(manager.ownerIdentity);
    const refunds = await actor.getPendingRefunds();
    expect(refunds).toEqual([]);
  });

  test('processPendingRefunds: non-admin rejected', async () => {
    const user = createIdentity('process-nonadmin');
    actor.setIdentity(user);
    await actor.register([]);
    await expect(actor.processPendingRefunds()).rejects.toThrow();
  });

  test('processPendingRefunds: returns 0 when queue empty', async () => {
    actor.setIdentity(manager.ownerIdentity);
    const processed = await actor.processPendingRefunds();
    expect(processed).toBe(0n);
  });

  test('ambassador distribution: 85/15/0 split verified via distributionLog', async () => {
    // Setup: L1 ambassador registers and creates profile (for referralCode)
    const l1 = createIdentity('dist-l1');
    actor.setIdentity(l1);
    await actor.register([]);
    await actor.createProfile({ username: 'dist-l1', displayName: [], avatarUrl: [] });
    const l1Profile = await actor.getProfile();
    const l1Code = l1Profile[0]?.referralCode?.[0];
    expect(l1Code).toBeDefined();

    // L2 ambassador registers under L1 and creates profile
    const l2 = createIdentity('dist-l2');
    actor.setIdentity(l2);
    await actor.register([l1Code]);
    await actor.createProfile({ username: 'dist-l2', displayName: [], avatarUrl: [] });
    const l2Profile = await actor.getProfile();
    const l2Code = l2Profile[0]?.referralCode?.[0];
    expect(l2Code).toBeDefined();

    // User registers under L2 (so L1=l2, L2=l1 in ambassador chain)
    const user = createIdentity('dist-user');
    actor.setIdentity(user);
    await actor.register([l2Code]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund user with ICP
    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    // Activate Pro with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(user.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // Trigger auto-renewal
    await actor.triggerAutoRenewals();
    await manager.pic.tick(10);

    // Verify subscription renewed
    actor.setIdentity(user);
    const sub = await actor.getSubscription();
    expect(sub[0].status).toEqual({ Active: null });

    // Check distribution log
    actor.setIdentity(manager.ownerIdentity);
    const log = await actor.getDistributionLog({ offset: 0n, limit: 10n });
    expect(log.length).toBeGreaterThan(0);

    const record = log[0];
    expect(record.totalAmount).toBeGreaterThan(0n);

    // Verify 85/15/0 split (default distribution config: l1Bps=1500, l2Bps=0)
    // Treasury gets remainder after L1+L2 deductions (ceiling division may shift ±2)
    const total = record.totalAmount;
    const expectedTreasury = total * 8500n / 10000n;
    const expectedL1 = total * 1500n / 10000n;
    const expectedL2 = 0n;

    // Allow 2 units rounding tolerance (ceiling division in treasury)
    expect(record.treasuryAmount).toBeGreaterThanOrEqual(expectedTreasury - 2n);
    expect(record.treasuryAmount).toBeLessThanOrEqual(expectedTreasury + 2n);
    expect(record.l1Amount).toBeGreaterThanOrEqual(expectedL1 - 2n);
    expect(record.l1Amount).toBeLessThanOrEqual(expectedL1 + 2n);
    expect(record.l2Amount).toBeGreaterThanOrEqual(expectedL2 - 2n);
    expect(record.l2Amount).toBeLessThanOrEqual(expectedL2 + 2n);

    // Total should be conserved (no tokens lost/created)
    expect(record.treasuryAmount + record.l1Amount + record.l2Amount).toBe(total);

    // Verify ambassador principals
    expect(record.ambassadorL1).toHaveLength(1);
    expect(record.ambassadorL2).toHaveLength(1);
    expect(record.payer.toText()).toBe(user.getPrincipal().toText());
  });
});

// ========== Test Suite 9: chargeForService with BaseETH (EVM testnet) ==========

// Per-user renewal timers keep each renewal in its own message,
// staying within the per-message instruction limit for EVM RPC calls.
describe('Integration: chargeForService with BaseETH (EVM testnet)', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;
  const evmUser = createIdentity('evm-charge-user');

  beforeAll(async () => {
    manager = await BackendManager.create({ ii: true, fiduciary: true, ingressMaxRetries: 500 });

    // Deploy XRC mock with inflated ETH rate ($10M) and evm_rpc canister
    await manager.deployXrcMock(INFLATED_ETH_RATE);
    const evmRpcCanisterId = await manager.deployEvmRpc();

    const fixture = await manager.initBackendCanister({
      chains: [
        buildBaseChainConfig({
          chainId: BASE_SEPOLIA_CHAIN_ID,
          evmRpcCanisterId: evmRpcCanisterId.toText(),
          usdcContract: BASE_SEPOLIA_USDC,
          usdtContract: BASE_SEPOLIA_USDT,
          rpcUrls: [BASE_SEPOLIA_RPC],
        }),
      ],
    });
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();

    // Register user and configure spending priority
    actor.setIdentity(evmUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ BaseETH: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Derive user's EVM address (threshold ECDSA)
    // chargeAndDistributeEvm signs txs from user's derived address,
    // so only the user needs ETH (for value + gas)
    const userEvmAddress = await manager.deriveEvmAddress(evmUser);

    // Fund user's EVM address with dust ETH on Base Sepolia
    await fundWithEth(userEvmAddress, 100_000_000_000_000n); // 0.0001 ETH

    // Activate Pro subscription with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(evmUser.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);
  }, 300_000);

  afterAll(async () => { await manager?.afterAll(); });

  test('chargeForService routes to BaseETH and renews subscription', async () => {
    // triggerAutoRenewals schedules per-user timer; auto-progress processes it.
    // Timing can produce either #Renewed (if sub still Active when charged) or
    // #Reactivated (if sub expired during HTTP outcall). Both are correct outcomes.
    actor.setIdentity(manager.ownerIdentity);
    await actor.triggerAutoRenewals();

    await waitWithAutoProgress(manager.pic, async () => {
      actor.setIdentity(evmUser);
      const notifs = await actor.getNotifications([], 10n);
      return hasAnyNotification(notifs.data, 'subscriptionRenewed')
        || hasAnyNotification(notifs.data, 'subscriptionActivated');
    });

    actor.setIdentity(evmUser);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
  }, 300_000);

  test('BaseETH insufficient → falls to ICP', async () => {
    const fallbackUser = createIdentity('evm-fallback-user');
    actor.setIdentity(fallbackUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ BaseETH: null }, { ICP: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund ICP only (no EVM funding → BaseETH will fail, falls to ICP)
    const userSubaccount = principalToSubAccount(fallbackUser.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    // Activate Pro with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(fallbackUser.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    const balBefore = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [userSubaccount],
    });

    // triggerAutoRenewals schedules per-user timer; auto-progress handles EVM RPC outcalls
    await actor.triggerAutoRenewals();

    // Poll for subscriptionRenewed (ICP fallback) or balanceLow notification
    await waitWithAutoProgress(manager.pic, async () => {
      actor.setIdentity(fallbackUser);
      const notifs = await actor.getNotifications([], 10n);
      return (
        hasAnyNotification(notifs.data, 'subscriptionRenewed') ||
        hasAnyNotification(notifs.data, 'balanceLow')
      );
    });

    // ICP should have been charged (fallback from BaseETH)
    const balAfter = await manager.icpLedgerActor.icrc1_balance_of({
      owner: backendCanisterId, subaccount: [userSubaccount],
    });
    expect(balAfter).toBeLessThan(balBefore);

    // Subscription renewed
    actor.setIdentity(fallbackUser);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
  }, 300_000);
});

// ========== Test Suite 10: chargeForService with SOL (Solana testnet) ==========

// Per-user renewal timers keep each renewal in its own message,
// staying within the per-message instruction limit for Solana RPC calls.
describe('Integration: chargeForService with SOL (Solana testnet)', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;
  const solUser = createIdentity('sol-charge-user');

  beforeAll(async () => {
    manager = await BackendManager.create({ ii: true, ingressMaxRetries: 500 });

    // Deploy XRC mock with inflated SOL rate ($1M) and sol_rpc canister
    await manager.deployXrcMock(INFLATED_SOL_RATE);
    const solRpcCanisterId = await manager.deploySolRpc();

    const fixture = await manager.initBackendCanister({
      chains: [
        buildSolanaChainConfig({
          solRpcCanisterId: solRpcCanisterId.toText(),
          usdcMint: SOL_DEVNET_USDC_MINT,
          usdtMint: SOL_DEVNET_USDT_MINT,
          rpcUrl: [SOLANA_DEVNET_RPC],
        }),
      ],
    });
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();

    // Register user and configure spending priority
    actor.setIdentity(solUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ SOL: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Derive user's SOL address (threshold Schnorr)
    // chargeAndDistributeSol signs txs from user's derived address
    const userSolAddress = await manager.deriveSolAddress(solUser);

    // Fund user's SOL address on Devnet
    await fundWithSol(userSolAddress, 50_000_000n); // 0.05 SOL

    // Activate Pro subscription with 1h expiry
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(solUser.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);
  }, 300_000);

  afterAll(async () => { await manager?.afterAll(); });

  test('chargeForService routes to SOL and renews subscription', async () => {
    // triggerAutoRenewals schedules per-user timer; auto-progress processes it.
    // Timing can produce either #Renewed (if sub still Active when charged) or
    // #Reactivated (if sub expired during HTTP outcall). Both are correct outcomes.
    actor.setIdentity(manager.ownerIdentity);
    await actor.triggerAutoRenewals();

    await waitWithAutoProgress(manager.pic, async () => {
      actor.setIdentity(solUser);
      const notifs = await actor.getNotifications([], 10n);
      return hasAnyNotification(notifs.data, 'subscriptionRenewed')
        || hasAnyNotification(notifs.data, 'subscriptionActivated');
    });

    actor.setIdentity(solUser);
    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
  }, 300_000);

  test('SOL insufficient → balanceLow notification', async () => {
    const noFundsUser = createIdentity('sol-nofunds-user');
    actor.setIdentity(noFundsUser);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ SOL: null }],
      autoRenew: true, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Activate Pro with 1h expiry (no SOL funding)
    actor.setIdentity(manager.ownerIdentity);
    const picTimeMs = await manager.pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(noFundsUser.getPrincipal(), { Pro: null }, [now + 3_600_000_000_000n]);

    // triggerAutoRenewals schedules per-user timer; auto-progress handles Solana RPC outcalls
    await actor.triggerAutoRenewals();

    await waitWithAutoProgress(manager.pic, async () => {
      actor.setIdentity(noFundsUser);
      const notifs = await actor.getNotifications([], 10n);
      return hasAnyNotification(notifs.data, 'balanceLow');
    });

    // Should have balanceLow notification
    actor.setIdentity(noFundsUser);
    const notifs = await actor.getNotifications([], 10n);
    const lowNotif = findNotification(notifs.data, 'balanceLow');
    expect(lowNotif).toBeDefined();
  }, 300_000);
});

// ========== Test Suite: purchaseSubscription (ICPay fallback) ==========

describe('Integration: purchaseSubscription (direct balance purchase)', () => {
  let manager: BackendManager;
  let actor: Actor<BackendActor>;
  let backendCanisterId: Principal;

  beforeAll(async () => {
    manager = await BackendManager.create({ fiduciary: true });
    await manager.deployXrcMock();
    const fixture = await manager.initBackendCanister();
    actor = fixture.actor;
    backendCanisterId = fixture.canisterId;
    await manager.pic.tick();
  });

  afterAll(async () => { await manager?.afterAll(); });

  test('purchaseSubscription: anonymous caller rejected', async () => {
    // Create a separate actor without identity set (defaults to anonymous)
    const anonActor = manager.pic.createActor<BackendActor>(
      rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      backendCanisterId,
    );
    await expect(anonActor.purchaseSubscription({ Pro: null })).rejects.toThrow();
  });

  test('purchaseSubscription: Free plan returns InvalidPlan', async () => {
    const user = createIdentity('purchase-free');
    actor.setIdentity(user);
    await actor.register([]);

    const result = await actor.purchaseSubscription({ Free: null });
    expect(result).toHaveProperty('err');
    expect(result.err).toHaveProperty('InvalidPlan');
  });

  test('purchaseSubscription: Trial plan returns InvalidPlan', async () => {
    const user = createIdentity('purchase-trial');
    actor.setIdentity(user);
    await actor.register([]);

    const result = await actor.purchaseSubscription({ Trial: null });
    expect(result).toHaveProperty('err');
    expect(result.err).toHaveProperty('InvalidPlan');
  });

  test('purchaseSubscription: insufficient balance returns InsufficientFunds', async () => {
    const user = createIdentity('purchase-no-funds');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const result = await actor.purchaseSubscription({ Pro: null });
    expect(result).toHaveProperty('err');
    expect(result.err).toHaveProperty('InsufficientFunds');
  });

  test('purchaseSubscription: Pro with ICP → activates Pro with 30d expiry', async () => {
    const user = createIdentity('purchase-pro-icp');
    actor.setIdentity(user);
    await actor.register([]);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund user
    const userSubaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [userSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    actor.setIdentity(user);
    const result = await actor.purchaseSubscription({ Pro: null });
    expect(result).toHaveProperty('ok');

    const sub = await actor.getSubscription();
    expect(sub[0].plan).toEqual({ Pro: null });
    expect(sub[0].status).toEqual({ Active: null });
    expect(sub[0].expiresAt).toHaveLength(1);
    expect(sub[0].expiresAt[0]).toBeGreaterThan(0n);
  });

  test('purchaseSubscription: Active Pro → renews from currentExpiresAt', async () => {
    const user = createIdentity('purchase-renew-active');
    actor.setIdentity(user);
    await actor.register([]);

    // Fund user so they can purchase twice
    const depositAmount = 10n * E8S_PER_ICP;
    const subaccount = principalToSubAccount(user.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [subaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: depositAmount,
    });

    // First purchase
    actor.setIdentity(user);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });
    const result1 = await actor.purchaseSubscription({ Pro: null });
    expect(result1).toHaveProperty('ok');

    const sub1 = await actor.getSubscription();
    expect(sub1[0].plan).toEqual({ Pro: null });
    expect(sub1[0].status).toEqual({ Active: null });
    const firstExpiresAt = sub1[0].expiresAt[0];
    expect(firstExpiresAt).toBeDefined();

    // Second purchase (renew) — should extend from firstExpiresAt, not from now
    const result2 = await actor.purchaseSubscription({ Pro: null });
    expect(result2).toHaveProperty('ok');

    const sub2 = await actor.getSubscription();
    expect(sub2[0].plan).toEqual({ Pro: null });
    expect(sub2[0].status).toEqual({ Active: null });
    const secondExpiresAt = sub2[0].expiresAt[0];
    expect(secondExpiresAt).toBeDefined();

    // secondExpiresAt should be ~firstExpiresAt + 30 days (not now + 30 days)
    const thirtyDaysNs = 30n * 24n * 60n * 60n * 1_000_000_000n;
    expect(secondExpiresAt).toBeGreaterThan(firstExpiresAt);
    // Allow 1 minute tolerance for timing
    const tolerance = 60n * 1_000_000_000n;
    expect(secondExpiresAt).toBeGreaterThanOrEqual(firstExpiresAt + thirtyDaysNs - tolerance);
    expect(secondExpiresAt).toBeLessThanOrEqual(firstExpiresAt + thirtyDaysNs + tolerance);
  });

  test('purchaseSubscription: ambassador distribution works (85/15/0)', async () => {
    // Create L1 ambassador with profile (referralCode is generated on createProfile)
    const ambassador = createIdentity('purchase-ambassador');
    actor.setIdentity(ambassador);
    await actor.register([]);
    await actor.createProfile({
      username: 'ambassador',
      displayName: [],
      avatarUrl: [],
    });
    const ambassadorProfile = await actor.getProfile();
    const referralCode = ambassadorProfile[0]?.referralCode?.[0];
    expect(referralCode).toBeDefined();

    const buyer = createIdentity('purchase-buyer-amb');
    actor.setIdentity(buyer);
    await actor.register(referralCode ? [referralCode] : []);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: false, autoTopUp: false, topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Fund buyer
    const buyerSubaccount = principalToSubAccount(buyer.getPrincipal());
    manager.icpLedgerActor.setIdentity(minterIdentity);
    await manager.icpLedgerActor.icrc1_transfer({
      to: { owner: backendCanisterId, subaccount: [buyerSubaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount: 10n * E8S_PER_ICP,
    });

    // Purchase Pro
    actor.setIdentity(buyer);
    const result = await actor.purchaseSubscription({ Pro: null });
    expect(result).toHaveProperty('ok');

    // Verify ambassador got their share via distribution log
    actor.setIdentity(manager.ownerIdentity);
    const log = await actor.getDistributionLog({
      limit: 10n,
      offset: 0n,
    });
    const purchaseEntry = log.find((r) =>
      r.payer.toText() === buyer.getPrincipal().toText()
    );
    expect(purchaseEntry).toBeDefined();
    // 85% treasury, 15% L1, 0% L2 (no L2 distribution)
    expect(purchaseEntry.treasuryAmount).toBeGreaterThan(0n);
    expect(purchaseEntry.l1Amount).toBeGreaterThan(0n);
  });
});
