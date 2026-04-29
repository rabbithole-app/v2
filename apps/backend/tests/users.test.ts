import { type Actor } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { type RabbitholeActorService } from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager.ts";
import {
  userAlice,
  userBob,
  userCharlie,
} from "./setup/helpers.ts";
import {
  IdentityAttributesSyncResult,
  InternetIdentityManager,
} from "./setup/internet-identity.ts";

function expectSingle<T>(items: readonly T[], label: string): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) {
    throw new Error(`Expected ${label}`);
  }
  return item;
}

describe("Users", () => {
  let actor: Actor<RabbitholeActorService>;
  let internetIdentity: InternetIdentityManager;
  let manager: BackendManager;

  beforeEach(async () => {
    manager = await BackendManager.create();
    internetIdentity = new InternetIdentityManager(manager.pic);
    ({ actor } = await manager.initBackendCanister());
  });

  afterEach(async () => {
    await manager?.afterAll();
  });

  test("ensureUser creates User without referral, defaults to role=user", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    const user = expectSingle(await actor.getUser(), "ensured user");
    expect(user.id.toText()).toBe(userAlice.getPrincipal().toText());
    expect(user.inviter).toHaveLength(0);
    expect(user.role).toEqual({ user: null });
  });

  test("ensureUser creates User without verified identity attributes", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser(["internet_identity"]);

    const user = expectSingle(await actor.getUser(), "ensured user");
    expect(user.id.toText()).toBe(userAlice.getPrincipal().toText());
    expect(user.authProvider).toEqual(["internet_identity"]);
    expect(user.lastLoginAt).toHaveLength(1);
    expect(user.email).toHaveLength(0);
    expect(user.name).toHaveLength(0);
    expect(user.verifiedEmail).toHaveLength(0);
    expect(user.profileSyncedAt).toHaveLength(0);
  });

  test("syncIdentityAttributes rejects calls without sender_info", async () => {
    actor.setIdentity(userAlice);
    const nonce = await actor.attributeNonceBegin();

    const result = await actor.syncIdentityAttributes(nonce);
    expect(result).toEqual({ err: { untrustedSigner: null } });

    const user = await actor.getUser();
    expect(user).toHaveLength(0);
  });

  test("syncIdentityAttributes stores II caller_info name and email", async () => {
    await internetIdentity.deploy();
    const identityNumber = await internetIdentity.createGoogleOpenIdIdentity();
    const user = userCharlie.getPrincipal();

    actor.setIdentity(userCharlie);
    const nonce = await actor.attributeNonceBegin();
    const attributes = await internetIdentity.getGoogleSignedAttributes(identityNumber, nonce);
    expect(attributes.signature.length).toBeGreaterThan(0);

    const response = await internetIdentity.updateCallWithSenderInfo({
      arg: IDL.encode([IDL.Vec(IDL.Nat8)], [nonce]),
      canisterId: manager.backendCanisterId,
      method: "syncIdentityAttributes",
      sender: user,
      senderInfo: internetIdentity.senderInfo(attributes),
    });
    const [result] = IDL.decode([IdentityAttributesSyncResult], response);
    expect(result).toEqual({ ok: null });

    actor.setIdentity(userCharlie);
    const storedUser = expectSingle(await actor.getUser(), "synced user");
    expect(storedUser.id.toText()).toBe(user.toText());
    expect(storedUser.email).toEqual(["andri.schatz@dfinity.org"]);
    expect(storedUser.name).toEqual(["Andri Schatz"]);
    expect(storedUser.authProvider).toEqual(["google"]);
    expect(storedUser.lastLoginAt).toHaveLength(1);
    expect(storedUser.profileSyncedAt).toHaveLength(1);
  });

  test("installer is bootstrapped with role=admin", async () => {
    actor.setIdentity(manager.ownerIdentity);
    const user = expectSingle(await actor.getUser(), "installer user");
    expect(user.role).toEqual({ admin: null });
  });

  test("ensureUser is idempotent", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.ensureUser([]);

    const user = await actor.getUser();
    expect(user).toHaveLength(1);
  });

  test("applyReferralCode links existing user to inviter", async () => {
    actor.setIdentity(manager.ownerIdentity);
    await actor.ensureUser([]);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "owner",
    });
    const ownerProfile = expectSingle(await actor.getProfile(), "owner profile");
    const referralCode = expectSingle(ownerProfile.referralCode, "owner referral code");

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    const result = await actor.applyReferralCode(referralCode);
    expect(result).toEqual({ ok: null });

    const user = expectSingle(await actor.getUser(), "referred user");
    const inviter = expectSingle(user.inviter, "user inviter");
    expect(inviter.toText()).toBe(
      manager.ownerIdentity.getPrincipal().toText(),
    );
    expect(user.referralAppliedAt).toHaveLength(1);
  });

  test("applyReferralCode rejects invalid referral code without changing user", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    const result = await actor.applyReferralCode("INVALID1");
    expect(result).toEqual({ referralCodeNotFound: null });

    const user = expectSingle(await actor.getUser(), "user without inviter");
    expect(user.inviter).toHaveLength(0);
    expect(user.referralAppliedAt).toHaveLength(0);
  });

  test("applyReferralCode requires existing user", async () => {
    actor.setIdentity(manager.ownerIdentity);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "owner-no-user",
    });
    const ownerProfile = expectSingle(await actor.getProfile(), "owner profile");
    const referralCode = expectSingle(ownerProfile.referralCode, "owner referral code");

    actor.setIdentity(userAlice);
    const result = await actor.applyReferralCode(referralCode);
    expect(result).toEqual({ userNotFound: null });
  });

  test("applyReferralCode rejects self-referral and is idempotent", async () => {
    actor.setIdentity(manager.ownerIdentity);
    await actor.ensureUser([]);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "owner-self",
    });
    const ownerProfile = expectSingle(await actor.getProfile(), "owner profile");
    const ownerCode = expectSingle(ownerProfile.referralCode, "owner referral code");
    expect(await actor.applyReferralCode(ownerCode)).toEqual({ selfReferral: null });

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(ownerCode)).toEqual({ ok: null });
    expect(await actor.applyReferralCode(ownerCode)).toEqual({ alreadyApplied: null });
  });

  test("getUser returns empty when not registered", async () => {
    actor.setIdentity(userBob);
    const user = await actor.getUser();
    expect(user).toHaveLength(0);
  });

  test("profile has referralCode after creation", async () => {
    actor.setIdentity(userAlice);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "alice2",
    });

    const profile = expectSingle(await actor.getProfile(), "profile");
    const referralCode = expectSingle(profile.referralCode, "profile referral code");
    expect(referralCode).toHaveLength(8);
  });

  test("referralCode is unique per user", async () => {
    actor.setIdentity(userAlice);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "alice3",
    });
    const profile1 = expectSingle(await actor.getProfile(), "alice profile");

    actor.setIdentity(userBob);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "bob3",
    });
    const profile2 = expectSingle(await actor.getProfile(), "bob profile");

    expect(expectSingle(profile1.referralCode, "alice referral code")).not.toBe(
      expectSingle(profile2.referralCode, "bob referral code"),
    );
  });

  test("getAmbassadorChainQuery returns L1 and L2", async () => {
    actor.setIdentity(manager.ownerIdentity);
    await actor.ensureUser([]);
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "owner",
    });
    const ownerProfile = expectSingle(await actor.getProfile(), "owner profile");
    const ownerCode = expectSingle(ownerProfile.referralCode, "owner referral code");

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(ownerCode)).toEqual({ ok: null });
    await actor.createProfile({
      avatarUrl: [],
      displayName: [],
      username: "alice",
    });
    const aliceProfile = expectSingle(await actor.getProfile(), "alice profile");
    const aliceCode = expectSingle(aliceProfile.referralCode, "alice referral code");

    actor.setIdentity(userBob);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(aliceCode)).toEqual({ ok: null });

    const chain = await actor.getAmbassadorChainQuery();
    expect(expectSingle(chain.l1, "L1 ambassador").toText()).toBe(
      userAlice.getPrincipal().toText(),
    );
    expect(expectSingle(chain.l2, "L2 ambassador").toText()).toBe(
      manager.ownerIdentity.getPrincipal().toText(),
    );
  });

  test("getAmbassadorChainQuery returns empty for user without inviter", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    const chain = await actor.getAmbassadorChainQuery();
    expect(chain.l1).toHaveLength(0);
    expect(chain.l2).toHaveLength(0);
  });
});
