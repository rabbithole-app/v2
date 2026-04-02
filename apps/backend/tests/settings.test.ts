import { type CanisterFixture, createIdentity, PocketIc } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';

import { ONE_TRILLION_CYCLES } from './setup/constants.ts';
import { createPic, userAlice } from './setup/helpers.ts';

describe('UserSettings', () => {
  let pic: PocketIc;
  let actor: CanisterFixture<RabbitholeActorService>['actor'];

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test('getSettings: returns defaults for new user', async () => {
    actor.setIdentity(userAlice);
    const settings = await actor.getSettings();

    expect(settings.autoRenew).toBe(false);
    expect(settings.autoTopUp).toBe(false);
    expect(settings.topUpAmountCycles).toBe(ONE_TRILLION_CYCLES);
    expect(settings.spendingPriority).toHaveLength(10);
    expect(settings.spendingPriority[0]).toEqual({ ckUSDC: null });
  });

  test('updateSettings: custom spendingPriority persists', async () => {
    actor.setIdentity(userAlice);

    const customPriority = [
      { ICP: null },
      { ckUSDC: null },
      { ckUSDT: null },
    ];

    await actor.updateSettings({
      spendingPriority: customPriority,
      autoRenew: false,
      autoTopUp: false,
      topUpAmountCycles: ONE_TRILLION_CYCLES,
    });

    const settings = await actor.getSettings();
    expect(settings.spendingPriority).toEqual(customPriority);
  });

  test('updateSettings: autoRenew toggle', async () => {
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

  test('updateSettings: autoTopUp and topUpAmountCycles', async () => {
    actor.setIdentity(userAlice);

    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false,
      autoTopUp: true,
      topUpAmountCycles: 2_000_000_000_000n, // 2TC
    });

    const settings = await actor.getSettings();
    expect(settings.autoTopUp).toBe(true);
    expect(settings.topUpAmountCycles).toBe(2_000_000_000_000n);
  });

  test('updateSettings: anonymous caller rejected', async () => {
    await expect(
      actor.updateSettings({
        spendingPriority: [{ ICP: null }],
        autoRenew: false,
        autoTopUp: false,
        topUpAmountCycles: ONE_TRILLION_CYCLES,
      }),
    ).rejects.toThrow();
  });

  test('updateSettings: duplicate tokens in priority rejected', async () => {
    actor.setIdentity(userAlice);

    await expect(
      actor.updateSettings({
        spendingPriority: [{ ICP: null }, { ICP: null }],
        autoRenew: false,
        autoTopUp: false,
        topUpAmountCycles: ONE_TRILLION_CYCLES,
      }),
    ).rejects.toThrow();
  });

  test('updateSettings: empty priority rejected', async () => {
    actor.setIdentity(userAlice);

    await expect(
      actor.updateSettings({
        spendingPriority: [],
        autoRenew: false,
        autoTopUp: false,
        topUpAmountCycles: ONE_TRILLION_CYCLES,
      }),
    ).rejects.toThrow();
  });

  test('settings are per-user', async () => {
    const userBob = createIdentity('bob-settings');

    actor.setIdentity(userAlice);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true,
      autoTopUp: true,
      topUpAmountCycles: 5_000_000_000_000n,
    });

    actor.setIdentity(userBob);
    const bobSettings = await actor.getSettings();
    expect(bobSettings.autoRenew).toBe(false);
    expect(bobSettings.autoTopUp).toBe(false);
    expect(bobSettings.topUpAmountCycles).toBe(ONE_TRILLION_CYCLES);
    expect(bobSettings.spendingPriority).toHaveLength(10);
  });

  test('updateSettings: topUpAmountCycles below minimum rejected', async () => {
    actor.setIdentity(userAlice);

    await expect(
      actor.updateSettings({
        spendingPriority: [{ ckUSDC: null }],
        autoRenew: false,
        autoTopUp: false,
        topUpAmountCycles: 50_000_000_000n, // 50B — below 100B minimum
      }),
    ).rejects.toThrow();
  });

  test('updateSettings: topUpAmountCycles=0 allowed (means disabled)', async () => {
    actor.setIdentity(userAlice);

    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: false,
      autoTopUp: false,
      topUpAmountCycles: 0n,
    });

    const settings = await actor.getSettings();
    expect(settings.topUpAmountCycles).toBe(0n);
  });

  test('updateSettings: spendingPriority max 10 items', async () => {
    actor.setIdentity(userAlice);

    // 11 items — should reject
    await expect(
      actor.updateSettings({
        spendingPriority: [
          { ckUSDC: null }, { ckUSDT: null }, { ckETH: null }, { ICP: null },
          { BaseUSDC: null }, { BaseUSDT: null }, { BaseETH: null },
          { SolUSDC: null }, { SolUSDT: null }, { SOL: null },
          { ckUSDC: null }, // 11th — duplicate but also over limit
        ],
        autoRenew: false,
        autoTopUp: false,
        topUpAmountCycles: ONE_TRILLION_CYCLES,
      }),
    ).rejects.toThrow();
  });
});
