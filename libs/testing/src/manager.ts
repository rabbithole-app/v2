import {
  type Actor,
  type ActorInterface,
  type CreateCanisterOptions,
  createIdentity,
  PocketIc,
  type SetupCanisterOptions,
  type SubnetConfig,
  SubnetStateType,
} from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { inject } from "vitest";

import type {
  Account,
  CMCActorService,
  IcpLedgerActorService,
  TransferResult,
} from "@rabbithole/declarations";
import { cmcIdlFactory, icpLedgerIdlFactory } from "@rabbithole/declarations";

import {
  CMC_CANISTER_ID,
  E8S_PER_ICP,
  ICP_LEDGER_CANISTER_ID,
  NNS_ROOT_CANISTER_ID,
  NNS_STATE_PATH,
} from "./constants.ts";
import { minterIdentity } from "./nns-identity.ts";

export interface CreateManagerOptions {
  /** Initial ICP balance for owner in e8s (default: 1_000_000 * E8S_PER_ICP) */
  initialIcpBalance?: bigint;
  /** Owner identity (default: generated from "superSecretAlicePassword") */
  ownerIdentity?: ReturnType<typeof createIdentity>;
  /** Additional system subnets (default: none) */
  system?: SubnetConfig[];
}

export class BaseManager {
  readonly applicationSubnetId: Principal;
  readonly cmcActor: Actor<CMCActorService>;
  readonly icpLedgerActor: Actor<IcpLedgerActorService>;
  readonly ownerIdentity: ReturnType<typeof createIdentity>;
  readonly pic: PocketIc;

  protected constructor(
    pic: PocketIc,
    ownerIdentity: ReturnType<typeof createIdentity>,
    icpLedgerActor: Actor<IcpLedgerActorService>,
    cmcActor: Actor<CMCActorService>,
    applicationSubnetId: Principal,
  ) {
    this.pic = pic;
    this.ownerIdentity = ownerIdentity;
    this.icpLedgerActor = icpLedgerActor;
    this.cmcActor = cmcActor;
    this.applicationSubnetId = applicationSubnetId;
  }

  static async create(opts?: CreateManagerOptions): Promise<BaseManager> {
    const pic = await PocketIc.create(inject("PIC_URL"), {
      nns: {
        state: {
          type: SubnetStateType.FromPath,
          path: NNS_STATE_PATH,
        },
      },
      ...(opts?.system ? { system: opts.system } : {}),
      application: [{ state: { type: SubnetStateType.New } }],
    });

    const applicationSubnets = await pic.getApplicationSubnets();
    await pic.setTime(new Date().getTime());
    await pic.tick();

    const identity =
      opts?.ownerIdentity ?? createIdentity("superSecretAlicePassword");

    // Setup ICP ledger actor
    const icpLedgerActor = pic.createActor<IcpLedgerActorService>(
      icpLedgerIdlFactory,
      ICP_LEDGER_CANISTER_ID,
    );
    icpLedgerActor.setIdentity(minterIdentity);

    // Mint ICP tokens for owner
    const mintAmount =
      opts?.initialIcpBalance ?? BigInt(1_000_000) * E8S_PER_ICP;
    await icpLedgerActor.icrc1_transfer({
      from_subaccount: [],
      to: {
        owner: identity.getPrincipal(),
        subaccount: [],
      } as unknown as Account,
      amount: mintAmount,
      fee: [],
      memo: [],
      created_at_time: [],
    });

    // Setup CMC actor
    const cmcActor = pic.createActor<CMCActorService>(
      cmcIdlFactory as unknown as IDL.InterfaceFactory,
      CMC_CANISTER_ID,
    );
    cmcActor.setIdentity(minterIdentity);

    return new BaseManager(
      pic,
      identity,
      icpLedgerActor,
      cmcActor,
      applicationSubnets[0].id,
    );
  }

  async advanceBlocks(blocks: number): Promise<void> {
    await this.pic.tick(blocks);
  }

  async advanceBlocksAndTimeMinutes(mins: number): Promise<void> {
    const totalSeconds = mins * 60;
    const intervalSeconds = 20;
    const blocksPerInterval = 20;
    const rounds = Math.ceil(totalSeconds / intervalSeconds);

    for (let i = 0; i < rounds; i++) {
      const timeToAdvance = Math.min(
        intervalSeconds,
        totalSeconds - i * intervalSeconds,
      );
      await this.pic.advanceTime(timeToAdvance * 1000);
      await this.pic.tick(blocksPerInterval);
    }
  }

  async advanceTime(seconds: number): Promise<void> {
    await this.pic.advanceTime(seconds * 1000);
  }

  async afterAll(): Promise<void> {
    await this.pic.tearDown();
  }

  async createCanister(options?: CreateCanisterOptions) {
    return await this.pic.createCanister({
      sender: this.ownerIdentity.getPrincipal(),
      targetSubnetId: this.applicationSubnetId,
      ...(options ?? {}),
    });
  }

  async getCyclesBalance(canisterId: Principal): Promise<bigint> {
    return await this.pic.getCyclesBalance(canisterId);
  }

  async getMyBalances() {
    const account: Account = {
      owner: this.ownerIdentity.getPrincipal(),
      subaccount: [],
    } as unknown as Account;
    return await this.icpLedgerActor.icrc1_balance_of(account);
  }

  async getNow(): Promise<bigint> {
    const time = await this.pic.getTime();
    return BigInt(Math.trunc(time));
  }

  async sendIcp(to: Account, amount: bigint): Promise<TransferResult> {
    const txresp = await this.icpLedgerActor.icrc1_transfer({
      from_subaccount: [],
      to: to,
      amount,
      fee: [],
      memo: [],
      created_at_time: [],
    });

    if (!("Ok" in txresp)) {
      throw new Error("Transaction failed");
    }

    return txresp;
  }

  async setupCanister<T extends ActorInterface<T> = ActorInterface>(
    options: SetupCanisterOptions,
  ) {
    return await this.pic.setupCanister<T>({
      sender: this.ownerIdentity.getPrincipal(),
      targetSubnetId: this.applicationSubnetId,
      ...options,
    });
  }

  async startCanister(canisterId: Principal): Promise<void> {
    return await this.pic.startCanister({ canisterId });
  }

  async startCmcCanister(): Promise<void> {
    this.pic.startCanister({
      canisterId: CMC_CANISTER_ID,
      sender: NNS_ROOT_CANISTER_ID,
    });
  }

  async stopCanister(canisterId: Principal): Promise<void> {
    return await this.pic.stopCanister({ canisterId });
  }

  async stopCmcCanister(): Promise<void> {
    this.pic.stopCanister({
      canisterId: CMC_CANISTER_ID,
      sender: NNS_ROOT_CANISTER_ID,
    });
  }
}
