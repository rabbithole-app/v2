import { type Actor, PocketIc } from "@dfinity/pic";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import { createPic, userAlice } from "./setup/helpers.ts";

describe("Notifications", () => {
  let pic: PocketIc;
  let actor: Actor<RabbitholeActorService>;

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test("no notifications by default", async () => {
    actor.setIdentity(userAlice);
    const count = await actor.getUnreadNotificationCount();
    expect(count).toBe(0n);

    const page = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    expect(page.data).toHaveLength(0);
    expect(page.unreadCount).toBe(0n);

    const unreadPage = await actor.listNotifications({
      afterId: [],
      limit: 10n,
      unreadOnly: true,
    });
    expect(unreadPage.data).toHaveLength(0);
    expect(unreadPage.unreadCount).toBe(0n);
  });

  test("activateTrial does not break notifications", async () => {
    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.activateTrial();

    const count = await actor.getUnreadNotificationCount();
    expect(count).toBe(0n);
  });

  test("markAllAsRead works on empty inbox", async () => {
    actor.setIdentity(userAlice);
    await actor.markAllNotificationsRead();
    const count = await actor.getUnreadNotificationCount();
    expect(count).toBe(0n);
  });

  test("markNotificationsRead works on empty inbox", async () => {
    actor.setIdentity(userAlice);
    await actor.markNotificationsRead([1n, 2n, 3n]);
    const count = await actor.getUnreadNotificationCount();
    expect(count).toBe(0n);
  });
});
