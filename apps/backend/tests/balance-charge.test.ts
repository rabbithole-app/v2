import { type CanisterFixture, createIdentity, PocketIc } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';

import { ONE_TRILLION_CYCLES } from './setup/constants.ts';
import { createPic, ownerIdentity, userAlice } from './setup/helpers.ts';

describe('Balance & Charge', () => {
  let pic: PocketIc;
  let actor: CanisterFixture<RabbitholeActorService>['actor'];

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test('getMyWalletAddresses: returns deterministic IC subaccount', async () => {
    actor.setIdentity(userAlice);
    const addresses = await actor.getMyWalletAddresses();

    expect(addresses.icSubaccount).toBeDefined();
    expect(addresses.icSubaccount.length).toBe(32);

    const addresses2 = await actor.getMyWalletAddresses();
    expect(addresses.icSubaccount).toEqual(addresses2.icSubaccount);
  });

  test('getMyWalletAddresses: different users get different subaccounts', async () => {
    actor.setIdentity(userAlice);
    const aliceAddresses = await actor.getMyWalletAddresses();

    const userBob = createIdentity('bob-wallet');
    actor.setIdentity(userBob);
    const bobAddresses = await actor.getMyWalletAddresses();

    expect(aliceAddresses.icSubaccount).not.toEqual(bobAddresses.icSubaccount);
  });

  test('getMyWalletAddresses: EVM/SOL null before derivation', async () => {
    actor.setIdentity(userAlice);
    const addresses = await actor.getMyWalletAddresses();

    expect(addresses.evmAddress).toEqual([]);
    expect(addresses.solAddress).toEqual([]);
  });

  test('getMyWalletAddresses: anonymous caller rejected', async () => {
    await expect(actor.getMyWalletAddresses()).rejects.toThrow();
  });

  test('topUpFromBalance: anonymous caller rejected', async () => {
    await expect(
      actor.topUpFromBalance(
        userAlice.getPrincipal(),
        ONE_TRILLION_CYCLES,
      ),
    ).rejects.toThrow();
  });

  test('topUpFromBalance: non-owner canister returns error', async () => {
    actor.setIdentity(userAlice);
    const fakeCanisterId = userAlice.getPrincipal();
    const result = await actor.topUpFromBalance(fakeCanisterId, ONE_TRILLION_CYCLES);
    expect(result).toEqual({ err: 'You do not own this canister' });
  });

  test('topUpFromBalance: cyclesAmount=0 returns error early', async () => {
    actor.setIdentity(userAlice);
    const result = await actor.topUpFromBalance(
      userAlice.getPrincipal(),
      0n,
    );
    expect(result).toEqual({ err: 'Cycles amount must be greater than zero' });
  });

  test('triggerAutoRenewals: non-admin rejected', async () => {
    actor.setIdentity(userAlice);
    await expect(actor.triggerAutoRenewals()).rejects.toThrow();
  });

  test('adminRegisterWasmHash: non-admin rejected', async () => {
    actor.setIdentity(userAlice);
    const fakeHash = new Uint8Array(32);
    await expect(actor.adminRegisterWasmHash(fakeHash, 'test')).rejects.toThrow();
  });

  test('adminRebuildKnownWasmHashesFromDownloadedReleases: removes stale manual hashes', async () => {
    actor.setIdentity(ownerIdentity);
    const staleHash = Uint8Array.from({ length: 32 }, (_, index) => index);

    await actor.adminRegisterWasmHash(staleHash, 'storage-v0.0.0/encrypted-storage.wasm.gz');
    await expect(actor.isKnownWasmHash(staleHash)).resolves.toBe(true);

    const rebuiltCount =
      await actor.adminRebuildKnownWasmHashesFromDownloadedReleases();

    expect(rebuiltCount).toBe(0n);
    await expect(actor.isKnownWasmHash(staleHash)).resolves.toBe(false);
  });
});
