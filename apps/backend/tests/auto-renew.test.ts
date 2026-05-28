import { type CanisterFixture, PocketIc } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';

import { ONE_TRILLION_CYCLES } from './setup/constants.ts';
import { createPic, ownerIdentity, userAlice } from './setup/helpers.ts';

describe('Auto-renew & Auto-topup settings', () => {
  let pic: PocketIc;
  let actor: CanisterFixture<RabbitholeActorService>['actor'];

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  // ---- autoRenew ----

  test('autoRenew disabled by default', async () => {
    actor.setIdentity(userAlice);
    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(false);
  });

  test('user can enable autoRenew', async () => {
    actor.setIdentity(userAlice);

    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: true,
      autoTopUp: false,
      topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(true);
  });

  test('subscription + autoRenew settings are independent', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    actor.setIdentity(ownerIdentity);
    await actor.activateSubscription(userAlice.getPrincipal(), { Pro: null }, []);

    actor.setIdentity(userAlice);
    const sub = await actor.getSubscription();
    expect(sub[0]?.plan).toEqual({ Pro: null });

    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(false);

    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true,
      autoTopUp: false,
      topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    // Subscription unchanged
    const sub2 = await actor.getSubscription();
    expect(sub2[0]?.plan).toEqual({ Pro: null });

    // Settings updated
    const settings2 = await actor.getSettings();
    expect(settings2.autoRenew).toBe(true);
  });

  // ---- autoTopUp ----

  test('autoTopUp disabled by default', async () => {
    actor.setIdentity(userAlice);
    const settings = await actor.getSettings();
    expect(settings.autoTopUp).toBe(false);
  });

  test('topUpAmountCycles defaults to 1TC', async () => {
    actor.setIdentity(userAlice);
    const settings = await actor.getSettings();
    expect(settings.topUpAmountCycles).toBe(ONE_TRILLION_CYCLES);
  });

  test('user can enable autoTopUp independently from autoRenew', async () => {
    actor.setIdentity(userAlice);

    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false,
      autoTopUp: true,
      topUpAmountCycles: 2_000_000_000_000n,
    });

    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(false);
    expect(settings.autoTopUp).toBe(true);
    expect(settings.topUpAmountCycles).toBe(2_000_000_000_000n);
  });

  test('autoRenew=true + autoTopUp=true both persist', async () => {
    actor.setIdentity(userAlice);

    await actor.updateSettings({
      spendingPriority: [{ ICP: null }, { ckUSDC: null }],
      autoRenew: true,
      autoTopUp: true,
      topUpAmountCycles: 5_000_000_000_000n,
    });

    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(true);
    expect(settings.autoTopUp).toBe(true);
    expect(settings.topUpAmountCycles).toBe(5_000_000_000_000n);
    expect(settings.spendingPriority[0]).toEqual({ ICP: null });
  });

  // ---- autoRenew: skip when disabled ----

  test('triggerAutoRenewals skips user with autoRenew=false', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    // autoRenew stays default (false)
    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(false);

    // Admin activates Pro with 1h expiry
    actor.setIdentity(ownerIdentity);
    const picTimeMs = await pic.getTime();
    const now = BigInt(picTimeMs) * 1_000_000n;
    await actor.activateSubscription(
      userAlice.getPrincipal(),
      { Pro: null },
      [now + 3_600_000_000_000n],
    );

    // Trigger — should not attempt charge (no notifications)
    await actor.triggerAutoRenewals();
    await pic.tick(5);

    // No renewal notification (autoRenew disabled)
    actor.setIdentity(userAlice);
    const notifs = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    const renewNotif = notifs.data.find((n: any) =>
      'subscriptionRenewed' in n.payload || 'balanceLow' in n.payload || 'autoRenewFailed' in n.payload,
    );
    expect(renewNotif).toBeUndefined();
  });

  // ---- Only paid Pro subscriptions have auto-renew ----

  test('triggerAutoRenewals skips users without Pro subscription', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: true,
      autoTopUp: false,
      topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    actor.setIdentity(ownerIdentity);
    await actor.triggerAutoRenewals();
    await pic.tick(5);

    // No renewal notification (no paid Pro subscription to renew)
    actor.setIdentity(userAlice);
    const notifs = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    const renewNotif = notifs.data.find((n: any) =>
      'subscriptionRenewed' in n.payload || 'balanceLow' in n.payload,
    );
    expect(renewNotif).toBeUndefined();
  });
});
