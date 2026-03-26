import { type Actor, PocketIc } from "@dfinity/pic";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import {
  createPic,
  ownerIdentity,
  userAlice,
  userBob,
} from "./setup/helpers.ts";

describe("Subscriptions", () => {
  let pic: PocketIc;
  let actor: Actor<RabbitholeActorService>;

  beforeEach(async () => {
    [pic, { actor }] = await createPic();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test("no subscription by default", async () => {
    actor.setIdentity(userAlice);
    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(0);
  });

  test("activateTrial creates trial subscription", async () => {
    actor.setIdentity(userAlice);
    await actor.activateTrial();

    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(1);
    const [subData] = sub;
    expect(subData!.plan).toEqual({ Trial: null });
    expect(subData!.status).toEqual({ Active: null });
    expect(subData!.expiresAt).toHaveLength(1);
  });

  test("cannot activate trial twice", async () => {
    actor.setIdentity(userAlice);
    await actor.activateTrial();
    await expect(actor.activateTrial()).rejects.toThrow();
  });

  test("admin can activate subscription", async () => {
    actor.setIdentity(ownerIdentity);
    await actor.activateSubscription(
      userAlice.getPrincipal(),
      { Pro: null },
      [],
    );

    actor.setIdentity(userAlice);
    const sub = await actor.getSubscription();
    expect(sub).toHaveLength(1);
    expect(sub[0]!.plan).toEqual({ Pro: null });
  });

  test("non-admin cannot activate subscription", async () => {
    actor.setIdentity(userAlice);
    await expect(
      actor.activateSubscription(userBob.getPrincipal(), { Pro: null }, []),
    ).rejects.toThrow();
  });

  test("admin can list subscriptions with filters", async () => {
    actor.setIdentity(ownerIdentity);
    await actor.activateSubscription(
      userAlice.getPrincipal(),
      { Pro: null },
      [],
    );
    await actor.activateSubscription(
      userBob.getPrincipal(),
      { License: null },
      [],
    );

    // List all subscriptions (without variant filter which ZenDB may not support yet)
    const result = await actor.listSubscriptions({
      filter: {
        userId: [],
        plan: [],
        status: [],
        expiresAt: [],
      },
      sort: [],
      pagination: { offset: 0n, limit: 10n },
      count: true,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toEqual([2n]);

    // Filter by userId
    const filtered = await actor.listSubscriptions({
      filter: {
        userId: [[userAlice.getPrincipal()]],
        plan: [],
        status: [],
        expiresAt: [],
      },
      sort: [],
      pagination: { offset: 0n, limit: 10n },
      count: true,
    });

    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0].userId.toText()).toBe(
      userAlice.getPrincipal().toText(),
    );

    // Filter by plan
    const proOnly = await actor.listSubscriptions({
      filter: {
        userId: [],
        plan: [[{ Pro: null }]],
        status: [],
        expiresAt: [],
      },
      sort: [],
      pagination: { offset: 0n, limit: 10n },
      count: true,
    });

    expect(proOnly.data).toHaveLength(1);
    expect(proOnly.data[0].plan).toEqual({ Pro: null });
  });

  test("checkSubscription returns unknownCanister for unknown caller", async () => {
    actor.setIdentity(userAlice);
    const result = await actor.checkSubscription(new Uint8Array(32));
    expect(result).toEqual({ unknownCanister: null });
  });

  test("trial shows as expired after 14 days", async () => {
    const startTime = new Date("2026-06-01T00:00:00Z");
    await pic.setCertifiedTime(startTime);

    actor.setIdentity(userAlice);
    await actor.activateTrial();
    expect((await actor.getSubscription())[0]!.status).toEqual({
      Active: null,
    });

    // Jump past 14-day trial
    await pic.setCertifiedTime(new Date("2026-06-16T00:00:00Z"));

    const after = await actor.getSubscription();
    expect(after[0]!.status).toEqual({ Expired: null });
  });
});
