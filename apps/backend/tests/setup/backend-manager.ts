import { type CanisterFixture, SubnetStateType } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";

import {
  initBackend,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
} from "@rabbithole/declarations";
import { BaseManager } from "@rabbithole/testing";

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
      await this.setupCanister<RabbitholeActorService>({
        idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
        wasm: RABBITHOLE_BACKEND_WASM_PATH,
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
    await this.pic.upgradeCanister({
      sender: this.ownerIdentity.getPrincipal(),
      canisterId: fixture.canisterId,
      wasm: RABBITHOLE_BACKEND_WASM_PATH,
      arg: IDL.encode(initBackend({ IDL }), [{ github: [] }]),
      upgradeModeOptions: {
        skip_pre_upgrade: [],
        wasm_memory_persistence: [{ keep: null }],
      },
    });
  }
}
