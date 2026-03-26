import { type Actor, PocketIc } from "@dfinity/pic";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import {
  createPic,
  ownerIdentity,
  userAlice,
  userBob,
  userCharlie,
} from "./setup/helpers.ts";

describe("Users", () => {
  let pic: PocketIc;
  let actor: Actor<RabbitholeActorService>;

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test("register creates User without referral", async () => {
    actor.setIdentity(userAlice);
    await actor.register([]);

    const user = await actor.getUser();
    expect(user).toHaveLength(1);
    expect(user[0]!.id.toText()).toBe(userAlice.getPrincipal().toText());
    expect(user[0]!.inviter).toHaveLength(0);
  });

  test("register is idempotent", async () => {
    actor.setIdentity(userAlice);
    await actor.register([]);
    await actor.register([]); // second call should be noop
    const user = await actor.getUser();
    expect(user).toHaveLength(1);
  });

  test("register with referral code links inviter", async () => {
    // Owner creates profile (which generates referralCode)
    actor.setIdentity(ownerIdentity);
    await actor.register([]);
    await actor.createProfile({
      username: "owner",
      displayName: [],
      avatarUrl: [],
    });
    const ownerProfile = await actor.getProfile();
    const referralCode = ownerProfile[0]!.referralCode[0]!;

    // Alice registers with owner's referral code
    actor.setIdentity(userAlice);
    await actor.register([referralCode]);

    const user = await actor.getUser();
    expect(user[0]!.inviter).toHaveLength(1);
    expect(user[0]!.inviter[0]!.toText()).toBe(
      ownerIdentity.getPrincipal().toText(),
    );
  });

  test("register with invalid referral code creates user without inviter", async () => {
    actor.setIdentity(userAlice);
    await actor.register(["INVALID1"]);

    const user = await actor.getUser();
    expect(user).toHaveLength(1);
    expect(user[0]!.inviter).toHaveLength(0);
  });

  test("getUser returns empty when not registered", async () => {
    actor.setIdentity(userBob);
    const user = await actor.getUser();
    expect(user).toHaveLength(0);
  });

  test("profile has referralCode after creation", async () => {
    actor.setIdentity(userAlice);
    await actor.createProfile({
      username: "alice2",
      displayName: [],
      avatarUrl: [],
    });

    const profile = await actor.getProfile();
    expect(profile).toHaveLength(1);
    expect(profile[0]!.referralCode).toHaveLength(1);
    expect(profile[0]!.referralCode[0]).toHaveLength(8);
  });

  test("referralCode is unique per user", async () => {
    actor.setIdentity(userAlice);
    await actor.createProfile({
      username: "alice3",
      displayName: [],
      avatarUrl: [],
    });
    const profile1 = await actor.getProfile();

    actor.setIdentity(userBob);
    await actor.createProfile({
      username: "bob3",
      displayName: [],
      avatarUrl: [],
    });
    const profile2 = await actor.getProfile();

    expect(profile1[0]!.referralCode[0]).not.toBe(
      profile2[0]!.referralCode[0],
    );
  });

  test("getAmbassadorChainQuery returns L1 and L2", async () => {
    // Owner registers (no inviter — root ambassador)
    actor.setIdentity(ownerIdentity);
    await actor.register([]);
    await actor.createProfile({
      username: "owner",
      displayName: [],
      avatarUrl: [],
    });
    const ownerCode = (await actor.getProfile())[0]!.referralCode[0]!;

    // Alice registers with owner's referral code (L1 = owner)
    actor.setIdentity(userAlice);
    await actor.register([ownerCode]);
    await actor.createProfile({
      username: "alice",
      displayName: [],
      avatarUrl: [],
    });
    const aliceCode = (await actor.getProfile())[0]!.referralCode[0]!;

    // Bob registers with Alice's referral code (L1 = alice, L2 = owner)
    actor.setIdentity(userBob);
    await actor.register([aliceCode]);

    const chain = await actor.getAmbassadorChainQuery();
    expect(chain.l1).toHaveLength(1);
    expect(chain.l1[0]!.toText()).toBe(userAlice.getPrincipal().toText());
    expect(chain.l2).toHaveLength(1);
    expect(chain.l2[0]!.toText()).toBe(ownerIdentity.getPrincipal().toText());
  });

  test("getAmbassadorChainQuery returns empty for user without inviter", async () => {
    actor.setIdentity(userAlice);
    await actor.register([]);

    const chain = await actor.getAmbassadorChainQuery();
    expect(chain.l1).toHaveLength(0);
    expect(chain.l2).toHaveLength(0);
  });
});
