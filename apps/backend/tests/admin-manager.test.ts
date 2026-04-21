import { type Actor, PocketIc } from "@dfinity/pic";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import {
  createPic,
  ownerIdentity,
  userAlice,
  userBob,
} from "./setup/helpers.ts";

/**
 * Admin rights live on User.role (#admin | #moderator | #user) rather than
 * a separate Set<Principal>. The installer is auto-promoted at init, and
 * other principals become admin via `setUserRole(target, #admin)` after
 * registering. The old `addAdmin`/`removeAdmin` surface is gone.
 */
describe("User roles (admin)", () => {
  let pic: PocketIc;
  let actor: Actor<RabbitholeActorService>;

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test("installer is initial admin", async () => {
    actor.setIdentity(ownerIdentity);
    const admins = await actor.listUsersByRole({ admin: null });
    expect(admins).toHaveLength(1);
    expect(admins[0].toText()).toBe(ownerIdentity.getPrincipal().toText());
  });

  test("isAdmin is a public query", async () => {
    // Anonymous caller — no identity guard needed.
    expect(await actor.isAdmin(ownerIdentity.getPrincipal())).toBe(true);
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test("non-admin cannot list admins", async () => {
    actor.setIdentity(userAlice);
    await expect(actor.listUsersByRole({ admin: null })).rejects.toThrow();
  });

  test("admin can promote a registered user to admin", async () => {
    // Alice must register first — setUserRole requires the user to exist.
    actor.setIdentity(userAlice);
    await actor.register([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { admin: null });

    const admins = await actor.listUsersByRole({ admin: null });
    expect(admins).toHaveLength(2);
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(true);
  });

  test("admin can demote another admin back to user", async () => {
    actor.setIdentity(userAlice);
    await actor.register([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { admin: null });
    await actor.setUserRole(userAlice.getPrincipal(), { user: null });

    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test("non-admin cannot change roles", async () => {
    actor.setIdentity(userBob);
    await actor.register([]);

    actor.setIdentity(userAlice);
    await expect(
      actor.setUserRole(userBob.getPrincipal(), { admin: null }),
    ).rejects.toThrow();
  });

  test("setUserRole on unknown principal throws", async () => {
    actor.setIdentity(ownerIdentity);
    await expect(
      actor.setUserRole(userAlice.getPrincipal(), { admin: null }),
    ).rejects.toThrow(/user not found/);
  });

  test("admin cannot self-demote", async () => {
    actor.setIdentity(ownerIdentity);
    await expect(
      actor.setUserRole(ownerIdentity.getPrincipal(), { user: null }),
    ).rejects.toThrow(/self-demote/);
    // But self-"promote" to admin (no-op) is allowed.
    await actor.setUserRole(ownerIdentity.getPrincipal(), { admin: null });
  });

  test("moderator role can be assigned and listed", async () => {
    actor.setIdentity(userAlice);
    await actor.register([]);

    actor.setIdentity(ownerIdentity);
    await actor.setUserRole(userAlice.getPrincipal(), { moderator: null });

    const mods = await actor.listUsersByRole({ moderator: null });
    expect(mods).toHaveLength(1);
    expect(mods[0].toText()).toBe(userAlice.getPrincipal().toText());
    // Moderators are NOT admins.
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test("admin guards protect deployer methods", async () => {
    actor.setIdentity(userAlice);
    await expect(actor.startStorageDeployer()).rejects.toThrow();
    await expect(actor.stopStorageDeployer()).rejects.toThrow();
    await expect(actor.refreshReleases()).rejects.toThrow();
  });
});
