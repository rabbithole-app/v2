import { type CanisterFixture, SubnetStateType } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";

import {
  initBackend,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
} from "@rabbithole/declarations";
import {
  BaseManager,
  setupChunkedCanister,
  upgradeChunkedCanister,
} from "@rabbithole/testing";

import {
  CMC_CANISTER_ID,
  GOVERNANCE_CANISTER_ID,
  RABBITHOLE_BACKEND_WASM_PATH,
} from "./constants.ts";

export class BackendManager extends BaseManager {
  static override async create(): Promise<BackendManager> {
    const base = await BaseManager.create({
      system: [{ state: { type: SubnetStateType.New } }],
    });

    // Chrono router advancement — backend-specific setup.
    // We are not testing the router here, but we need it to spin up a pylon.
    await base.pic.advanceTime(240 * 60 * 1000);
    await base.pic.tick(240);

    return new BackendManager(
      base.pic,
      base.ownerIdentity,
      base.icpLedgerActor,
      base.cmcActor,
      base.applicationSubnetId,
    );
  }

  async initBackendCanister(): Promise<
    CanisterFixture<RabbitholeActorService>
  > {
    const { actor, canisterId } =
      await setupChunkedCanister<RabbitholeActorService>({
        pic: this.pic,
        sender: this.ownerIdentity,
        idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
        wasmPath: RABBITHOLE_BACKEND_WASM_PATH,
        arg: IDL.encode(initBackend({ IDL }), [{ github: [] }]),
      });

    actor.setIdentity(this.ownerIdentity);

    // Authorize storage deployer to create canisters on application subnet
    await this.pic.updateCall({
      canisterId: CMC_CANISTER_ID,
      sender: GOVERNANCE_CANISTER_ID,
      method: "set_authorized_subnetwork_list",
      arg: IDL.encode(
        [
          IDL.Record({
            who: IDL.Opt(IDL.Principal),
            subnets: IDL.Vec(IDL.Principal),
          }),
        ],
        [
          {
            who: [canisterId],
            subnets: [this.applicationSubnetId],
          },
        ],
      ),
    });

    return { actor, canisterId };
  }

  async upgradeBackendCanister(
    fixture: CanisterFixture<RabbitholeActorService>,
  ): Promise<void> {
    await upgradeChunkedCanister({
      pic: this.pic,
      sender: this.ownerIdentity,
      canisterId: fixture.canisterId,
      wasmPath: RABBITHOLE_BACKEND_WASM_PATH,
      arg: IDL.encode(initBackend({ IDL }), [{ github: [] }]),
    });
  }
}
