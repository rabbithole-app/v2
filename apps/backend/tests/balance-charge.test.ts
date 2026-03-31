import { type CanisterFixture, PocketIc, createIdentity } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';
import { createPic, ownerIdentity, userAlice } from './setup/helpers.ts';

// NOTE: Balance charge tests require multi-canister setup with:
// 1. ICP ledger canister
// 2. Treasury library integrated in backend
// 3. Funded user subaccounts
//
// Current tests verify the API surface and settings integration.
// Full charge flow is tested in treasury-charge.test.ts (treasury library level).

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
    expect(addresses.icSubaccount.length).toBe(32); // 32-byte subaccount

    // Same user gets same subaccount
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

    // Without EVM/SOL config, addresses are null
    expect(addresses.evmAddress).toEqual([]);
    expect(addresses.solAddress).toEqual([]);
  });

  test('getMyWalletAddresses: anonymous caller rejected', async () => {
    await expect(actor.getMyWalletAddresses()).rejects.toThrow();
  });

  test('topUpFromBalance: not implemented yet returns error', async () => {
    actor.setIdentity(userAlice);
    const result = await actor.topUpFromBalance(
      userAlice.getPrincipal(), // canisterId
      1_000_000_000_000n,      // 1T cycles
    );
    expect(result).toHaveProperty('err');
  });

  // TODO: Full balance-charge integration tests (require multi-canister setup):
  // - chargeForService: stablecoin first by default priority
  // - chargeForService: fallback to ICP at CMC rate
  // - chargeForService: insufficient all → #insufficientFunds
  // - chargeForService: custom priority [#ICP, #ckUSDC] → ICP first
  // - chargeForService: ambassador splits in chargeAndDistribute args
  // - chargeForService: single token only ($5+$5 < $9.9 → insufficient)
});
