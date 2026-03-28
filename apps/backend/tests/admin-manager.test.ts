import { type Actor, PocketIc } from "@dfinity/pic";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import {
  createPic,
  ownerIdentity,
  userAlice,
  userBob,
} from "./setup/helpers.ts";

describe("AdminManager", () => {
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
    const admins = await actor.listAdmins();
    expect(admins).toHaveLength(1);
    expect(admins[0].toText()).toBe(ownerIdentity.getPrincipal().toText());
  });

  test("non-admin cannot list admins", async () => {
    actor.setIdentity(userAlice);
    await expect(actor.listAdmins()).rejects.toThrow();
  });

  test("installer can check isAdmin", async () => {
    expect(await actor.isAdmin(ownerIdentity.getPrincipal())).toBe(true);
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test("admin can add another admin", async () => {
    actor.setIdentity(ownerIdentity);
    await actor.addAdmin(userAlice.getPrincipal());

    const admins = await actor.listAdmins();
    expect(admins).toHaveLength(2);
    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(true);
  });

  test("admin can remove another admin", async () => {
    actor.setIdentity(ownerIdentity);
    await actor.addAdmin(userAlice.getPrincipal());
    await actor.removeAdmin(userAlice.getPrincipal());

    expect(await actor.isAdmin(userAlice.getPrincipal())).toBe(false);
  });

  test("non-admin cannot add admin", async () => {
    actor.setIdentity(userAlice);
    await expect(actor.addAdmin(userBob.getPrincipal())).rejects.toThrow();
  });

  test("admin cannot remove self", async () => {
    actor.setIdentity(ownerIdentity);
    await expect(
      actor.removeAdmin(ownerIdentity.getPrincipal()),
    ).rejects.toThrow();
  });

  test("admin guards protect deployer methods", async () => {
    actor.setIdentity(userAlice);
    await expect(actor.startStorageDeployer()).rejects.toThrow();
    await expect(actor.stopStorageDeployer()).rejects.toThrow();
    await expect(actor.refreshReleases()).rejects.toThrow();
  });
});
