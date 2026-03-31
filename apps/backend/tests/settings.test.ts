import { type CanisterFixture, PocketIc, createIdentity } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';
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
    expect(settings.spendingPriority).toHaveLength(9);
    // Default order: ckUSDC first
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
    });

    const settings = await actor.getSettings();
    expect(settings.spendingPriority).toEqual(customPriority);
  });

  test('updateSettings: autoRenew toggle', async () => {
    actor.setIdentity(userAlice);

    await actor.updateSettings({
      spendingPriority: [{ ckUSDC: null }],
      autoRenew: true,
    });

    const settings = await actor.getSettings();
    expect(settings.autoRenew).toBe(true);
  });

  test('updateSettings: anonymous caller rejected', async () => {
    await expect(
      actor.updateSettings({
        spendingPriority: [{ ICP: null }],
        autoRenew: false,
      }),
    ).rejects.toThrow();
  });

  test('updateSettings: duplicate tokens in priority rejected', async () => {
    actor.setIdentity(userAlice);

    await expect(
      actor.updateSettings({
        spendingPriority: [{ ICP: null }, { ICP: null }],
        autoRenew: false,
      }),
    ).rejects.toThrow();
  });

  test('updateSettings: empty priority rejected', async () => {
    actor.setIdentity(userAlice);

    await expect(
      actor.updateSettings({
        spendingPriority: [],
        autoRenew: false,
      }),
    ).rejects.toThrow();
  });

  test('settings are per-user', async () => {
    const userBob = createIdentity('bob-settings');

    actor.setIdentity(userAlice);
    await actor.updateSettings({
      spendingPriority: [{ ICP: null }],
      autoRenew: true,
    });

    actor.setIdentity(userBob);
    const bobSettings = await actor.getSettings();
    // Bob still has defaults
    expect(bobSettings.autoRenew).toBe(false);
    expect(bobSettings.spendingPriority).toHaveLength(9);
  });
});
