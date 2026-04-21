import type { CanisterFixture } from "@dfinity/pic";
import { createIdentity } from "@dfinity/pic";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { RabbitholeActorService } from "@rabbithole/declarations";

import { BackendManager } from "./setup/backend-manager";

/**
 * CmcRecovery admin API surface. Full retry-path coverage (actually inducing
 * CMC `#Processing` / `#TransactionTooOld` / `#Other` responses) requires a
 * CMC mock — not wired up here yet. These tests cover plumbing only: auth,
 * empty-state query shapes, idempotent dismiss, #notFound on unknown id.
 */
describe("CmcRecovery admin API", () => {
  let manager: BackendManager;
  let backendFixture: CanisterFixture<RabbitholeActorService>;

  beforeAll(async () => {
    manager = await BackendManager.create();
    backendFixture = await manager.initBackendCanister();
  });

  afterAll(async () => {
    await manager.afterAll();
  });

  test("listPendingCmcOps: non-admin is rejected", async () => {
    const stranger = createIdentity("cmcrec-list-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(
      backendFixture.actor.listPendingCmcOps({ afterId: [], limit: [] }),
    ).rejects.toThrow();
  });

  test("retryPendingCmcOp: non-admin is rejected", async () => {
    const stranger = createIdentity("cmcrec-retry-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(backendFixture.actor.retryPendingCmcOp(0n)).rejects.toThrow();
  });

  test("dismissPendingCmcOp: non-admin is rejected", async () => {
    const stranger = createIdentity("cmcrec-dismiss-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(backendFixture.actor.dismissPendingCmcOp(0n)).rejects.toThrow();
  });

  test("getCmcRecoveryStats: non-admin is rejected", async () => {
    const stranger = createIdentity("cmcrec-stats-stranger");
    backendFixture.actor.setIdentity(stranger);
    await expect(backendFixture.actor.getCmcRecoveryStats()).rejects.toThrow();
  });

  test("listPendingCmcOps: empty on fresh backend", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const result = await backendFixture.actor.listPendingCmcOps({ afterId: [], limit: [] });
    expect(result).toHaveLength(0);
  });

  test("getCmcRecoveryStats: all zero on fresh backend", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const stats = await backendFixture.actor.getCmcRecoveryStats();
    expect(stats.totalCreated).toBe(0n);
    expect(stats.totalResolved).toBe(0n);
    expect(stats.totalRefunded).toBe(0n);
    expect(stats.totalDismissed).toBe(0n);
  });

  test("retryPendingCmcOp: unknown id returns #notFound", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    const result = await backendFixture.actor.retryPendingCmcOp(999n);
    expect(result).toHaveProperty("notFound");
  });

  test("dismissPendingCmcOp: unknown id returns #notFound (idempotent)", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    // Two successive calls on a non-existent id — both return #notFound,
    // stats.totalDismissed stays at 0.
    const first = await backendFixture.actor.dismissPendingCmcOp(777n);
    expect(first).toHaveProperty("notFound");
    const second = await backendFixture.actor.dismissPendingCmcOp(777n);
    expect(second).toHaveProperty("notFound");
    const stats = await backendFixture.actor.getCmcRecoveryStats();
    expect(stats.totalDismissed).toBe(0n);
  });

  test("listPendingCmcOps: pagination cursor respects afterId + limit shapes", async () => {
    backendFixture.actor.setIdentity(manager.ownerIdentity);
    // Empty store — any cursor/limit combo returns [].
    const afterFive = await backendFixture.actor.listPendingCmcOps({ afterId: [5n], limit: [10n] });
    expect(afterFive).toHaveLength(0);
    const limitZero = await backendFixture.actor.listPendingCmcOps({ afterId: [], limit: [0n] });
    expect(limitZero).toHaveLength(0);
  });
});
