import { type CanisterFixture, PocketIc, createIdentity } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';
import { createPic, ownerIdentity, userAlice } from './setup/helpers.ts';

// NOTE: Auto-renew tests require multi-canister setup with:
// 1. ICP ledger (for balance checks and chargeAndDistribute)
// 2. Treasury library integrated in backend
// 3. Time advancement via PocketIC
//
// Current tests verify the subscription + settings integration.
// Full charge flow tests require treasury + ledger canister setup.

describe('Auto-renew', () => {
  let pic: PocketIc;
  let actor: CanisterFixture<RabbitholeActorService>['actor'];

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

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
    });

    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(true);
  });

  test('subscription + autoRenew settings are independent', async () => {
    actor.setIdentity(userAlice);

    // Activate trial
    await actor.activateTrial();
    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(1);
    expect(sub[0]?.plan).toEqual({ Trial: null });

    // autoRenew is in settings, not subscription
    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(false);

    // Enable autoRenew
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true,
    });

    // Subscription unchanged
    const sub2 = await actor.getSubscription();
    expect(sub2[0]?.plan).toEqual({ Trial: null });

    // Settings updated
    const settings2 = await actor.getSettings();
    expect(settings2.autoRenew).toBe(true);
  });

  // TODO: Full auto-renew integration tests (require multi-canister setup):
  // - success: Pro expiring, autoRenew=true, sufficient balance → renewed +30d
  // - insufficient funds: notify #balanceLow, no downgrade (grace period)
  // - autoRenew disabled: skip charge attempt
  // - grace period: 3 days after expiry → downgrade to #Free
  // - stablecoin priority: ckUSDC+ICP, priority [#ckUSDC, #ICP] → ckUSDC first
  // - error boundary: trap one user doesn't kill batch
});
