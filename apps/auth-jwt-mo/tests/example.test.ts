import {
  type Actor,
  type CanisterFixture,
  createIdentity,
  PocketIc,
  SubnetStateType,
} from "@dfinity/pic";
import { Principal } from "@icp-sdk/core/principal";
// jose v5 is being used, as v6 has removed support for ES256K (secp256k1)
// which is necessary for verifying JWT tokens with an Internet Computer
import { importJWK, jwtVerify } from "jose";
import { resolve } from "node:path";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  inject,
  test,
} from "vitest";

// Import generated types for your canister
import {
  type _SERVICE,
  idlFactory,
  type Result,
  type Tokens,
} from "../declarations/example/example.did.js";
import { setupChunkedCanister } from "./ic-management.utils.js";

function isOkResult(result: Result): result is Extract<Result, { ok: Tokens }> {
  return Object.keys(result)[0] === "ok";
}

// Define the path to your canister's WASM file
export const WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  ".dfx",
  "local",
  "canisters",
  "example",
  "example.wasm",
);

const ownerIdentity = createIdentity("owner");

async function createPic(): Promise<[PocketIc, CanisterFixture<_SERVICE>]> {
  // create a new PocketIC instance
  const pic = await PocketIc.create(inject("PIC_URL"), {
    ii: {
      state: {
        type: SubnetStateType.New,
      },
    },
  });

  // Setup the canister and actor
  const fixture = await setupChunkedCanister<_SERVICE>({
    pic,
    wasmPath: WASM_PATH,
    sender: ownerIdentity,
    idlFactory,
  });

  // next block to init ecdsa keypair in the canister
  await pic.tick();

  return [pic, fixture];
}

describe("AuthJWT", () => {
  let pic: PocketIc;
  let canisterId: Principal;
  let actor: Actor<_SERVICE>;

  beforeEach(async () => {
    const [picInstance, fixture] = await createPic();
    pic = picInstance;

    // Save the actor and canister ID for use in tests
    actor = fixture.actor;
    canisterId = fixture.canisterId;
    actor.setIdentity(ownerIdentity);
  });

  afterEach(async () => {
    // tear down the PocketIC instance
    await pic?.tearDown();
  });

  test("should return valid token", async () => {
    const date = new Date();
    await pic.setTime(date);
    const result = await actor.authorize();
    assert(isOkResult(result));
    const jwkJson = await actor.getEcdsaPublicKey();
    const jwk = JSON.parse(jwkJson);
    // jose v5 supports ES256K
    const algorithm = "ES256K";
    const ecPublicKey = await importJWK(jwk, algorithm);
    const subject = ownerIdentity.getPrincipal().toText();
    const verifyResult = await jwtVerify(result.ok.accessToken, ecPublicKey, {
      subject: ownerIdentity.getPrincipal().toText(),
      algorithms: ["ES256K"],
    });
    expect(verifyResult.payload.sub).toEqual(subject);
    expect(verifyResult.payload.exp).toBeGreaterThan(date.getTime() / 1000);
  });
});
