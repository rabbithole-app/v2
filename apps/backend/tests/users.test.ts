import { type Actor, createIdentity } from "@dfinity/pic";
import { faker } from "@faker-js/faker";
import type { Identity } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { addDays, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  type CreateProfileArgs,
  type RabbitholeActorService,
} from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager.ts";
import { userAlice, userBob, userCharlie } from "./setup/helpers.ts";
import {
  IdentityAttributesFinishResult,
  InternetIdentityManager,
} from "./setup/internet-identity.ts";

function createProfileFixture(index: number): {
  args: CreateProfileArgs;
  identity: Identity;
} {
  return {
    identity: createIdentity(`profile-${index}`),
    args: {
      username: `profile${index}${faker.string.alphanumeric(6).toLowerCase()}`,
      displayName: index % 2 === 0 ? [`Profile User ${index}`] : [],
    },
  };
}

function createRandomProfileUser(): {
  args: CreateProfileArgs;
  identity: Identity;
} {
  const identity = createIdentity(faker.string.uuid());
  const hasDisplayName = faker.datatype.boolean();

  return {
    identity,
    args: {
      username: faker.internet.username().substring(0, 20),
      displayName: hasDisplayName ? [faker.person.fullName()] : [],
    },
  };
}

function expectSingle<T>(items: readonly T[], label: string): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) {
    throw new Error(`Expected ${label}`);
  }
  return item;
}

