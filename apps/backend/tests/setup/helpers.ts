import {
  type CanisterFixture,
  createIdentity,
  PocketIc,
} from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { resolve } from "node:path";
import { inject } from "vitest";

import {
  type RabbitholeActorService,
  initBackend,
  rabbitholeIdlFactory,
} from "@rabbithole/declarations";

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
    arg: IDL.encode(initBackend({ IDL }), [{ github: [] }]),
  });
  await pic.tick();
  return [pic, fixture];
}
