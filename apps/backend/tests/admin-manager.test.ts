import { type Actor, createIdentity, PocketIc } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';

import {
  createPic,
  ownerIdentity,
  userAlice,
  userBob,
} from './setup/helpers.ts';

/**
 * Admin rights live on User.role (#admin | #moderator | #user) rather than
 * a separate Set<Principal>. The installer is auto-promoted at init, and
 * other principals become admin via `setUserRole(target, #admin)` after
 * registering. The old `addAdmin`/`removeAdmin` surface is gone.
 */
describe('User roles (admin)', () => {
  let pic: PocketIc;
  let actor: Actor<RabbitholeActorService>;

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test('installer is initial admin', async () => {
    actor.setIdentity(ownerIdentity);
    const admins = await actor.listUsersByRole({ admin: null });
    expect(admins).toHaveLength(1);
    expect(admins[0].toText()).toBe(ownerIdentity.getPrincipal().toText());
  });

  test('isAdmin is a public query', async () => {
    // Anonymous caller — no identity guard needed.
    expect(await actor.isAdmin(ownerIdentity.getPrincipal())).toBe(true);
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test('non-admin cannot list admins', async () => {
    actor.setIdentity(userAlice);
    await expect(actor.listUsersByRole({ admin: null })).rejects.toThrow();
  });

  test('non-admin cannot list users', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    await expect(
      actor.adminListUsers({
        pagination: { offset: 0n, limit: 10n },
        count: true,
        sort: [],
        filter: {
          id: [],
          inviter: [],
          role: [],
          verifiedEmail: [],
          trialUsed: [],
          identityProvider: [],
          search: [],
          createdAt: [],
          lastLoginAt: [],
          identitySyncedAt: [],
          referralAppliedAt: [],
          updatedAt: [],
        },
      }),
    ).rejects.toThrow();
  });

  test('admin can list users with pagination and role filter', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser(['internet_identity']);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { moderator: null });

    const page = await actor.adminListUsers({
      pagination: { offset: 0n, limit: 2n },
      count: true,
      sort: [['createdAt', { Ascending: null }]],
      filter: {
        id: [],
        inviter: [],
        role: [],
        verifiedEmail: [],
        trialUsed: [],
        identityProvider: [],
        search: [],
        createdAt: [],
        lastLoginAt: [],
        identitySyncedAt: [],
        referralAppliedAt: [],
        updatedAt: [],
      },
    });

    expect(page.total).toEqual([3n]);
    expect(page.data).toHaveLength(2);

    const moderators = await actor.adminListUsers({
      pagination: { offset: 0n, limit: 10n },
      count: true,
      sort: [],
      filter: {
        id: [],
        inviter: [],
        role: [{ moderator: null }],
        verifiedEmail: [],
        trialUsed: [],
        identityProvider: [],
        search: [],
        createdAt: [],
        lastLoginAt: [],
        identitySyncedAt: [],
        referralAppliedAt: [],
        updatedAt: [],
      },
    });

    expect(moderators.total).toEqual([1n]);
    expect(moderators.data[0].id.toText()).toBe(
      userAlice.getPrincipal().toText(),
    );
    expect(moderators.data[0].identity.provider).toEqual(['internet_identity']);
  });

  test('admin can filter users by inviter', async () => {
    actor.setIdentity(ownerIdentity);
    await actor.createProfile({
      username: 'owner-inviter',
      displayName: [],
      avatarUrl: [],
    });
    const ownerProfile = await actor.getProfile();
    const referralCode = ownerProfile[0]?.referralCode?.[0];
    expect(referralCode).toBeDefined();

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    if (referralCode) {
      expect(await actor.applyReferralCode(referralCode)).toEqual({ ok: null });
    }

    actor.setIdentity(userBob);
    await actor.ensureUser([]);

    actor.setIdentity(ownerIdentity);
    const invited = await actor.adminListUsers({
      pagination: { offset: 0n, limit: 10n },
      count: true,
      sort: [],
      filter: {
        id: [],
        inviter: [[ownerIdentity.getPrincipal()]],
        role: [],
        verifiedEmail: [],
        trialUsed: [],
        identityProvider: [],
        search: [],
        createdAt: [],
        lastLoginAt: [],
        identitySyncedAt: [],
        referralAppliedAt: [],
        updatedAt: [],
      },
    });

    expect(invited.total).toEqual([1n]);
    expect(invited.data[0].id.toText()).toBe(userAlice.getPrincipal().toText());
    expect(invited.data[0].inviter[0]?.toText()).toBe(
      ownerIdentity.getPrincipal().toText(),
    );
  });

  test('public user directory search exposes only profile summary', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.createProfile({
      username: 'alice-admin-test',
      displayName: ['Alice Admin'],
      avatarUrl: [],
    });

    const results = await actor.searchUserDirectory('alice admin', 10n);

    expect(results).toHaveLength(1);
    expect(results[0].id.toText()).toBe(userAlice.getPrincipal().toText());
    expect(results[0].match).toEqual({ profile: null });
    expect(results[0].profile[0]?.username).toBe('alice-admin-test');
    expect('email' in results[0]).toBe(false);

    actor.setIdentity(userBob);
    await actor.ensureUser([]);

    const principalResults = await actor.searchUserDirectory(
      userBob.getPrincipal().toText(),
      10n,
    );

    expect(principalResults).toHaveLength(1);
    expect(principalResults[0].id.toText()).toBe(
      userBob.getPrincipal().toText(),
    );
    expect(principalResults[0].match).toEqual({ principalExact: null });
    expect(principalResults[0].profile).toHaveLength(0);
  });

  test('public user directory search trims input and caps broad profile results', async () => {
    for (let index = 0; index < 22; index += 1) {
      const identity = createIdentity(`directory-cap-${index}`);
      actor.setIdentity(identity);
      await actor.ensureUser([]);
      await actor.createProfile({
        username: `directory-cap-${index}`,
        displayName: [`Directory Cap ${index}`],
        avatarUrl: [],
      });
    }

    const shortQueryResults = await actor.searchUserDirectory('d', 100n);
    expect(shortQueryResults).toHaveLength(0);

    const trimmedResults = await actor.searchUserDirectory(
      ' directory cap ',
      100n,
    );
    expect(trimmedResults).toHaveLength(20);
    expect(
      trimmedResults.every((result) =>
        result.profile[0]?.username.startsWith('directory-cap-'),
      ),
    ).toBe(true);
  });

  test('admin can promote a registered user to admin', async () => {
    // Alice must register first — setUserRole requires the user to exist.
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { admin: null });

    const admins = await actor.listUsersByRole({ admin: null });
    expect(admins).toHaveLength(2);
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(true);
  });

  test('admin can demote another admin back to user', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { admin: null });
    await actor.setUserRole(userAlice.getPrincipal(), { user: null });

    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test('non-admin cannot change roles', async () => {
    actor.setIdentity(userBob);
    await actor.ensureUser([]);

    actor.setIdentity(userAlice);
    await expect(
      actor.setUserRole(userBob.getPrincipal(), { admin: null }),
    ).rejects.toThrow();
  });

  test('admin can promote an unknown principal to admin', async () => {
    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { admin: null });

    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(true);
  });

  test('setUserRole on unknown principal throws for non-admin roles', async () => {
    actor.setIdentity(ownerIdentity);
    await expect(
      actor.setUserRole(userAlice.getPrincipal(), { moderator: null }),
    ).rejects.toThrow(/user not found/);
  });

  test('admin cannot self-demote', async () => {
    actor.setIdentity(ownerIdentity);
    await expect(
      actor.setUserRole(ownerIdentity.getPrincipal(), { user: null }),
    ).rejects.toThrow(/self-demote/);
    // But self-"promote" to admin (no-op) is allowed.
    await actor.setUserRole(ownerIdentity.getPrincipal(), { admin: null });
  });

  test('moderator role can be assigned and listed', async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { moderator: null });

    const mods = await actor.listUsersByRole({ moderator: null });
    expect(mods).toHaveLength(1);
    expect(mods[0].toText()).toBe(userAlice.getPrincipal().toText());
    // Moderators are NOT admins.
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test('admin guards protect deployer methods', async () => {
    actor.setIdentity(userAlice);
    await expect(actor.startStorageDeployer()).rejects.toThrow();
    await expect(actor.stopStorageDeployer()).rejects.toThrow();
    await expect(actor.refreshReleases()).rejects.toThrow();
  });
});