const PROFILE_USERS = Array.from({ length: 10 }, (_, index) =>
  createProfileFixture(index),
);

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
    expect(user.identity.provider).toEqual(["internet_identity"]);
    expect(user.lastLoginAt).toHaveLength(1);
    expect(user.identity.email).toHaveLength(0);
    expect(user.identity.name).toHaveLength(0);
    expect(user.identity.verifiedEmail).toHaveLength(0);
    expect(user.identity.syncedAt).toHaveLength(0);
  });

  test("_internet_identity_sign_in_finish rejects calls without sender_info", async () => {
    actor.setIdentity(userAlice);
    await actor._internet_identity_sign_in_start();

    const result = await actor._internet_identity_sign_in_finish();
    expect(result).toEqual({ err: { NoAttributes: null } });

    const user = await actor.getUser();
    expect(user).toHaveLength(0);
  });

  test("identity attribute callbacks store II caller_info name and email", async () => {
    await internetIdentity.deploy();
    const identityNumber = await internetIdentity.createGoogleOpenIdIdentity();
    const user = userCharlie.getPrincipal();

    actor.setIdentity(userCharlie);
    const nonce = await actor._internet_identity_sign_in_start();
    const attributes = await internetIdentity.getGoogleSignedAttributes(
      identityNumber,
      nonce,
    );
    expect(attributes.signature.length).toBeGreaterThan(0);

    const response = await internetIdentity.updateCallWithSenderInfo({
      arg: IDL.encode([], []),
      canisterId: manager.backendCanisterId,
      method: "_internet_identity_sign_in_finish",
      sender: user,
      senderInfo: internetIdentity.senderInfo(attributes),
    });
    const [finishResult] = IDL.decode([IdentityAttributesFinishResult], response);
    expect(finishResult).toEqual({ ok: null });

    actor.setIdentity(userCharlie);
    const claimResult = await actor.claimVerifiedEmailAccess();
    expect(claimResult).toEqual({ ok: null });

    const storedUser = expectSingle(await actor.getUser(), "synced user");
    expect(storedUser.id.toText()).toBe(user.toText());
    expect(storedUser.identity.email).toEqual(["andri.schatz@dfinity.org"]);
    expect(storedUser.identity.name).toEqual(["Andri Schatz"]);
    expect(storedUser.identity.provider).toEqual(["openid"]);
    expect(storedUser.identity.verifiedEmail).toEqual([true]);
    expect(storedUser.lastLoginAt).toHaveLength(1);
    expect(storedUser.identity.syncedAt).toHaveLength(1);

    const bareEmailResults = await actor.searchUserDirectory(
      "andri.schatz@dfinity.org",
      10n,
    );

    expect(bareEmailResults).toHaveLength(1);
    expect(bareEmailResults[0].id.toText()).toBe(user.toText());
    expect(bareEmailResults[0].match).toEqual({ emailExact: null });
    expect(bareEmailResults[0].profile).toHaveLength(0);

    await actor.createProfile({
      username: "andri-schatz",
      displayName: ["Andri Schatz"],
    });

    const profileEmailResults = await actor.searchUserDirectory(
      "andri.schatz@dfinity.org",
      10n,
    );

    expect(profileEmailResults).toHaveLength(1);
    expect(profileEmailResults[0].id.toText()).toBe(user.toText());
    expect(profileEmailResults[0].match).toEqual({ emailExact: null });
    expect(profileEmailResults[0].profile[0]?.username).toBe("andri-schatz");
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
      displayName: [],
      username: "owner",
    });
    const ownerProfile = expectSingle(
      await actor.getProfile(),
      "owner profile",
    );
    const referralCode = expectSingle(
      ownerProfile.referralCode,
      "owner referral code",
    );

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
      displayName: [],
      username: "owner-no-user",
    });
    const ownerProfile = expectSingle(
      await actor.getProfile(),
      "owner profile",
    );
    const referralCode = expectSingle(
      ownerProfile.referralCode,
      "owner referral code",
    );

    actor.setIdentity(userAlice);
    const result = await actor.applyReferralCode(referralCode);
    expect(result).toEqual({ userNotFound: null });
  });

  test("applyReferralCode rejects self-referral and is idempotent", async () => {
    actor.setIdentity(manager.ownerIdentity);
    await actor.ensureUser([]);
    await actor.createProfile({
      displayName: [],
      username: "owner-self",
    });
    const ownerProfile = expectSingle(
      await actor.getProfile(),
      "owner profile",
    );
    const ownerCode = expectSingle(
      ownerProfile.referralCode,
      "owner referral code",
    );
    expect(await actor.applyReferralCode(ownerCode)).toEqual({
      selfReferral: null,
    });

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(ownerCode)).toEqual({ ok: null });
    expect(await actor.applyReferralCode(ownerCode)).toEqual({
      alreadyApplied: null,
    });
  });

  test("getUser returns empty when not registered", async () => {
    actor.setIdentity(userBob);
    const user = await actor.getUser();
    expect(user).toHaveLength(0);
  });

  test("profile has referralCode after creation", async () => {
    actor.setIdentity(userAlice);
    await actor.createProfile({
      displayName: [],
      username: "alice2",
    });

    const profile = expectSingle(await actor.getProfile(), "profile");
    const referralCode = expectSingle(
      profile.referralCode,
      "profile referral code",
    );
    expect(referralCode).toHaveLength(8);
  });

  test("referralCode is unique per user", async () => {
    actor.setIdentity(userAlice);
    await actor.createProfile({
      displayName: [],
      username: "alice3",
    });
    const profile1 = expectSingle(await actor.getProfile(), "alice profile");

    actor.setIdentity(userBob);
    await actor.createProfile({
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
      displayName: [],
      username: "owner",
    });
    const ownerProfile = expectSingle(
      await actor.getProfile(),
      "owner profile",
    );
    const ownerCode = expectSingle(
      ownerProfile.referralCode,
      "owner referral code",
    );

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    expect(await actor.applyReferralCode(ownerCode)).toEqual({ ok: null });
    await actor.createProfile({
      displayName: [],
      username: "alice",
    });
    const aliceProfile = expectSingle(
      await actor.getProfile(),
      "alice profile",
    );
    const aliceCode = expectSingle(
      aliceProfile.referralCode,
      "alice referral code",
    );

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

describe("User profiles", () => {
  let actor: Actor<RabbitholeActorService>;
  let manager: BackendManager;

  beforeEach(async () => {
    manager = await BackendManager.create();
    ({ actor } = await manager.initBackendCanister());

    let startDate = subDays(new Date(), 14);
    for await (const { identity, args } of PROFILE_USERS) {
      actor.setIdentity(identity);
      startDate = addDays(startDate, 1);
      await manager.pic.setTime(startDate);
      await actor.createProfile(args);
    }
  });

  afterEach(async () => {
    await manager?.afterAll();
  });

  test("createProfile creates an embedded profile", async () => {
    const { identity, args } = createRandomProfileUser();
    actor.setIdentity(identity);

    const id = await actor.createProfile(args);

    expect(id).toBeInstanceOf(Uint8Array);
    expect(id.length).toBeGreaterThan(0);

    const user = expectSingle(await actor.getUser(), "profile user");
    expect(user.id.toText()).toEqual(identity.getPrincipal().toText());
    expect(user.profile[0]?.username).toBe(args.username);
  });

  test("getProfile reads the caller profile", async () => {
    const { identity, args } = PROFILE_USERS[0];
    actor.setIdentity(identity);

    const profile = expectSingle(await actor.getProfile(), "profile");

    expect(profile.id.toText()).toEqual(identity.getPrincipal().toText());
    expect(profile.username).toBe(args.username);
  });

  // Requires a Caffeine Blob Storage Cashier canister, which backend PocketIC tests do not deploy.
  test.skip("avatar upload prepare and commit stores profile avatarRef", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    const content = new TextEncoder().encode("avatar bytes");
    const prepared = await actor.prepareAvatarUpload({
      content,
      contentType: "image/PNG",
    });

    expect(prepared.rootHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(prepared.contentType).toBe("image/png");
    expect(Array.from(prepared.blobId)).toEqual(
      Array.from(new TextEncoder().encode(prepared.rootHash)),
    );

    const committed = await actor.commitAvatarUpload(prepared.rootHash);
    expect(committed.rootHash).toBe(prepared.rootHash);

    await actor.createProfile({
      displayName: [],
      username: "avatar-user",
    });

    let profile = expectSingle(await actor.getProfile(), "avatar profile");
    expect(profile.avatarRef[0]?.rootHash).toBe(prepared.rootHash);

    await actor.clearAvatar();
    profile = expectSingle(await actor.getProfile(), "cleared avatar profile");
    expect(profile.avatarRef).toEqual([]);
  });

  test("updateProfile updates display name", async () => {
    const { identity } = PROFILE_USERS[0];
    actor.setIdentity(identity);

    const result = await actor.updateProfile({
      displayName: ["John Do"],
    });

    expect(result).toBeNull();
    const profile = expectSingle(await actor.getProfile(), "updated profile");
    expect(profile.displayName).toEqual(["John Do"]);
    expect(profile.avatarRef).toEqual([]);
  });

  test("deleteProfile clears the embedded profile", async () => {
    const { identity } = PROFILE_USERS[0];
    actor.setIdentity(identity);

    const result = await actor.deleteProfile();

    expect(result).toBeNull();
    expect(await actor.getProfile()).toEqual([]);
    const user = expectSingle(await actor.getUser(), "user without profile");
    expect(user.profile).toEqual([]);
  });

  test("usernameExists checks embedded profile usernames", async () => {
    const username = PROFILE_USERS[0].args.username;

    expect(await actor.usernameExists(username)).toBeTruthy();
    expect(await actor.usernameExists(faker.internet.username())).toBeFalsy();
  });
});
