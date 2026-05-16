import { type CanisterFixture, PocketIc } from '@dfinity/pic';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RabbitholeActorService } from '@rabbithole/declarations';

import {
  createPicWithWebhook,
  ICPAY_SECRET,
  makePaymentCompletedEvent,
  ownerIdentity,
  signWebhookPayload,
  userAlice,
} from './setup/helpers.ts';

// Mirrors the backend `ICPAY_ENABLED` flag in main.mo. Webhook-dependent
// tests skip while ICPay middleware is off.
const ICPAY_ENABLED = false;

describe('PaymentsMixin', () => {
  let pic: PocketIc;
  let actor: CanisterFixture<RabbitholeActorService>['actor'];

  beforeEach(async () => {
    [pic, { actor }] = await createPicWithWebhook();
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  test('flushPaymentQueue: admin can call', async () => {
    actor.setIdentity(ownerIdentity);
    await actor.flushPaymentQueue();
  });

  test('flushPaymentQueue: non-admin rejected', async () => {
    actor.setIdentity(userAlice);
    await expect(actor.flushPaymentQueue()).rejects.toThrow();
  });

  // ---- Webhook HTTP tests ----

  describe.skipIf(!ICPAY_ENABLED)('webhook HTTP', () => {
  function buildHttpRequest(body: string, signature: string) {
    const bodyBytes = new TextEncoder().encode(body);
    return {
      url: '/webhook',
      method: 'POST',
      body: bodyBytes,
      headers: [
        ['content-type', 'application/json'],
        ['x-icpay-signature', signature],
      ] as [string, string][],
      certificate_version: [],
    };
  }

  async function getPicTimestamp(): Promise<number> {
    // PocketIC time is set in BaseManager.create() to current host time.
    // But here we create PocketIc directly, so time may default to genesis.
    // Set time to now before computing timestamp.
    await pic.setTime(new Date().getTime());
    await pic.tick();
    const timeMs = await pic.getTime();
    return Math.floor(timeMs / 1000);
  }

  test('webhook: valid signature returns 200', async () => {
    const body = makePaymentCompletedEvent({ purpose: 'deposit', userId: userAlice.getPrincipal().toText() });
    const ts = await getPicTimestamp();
    const signature = signWebhookPayload(ICPAY_SECRET, body, ts);
    const request = buildHttpRequest(body, signature);

    const response = await actor.http_request_update(request);
    expect(response.status_code).toBe(200);
  });

  test('webhook: invalid signature returns 401', async () => {
    const body = makePaymentCompletedEvent({ purpose: 'deposit' });
    const signature = signWebhookPayload('wrong-secret', body);
    const request = buildHttpRequest(body, signature);

    const response = await actor.http_request_update(request);
    expect(response.status_code).toBe(401);
  });

  test('webhook: missing signature returns 401', async () => {
    const body = makePaymentCompletedEvent({ purpose: 'deposit' });
    const bodyBytes = new TextEncoder().encode(body);
    const request = {
      url: '/webhook',
      method: 'POST',
      body: bodyBytes,
      headers: [['content-type', 'application/json']] as [string, string][],
      certificate_version: [],
    };

    const response = await actor.http_request_update(request);
    expect(response.status_code).toBe(401);
  });

  test('webhook: idempotency — same event ID processed once', async () => {
    const eventBody = makePaymentCompletedEvent({
      purpose: 'deposit',
      userId: userAlice.getPrincipal().toText(),
    });
    const ts = await getPicTimestamp();
    const signature = signWebhookPayload(ICPAY_SECRET, eventBody, ts);
    const request = buildHttpRequest(eventBody, signature);

    const response1 = await actor.http_request_update(request);
    expect(response1.status_code).toBe(200);

    // Second call — silently skipped by idempotency
    const response2 = await actor.http_request_update(request);
    expect(response2.status_code).toBe(200);
  });

  test('webhook: deposit purpose triggers no distribution', async () => {
    // For deposit, funds are already on user's wallet via ICPay relay.
    // Backend just acknowledges — no treasury calls needed.
    const body = makePaymentCompletedEvent({
      purpose: 'deposit',
      userId: userAlice.getPrincipal().toText(),
      amount: 5_000_000n, // 0.05 ICP
    });
    const signature = signWebhookPayload(ICPAY_SECRET, body, await getPicTimestamp());
    const response = await actor.http_request_update(buildHttpRequest(body, signature));
    expect(response.status_code).toBe(200);

    // Drain queue (events are queued, processed async)
    actor.setIdentity(ownerIdentity);
    await actor.flushPaymentQueue();

    // Verify notification was created
    actor.setIdentity(userAlice);
    const notifs = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    const depositNotif = notifs.data.find(
      (n: any) => 'depositReceived' in n.payload
    );
    expect(depositNotif).toBeDefined();
  });

  test('webhook: unknown purpose is silently ignored', async () => {
    const body = makePaymentCompletedEvent({
      purpose: 'unknown_purpose',
      userId: userAlice.getPrincipal().toText(),
    });
    const signature = signWebhookPayload(ICPAY_SECRET, body, await getPicTimestamp());
    const response = await actor.http_request_update(buildHttpRequest(body, signature));
    expect(response.status_code).toBe(200);

    // Flush and verify no notification
    actor.setIdentity(ownerIdentity);
    await actor.flushPaymentQueue();

    actor.setIdentity(userAlice);
    const notifs = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    expect(notifs.data).toHaveLength(0);
  });

  test('webhook: queue drain processes events after flush', async () => {
    // Send two webhook events
    for (let i = 0; i < 2; i++) {
      const body = makePaymentCompletedEvent({
        purpose: 'deposit',
        userId: userAlice.getPrincipal().toText(),
        paymentId: `pay-drain-${i}`,
      });
      const sig = signWebhookPayload(ICPAY_SECRET, body, await getPicTimestamp());
      await actor.http_request_update(buildHttpRequest(body, sig));
    }

    // Before flush — notifications should not exist yet (events queued)
    actor.setIdentity(userAlice);
    const before = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    const depositsBefore = before.data.filter(
      (n: any) => 'depositReceived' in n.payload
    );
    expect(depositsBefore).toHaveLength(0);

    // Flush queue
    actor.setIdentity(ownerIdentity);
    await actor.flushPaymentQueue();

    // After flush — both events processed
    actor.setIdentity(userAlice);
    const after = await actor.listNotifications({ afterId: [], limit: 10n, unreadOnly: false });
    const depositsAfter = after.data.filter(
      (n: any) => 'depositReceived' in n.payload
    );
    expect(depositsAfter).toHaveLength(2);
  });
  });
});
