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
    await actor.ensureUser([]);
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
    await actor.ensureUser([]);
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
      { Free: null },
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

  test("reportTrialBytes silently ignores calls from unknown principals", async () => {
    actor.setIdentity(userAlice);
    // Should not throw — noop for unregistered callers
    await actor.reportTrialBytes(1000n);

    // Verify no subscription was created or modified
    actor.setIdentity(ownerIdentity);
    const subs = await actor.listSubscriptions({
      filter: {
        userId: [[userAlice.getPrincipal()]],
        plan: [],
        status: [],
        expiresAt: [],
      },
      sort: [],
      pagination: { offset: 0n, limit: 1n },
      count: true,
    });
    expect(subs.total).toEqual([0n]);
  });

  test("onStorageLowCycles ignores calls from unregistered principal", async () => {
    actor.setIdentity(userAlice);
    // Should not throw — silently returns for unregistered callers
    await actor.onStorageLowCycles(1000n, 5n, { warning: null });

    // Verify no notification was created for alice
    const page = await actor.getNotifications([], 10n);
    expect(page.data).toHaveLength(0);
  });

  test("trial shows as expired after 14 days", async () => {
    const startTime = new Date("2026-06-01T00:00:00Z");
    await pic.setCertifiedTime(startTime);

    actor.setIdentity(userAlice);
    await actor.ensureUser([]);
    await actor.activateTrial();
    expect((await actor.getSubscription())[0]!.status).toEqual({
      Active: null,
    });

    // Jump past 14-day trial
    await pic.setCertifiedTime(new Date("2026-06-16T00:00:00Z"));

    const after = await actor.getSubscription();
    expect(after[0]!.status).toEqual({ Expired: null });
  });

  // ===================== expireOverdue =====================

  describe("triggerExpireOverdue", () => {
    test("expires overdue subscriptions and returns affected principals", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      // Activate Pro for Alice with 1-hour expiry
      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneHourNs = 3_600_000_000_000n;
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + oneHourNs],
      );

      // Verify Alice is Active
      actor.setIdentity(userAlice);
      expect((await actor.getSubscription())[0]!.status).toEqual({
        Active: null,
      });

      // Advance past expiry
      await pic.setCertifiedTime(new Date("2026-06-01T02:00:00Z"));

      // Trigger expireOverdue as admin
      actor.setIdentity(ownerIdentity);
      const expired = await actor.triggerExpireOverdue();
      expect(expired).toHaveLength(1);
      expect(expired[0]!.toText()).toBe(userAlice.getPrincipal().toText());

      // Verify status is now Expired in DB
      actor.setIdentity(userAlice);
      const sub = await actor.getSubscription();
      expect(sub[0]!.status).toEqual({ Expired: null });
    });

    test("does not affect subscriptions without expiry", async () => {
      // Activate Pro for Alice without expiry (perpetual)
      actor.setIdentity(ownerIdentity);
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [],
      );

      const expired = await actor.triggerExpireOverdue();
      expect(expired).toHaveLength(0);

      // Verify still Active
      actor.setIdentity(userAlice);
      expect((await actor.getSubscription())[0]!.status).toEqual({
        Active: null,
      });
    });

    test("does not affect subscriptions expiring in the future", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneDayNs = 86_400_000_000_000n;
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + oneDayNs],
      );

      const expired = await actor.triggerExpireOverdue();
      expect(expired).toHaveLength(0);
    });

    test("expires multiple users at once", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneHourNs = 3_600_000_000_000n;

      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + oneHourNs],
      );
      await actor.activateSubscription(
        userBob.getPrincipal(),
        { Pro: null },
        [nowNs + oneHourNs],
      );

      // Advance past expiry
      await pic.setCertifiedTime(new Date("2026-06-01T02:00:00Z"));

      const expired = await actor.triggerExpireOverdue();
      expect(expired).toHaveLength(2);

      const expiredTexts = expired.map((p) => p.toText()).sort();
      const expectedTexts = [
        userAlice.getPrincipal().toText(),
        userBob.getPrincipal().toText(),
      ].sort();
      expect(expiredTexts).toEqual(expectedTexts);
    });

    test("non-admin cannot call triggerExpireOverdue", async () => {
      actor.setIdentity(userAlice);
      await expect(actor.triggerExpireOverdue()).rejects.toThrow();
    });
  });

  // ===================== renewSubscription =====================

  describe("renewSubscription", () => {
    test("renews an expired subscription", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneHourNs = 3_600_000_000_000n;

      // Activate and expire
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + oneHourNs],
      );
      await pic.setCertifiedTime(new Date("2026-06-01T02:00:00Z"));

      // Expire in DB
      await actor.triggerExpireOverdue();

      // Renew with new expiry (30 days from now)
      const renewNowNs =
        BigInt(new Date("2026-06-01T02:00:00Z").getTime()) * 1_000_000n;
      const thirtyDaysNs = 30n * 86_400_000_000_000n;
      await actor.renewSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [renewNowNs + thirtyDaysNs],
      );

      // Verify renewed
      actor.setIdentity(userAlice);
      const sub = await actor.getSubscription();
      expect(sub[0]!.status).toEqual({ Active: null });
      expect(sub[0]!.plan).toEqual({ Pro: null });
    });

    test("fails for non-existent subscription", async () => {
      actor.setIdentity(ownerIdentity);
      await expect(
        actor.renewSubscription(
          userAlice.getPrincipal(),
          { Pro: null },
          [],
        ),
      ).rejects.toThrow();
    });

    test("can change plan during renewal", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneHourNs = 3_600_000_000_000n;

      // Start as Trial (via admin)
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Trial: null },
        [nowNs + oneHourNs],
      );

      // Renew as Pro (still active — renewSubscription works on active subs too)
      const thirtyDaysNs = 30n * 86_400_000_000_000n;
      await actor.renewSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + thirtyDaysNs],
      );

      actor.setIdentity(userAlice);
      const sub = await actor.getSubscription();
      expect(sub[0]!.plan).toEqual({ Pro: null });
      expect(sub[0]!.status).toEqual({ Active: null });
    });

    test("non-admin cannot call renewSubscription", async () => {
      actor.setIdentity(ownerIdentity);
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [],
      );

      actor.setIdentity(userAlice);
      await expect(
        actor.renewSubscription(
          userAlice.getPrincipal(),
          { Pro: null },
          [],
        ),
      ).rejects.toThrow();
    });
  });

  // ===================== queryExpiringSubscriptions =====================

  describe("queryExpiringSubscriptions", () => {
    test("returns subscriptions expiring within the given window", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const twelveHoursNs = 12n * 3_600_000_000_000n;
      const threeDaysNs = 3n * 86_400_000_000_000n;

      // Alice expires in 12 hours (within 24h window)
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + twelveHoursNs],
      );

      // Bob expires in 3 days (outside 24h window)
      await actor.activateSubscription(
        userBob.getPrincipal(),
        { Pro: null },
        [nowNs + threeDaysNs],
      );

      const expiring = await actor.queryExpiringSubscriptions(24n);
      expect(expiring).toHaveLength(1);
      expect(expiring[0]![0].toText()).toBe(
        userAlice.getPrincipal().toText(),
      );
    });

    test("returns empty when no subscriptions are expiring soon", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const thirtyDaysNs = 30n * 86_400_000_000_000n;

      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + thirtyDaysNs],
      );

      const expiring = await actor.queryExpiringSubscriptions(24n);
      expect(expiring).toHaveLength(0);
    });

    test("does not return already expired subscriptions", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const pastNs = BigInt(startTime.getTime()) * 1_000_000n - 3_600_000_000_000n;
      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [pastNs], // already expired
      );

      const expiring = await actor.queryExpiringSubscriptions(24n);
      expect(expiring).toHaveLength(0);
    });
  });

  // ===================== queryExpiredSubscriptions =====================

  describe("queryExpiredSubscriptions", () => {
    test("returns subscriptions after triggerExpireOverdue", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneHourNs = 3_600_000_000_000n;

      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + oneHourNs],
      );

      // Before expiry: queryExpiredSubscriptions returns empty
      const expiredBefore = await actor.queryExpiredSubscriptions();
      expect(expiredBefore).toHaveLength(0);

      // Advance past expiry and trigger
      await pic.setCertifiedTime(new Date("2026-06-01T02:00:00Z"));
      await actor.triggerExpireOverdue();

      // Now should return Alice
      const expired = await actor.queryExpiredSubscriptions();
      expect(expired).toHaveLength(1);
      expect(expired[0]![0].toText()).toBe(
        userAlice.getPrincipal().toText(),
      );
      expect(expired[0]![1].status).toEqual({ Expired: null });
    });

    test("does not return active subscriptions with computed expired status", async () => {
      const startTime = new Date("2026-06-01T00:00:00Z");
      await pic.setCertifiedTime(startTime);

      actor.setIdentity(ownerIdentity);
      const nowNs = BigInt(startTime.getTime()) * 1_000_000n;
      const oneHourNs = 3_600_000_000_000n;

      await actor.activateSubscription(
        userAlice.getPrincipal(),
        { Pro: null },
        [nowNs + oneHourNs],
      );

      // Advance past expiry but do NOT call triggerExpireOverdue
      await pic.setCertifiedTime(new Date("2026-06-01T02:00:00Z"));

      // getSubscription shows Expired (computed), but DB still says Active
      actor.setIdentity(userAlice);
      expect((await actor.getSubscription())[0]!.status).toEqual({
        Expired: null,
      });

      // queryExpiredSubscriptions queries DB status = Expired, so should be empty
      actor.setIdentity(ownerIdentity);
      const expired = await actor.queryExpiredSubscriptions();
      expect(expired).toHaveLength(0);
    });
  });
});
