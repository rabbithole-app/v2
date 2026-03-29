import {
  type Actor,
  type CanisterFixture,
  createIdentity,
  PocketIc,
} from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  test,
} from "vitest";

import {
  type _SERVICE,
  idlFactory,
  init,
} from "../declarations/example/example.did.js";

const WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  ".dfx",
  "local",
  "canisters",
  "example",
  "example.wasm",
);

const TEST_SECRET = "test-webhook-secret-key-for-hmac";
const ownerIdentity = createIdentity("owner");

// -- Helpers --

function makeIntentData(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    status: "requires_payment",
    amount: "50000",
    accountId: "acc-123",
    ledgerCanisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    metadata: {},
    ...overrides,
  };
}

function makePaymentData(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    status: "completed",
    amount: "10000",
    accountId: "acc-123",
    ledgerCanisterId: "0x0000000000000000000000000000000000000000",
    metadata: {},
    ...overrides,
  };
}

/** Build ICPay webhook envelope JSON. */
function makePaymentEvent(
  type: string,
  dataObject: Record<string, unknown>,
): string {
  return JSON.stringify({
    id: `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`,
    object: "event",
    api_version: "2025-08-11",
    created: Math.floor(Date.now() / 1000),
    data: { object: dataObject },
    livemode: false,
    pending_webhooks: 1,
    request: { id: crypto.randomUUID(), idempotency_key: null },
    type,
  });
}

/** Send webhook via http_request_update. */
async function sendWebhook(
  actor: Actor<_SERVICE>,
  body: string,
  signatureHeader?: string,
) {
  const headers: [string, string][] = [
    ["content-type", "application/json"],
  ];
  if (signatureHeader !== undefined) {
    headers.push(["x-icpay-signature", signatureHeader]);
  }
  return actor.http_request_update({
    method: "POST",
    url: "/",
    headers,
    body: new TextEncoder().encode(body),
  });
}

/** Sign payload with HMAC-SHA256 in ICPay format: t=<ts>,v1=<hex> */
function signPayload(secret: string, body: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signed = `${ts}.${body}`;
  const hex = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  return `t=${ts},v1=${hex}`;
}

// -- Tests --

describe("ICPayWebhooks Middleware", () => {
  let pic: PocketIc;
  let actor: Actor<_SERVICE>;

  beforeEach(async () => {
    pic = await PocketIc.create(inject("PIC_URL"));
    // Sync PocketIC simulated time with wall clock (for timestamp tolerance check)
    await pic.setTime(new Date());
    await pic.tick();

    // Encode init arg: (blob) = (vec nat8)

    const secretBytes = new TextEncoder().encode(TEST_SECRET);

    const fixture: CanisterFixture<_SERVICE> = await pic.setupCanister({
      idlFactory,
      wasm: WASM_PATH,
      arg: IDL.encode(init({ IDL }), [secretBytes]),
      sender: ownerIdentity.getPrincipal(),
    });

    actor = fixture.actor;
    actor.setIdentity(ownerIdentity);
  });

  afterEach(async () => {
    await pic?.tearDown();
  });

  describe("Signature verification", () => {
    test("valid signature returns 200", async () => {
      const body = makePaymentEvent("payment.completed", makePaymentData());
      const sig = signPayload(TEST_SECRET, body);
      const response = await sendWebhook(actor, body, sig);
      expect(response.status_code).toBe(200);
    });

    test("missing signature returns 401", async () => {
      const body = makePaymentEvent("payment.completed", makePaymentData());
      const response = await sendWebhook(actor, body);
      expect(response.status_code).toBe(401);
    });

    test("malformed signature header returns 401", async () => {
      const body = makePaymentEvent("payment.completed", makePaymentData());
      const response = await sendWebhook(actor, body, "invalid-format");
      expect(response.status_code).toBe(401);
    });

    test("wrong secret returns 401", async () => {
      const body = makePaymentEvent("payment.completed", makePaymentData());
      const sig = signPayload("wrong-secret", body);
      const response = await sendWebhook(actor, body, sig);
      expect(response.status_code).toBe(401);
    });
  });

  describe("Event parsing", () => {
    test("payment.completed", async () => {
      const paymentId = crypto.randomUUID();
      const body = makePaymentEvent("payment.completed", makePaymentData({ id: paymentId }));
      const sig = signPayload(TEST_SECRET, body);
      await sendWebhook(actor, body, sig);

      expect(await actor.getLastEventType()).toEqual([`payment.completed`]);
      expect(await actor.getLastPaymentId()).toEqual([paymentId]);
    });

    test("payment.failed", async () => {
      const body = makePaymentEvent("payment.failed", makePaymentData({ status: "failed" }));
      const sig = signPayload(TEST_SECRET, body);
      await sendWebhook(actor, body, sig);

      expect(await actor.getLastEventType()).toEqual(["payment.failed"]);
    });

    test("payment.cancelled", async () => {
      const body = makePaymentEvent("payment.cancelled", makePaymentData({ status: "canceled" }));
      const sig = signPayload(TEST_SECRET, body);
      await sendWebhook(actor, body, sig);

      expect(await actor.getLastEventType()).toEqual(["payment.cancelled"]);
    });

    test("payment_intent.created", async () => {
      const intentId = crypto.randomUUID();
      const body = makePaymentEvent("payment_intent.created", makeIntentData({ id: intentId }));
      const sig = signPayload(TEST_SECRET, body);
      await sendWebhook(actor, body, sig);

      expect(await actor.getLastEventType()).toEqual(["payment_intent.created"]);
      expect(await actor.getLastPaymentId()).toEqual([intentId]);
    });

    test("unknown event type returns 200", async () => {
      const body = makePaymentEvent("account.updated", {});
      const sig = signPayload(TEST_SECRET, body);
      const response = await sendWebhook(actor, body, sig);

      expect(response.status_code).toBe(200);
      expect(await actor.getLastEventType()).toEqual(["account.updated"]);
    });
  });

  describe("Idempotency", () => {
    test("duplicate event ID returns 200 without re-processing", async () => {
      const body = makePaymentEvent("payment.completed", makePaymentData());
      const sig = signPayload(TEST_SECRET, body);

      const r1 = await sendWebhook(actor, body, sig);
      expect(r1.status_code).toBe(200);

      const firstId = await actor.getLastPaymentId();

      // Send different event but body has same event ID
      const r2 = await sendWebhook(actor, body, sig);
      expect(r2.status_code).toBe(200);

      // Payment ID should not have changed (event was skipped)
      expect(await actor.getLastPaymentId()).toEqual(firstId);
    });
  });

  describe("Error handling", () => {
    test("invalid JSON returns 400", async () => {
      const body = "not valid json {{{";
      const sig = signPayload(TEST_SECRET, body);
      const response = await sendWebhook(actor, body, sig);
      expect(response.status_code).toBe(400);
    });

    test("JSON without type field returns 400", async () => {
      const body = JSON.stringify({ data: { object: {} } });
      const sig = signPayload(TEST_SECRET, body);
      const response = await sendWebhook(actor, body, sig);
      expect(response.status_code).toBe(400);
    });

    test("payment event with missing required fields returns 400", async () => {
      const body = makePaymentEvent("payment.completed", { id: "p1" });
      const sig = signPayload(TEST_SECRET, body);
      const response = await sendWebhook(actor, body, sig);
      expect(response.status_code).toBe(400);
    });
  });
});
