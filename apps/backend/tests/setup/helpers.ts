import {
  type CanisterFixture,
  createIdentity,
  PocketIc,
} from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { inject } from "vitest";

import {
  initBackend,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
} from "@rabbithole/declarations";

import { CASHIER_CANISTER_ID } from "./constants";

export const WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "rabbithole-backend",
  "rabbithole-backend.wasm.gz",
);

export const ownerIdentity = createIdentity("owner");
export const userAlice = createIdentity("alice");
export const userBob = createIdentity("bob");
export const userCharlie = createIdentity("charlie");

export async function createPic(): Promise<
  [PocketIc, CanisterFixture<RabbitholeActorService>]
> {
  const pic = await PocketIc.create(inject("PIC_URL"));
  const fixture = await pic.setupCanister<RabbitholeActorService>({
    wasm: WASM_PATH,
    sender: ownerIdentity.getPrincipal(),
    idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
    arg: IDL.encode(initBackend({ IDL }), [{
      thresholdKeyName: 'dfx_test_key',
      github: [],
      icpaySecretKey: [],
      chains: [],
      cashierCanisterId: CASHIER_CANISTER_ID,
    }]),
  });
  await pic.tick();
  return [pic, fixture];
}

/** ICPay webhook test secret */
export const ICPAY_SECRET = "test-webhook-secret-key-for-testing";

/** Create PocketIC with ICPay webhook support */
export async function createPicWithWebhook(): Promise<
  [PocketIc, CanisterFixture<RabbitholeActorService>]
> {
  const pic = await PocketIc.create(inject("PIC_URL"));
  const secretBytes = new TextEncoder().encode(ICPAY_SECRET);
  const fixture = await pic.setupCanister<RabbitholeActorService>({
    wasm: WASM_PATH,
    sender: ownerIdentity.getPrincipal(),
    idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
    arg: IDL.encode(initBackend({ IDL }), [{
      thresholdKeyName: 'dfx_test_key',
      github: [],
      icpaySecretKey: [Array.from(secretBytes)],
      chains: [],
      cashierCanisterId: CASHIER_CANISTER_ID,
    }]),
  });
  await pic.tick();
  return [pic, fixture];
}

/** Create a payment.completed webhook event payload */
export function makePaymentCompletedEvent(overrides: {
  amount?: bigint;
  network?: string;
  paymentId?: string;
  purpose?: string;
  userId?: string;
}): string {
  const eventId = `evt_${Math.random().toString(36).slice(2, 14)}`;
  return JSON.stringify({
    id: eventId,
    object: "event",
    api_version: "2025-08-11",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: overrides.paymentId ?? `pay_${Math.random().toString(36).slice(2, 14)}`,
        status: "completed",
        amount: String(overrides.amount ?? 990000n),
        ledgerCanisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
        accountId: "acc_test",
        metadata: {
          purpose: overrides.purpose ?? "deposit",
          userId: overrides.userId ?? "aaaaa-aa",
        },
        requestedAmount: String(overrides.amount ?? 990000n),
        paidAmount: String(overrides.amount ?? 990000n),
        network: overrides.network ?? "ic",
        token: "ICP",
        createdAt: new Date().toISOString(),
      },
      previous_attributes: {},
    },
    type: "payment.completed",
    livemode: false,
  });
}

/** Sign a webhook payload with HMAC-SHA256 */
export function signWebhookPayload(secret: string, body: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${body}`;
  const hex = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${ts},v1=${hex}`;
}
