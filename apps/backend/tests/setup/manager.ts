import {
  type Actor,
  type ActorInterface,
  type CanisterFixture,
  type CreateCanisterOptions,
  createIdentity,
  type InstallCodeOptions,
  PocketIc,
  type SetupCanisterOptions,
  SubnetStateType,
} from "@dfinity/pic";
import { nonNullish } from "@dfinity/utils";
import { MANAGEMENT_CANISTER_ID } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { sha256 } from "@noble/hashes/sha2";
import { Blob } from "node:buffer";
import { readFile } from "node:fs/promises";
import { inject } from "vitest";

import {
  Account,
  type ChunkHash,
  type CMCActorService,
  cmcIdlFactory,
  type IcpLedgerActorService,
  icpLedgerIdlFactory,
  initBackend,
  type InstallChunkedCodeArgs,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
  type TransferResult
} from "@rabbithole/declarations";

import {
  CMC_CANISTER_ID,
  E8S_PER_ICP,
  GOVERNANCE_CANISTER_ID,
  ICP_LEDGER_CANISTER_ID,
  NNS_ROOT_CANISTER_ID,
  RABBITHOLE_BACKEND_WASM_PATH,
} from "./constants.ts";
import { NNS_STATE_PATH } from "./constants.ts";
import { minterIdentity } from "./nns/identity.ts";

type UploadChunkOrderId = {
  orderId: number;
};

type UploadChunkParams = {
  chunk: Blob;
} & UploadChunkOrderId;

type UploadChunkResult = {
  chunkHash: ChunkHash;
} & UploadChunkOrderId;

export class Manager {
  readonly applicationSubnetId: Principal;
  readonly cmcActor: Actor<CMCActorService>;
  readonly icpLedgerActor: Actor<IcpLedgerActorService>;
  readonly maxChunkSize = 1_048_576;
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

    this.icpLedgerActor.setIdentity(minterIdentity);
  }

  static async create(): Promise<Manager> {
    const pic = await PocketIc.create(inject("PIC_URL"), {
      nns: {
        state: {
          type: SubnetStateType.FromPath,
          path: NNS_STATE_PATH,
        },
      },
      system: [{ state: { type: SubnetStateType.New } }],
      application: [{ state: { type: SubnetStateType.New } }],
    });

    const applicationSubnets = await pic.getApplicationSubnets();
    await pic.setTime(new Date().getTime());
    await pic.tick();

    const identity = createIdentity("superSecretAlicePassword");

    // setup chrono router
    // we are not testing the router here, but we need it to spin up a pylon
    // pass time to allow router to setup slices
    await pic.advanceTime(240 * 60 * 1000);
    await pic.tick(240);

    // setup icp ledger
    const icpLedgerActor = pic.createActor<IcpLedgerActorService>(
      icpLedgerIdlFactory,
      ICP_LEDGER_CANISTER_ID,
    );

    // set identity as minter
    icpLedgerActor.setIdentity(minterIdentity);

    // mint ICP tokens
    await icpLedgerActor.icrc1_transfer({
      from_subaccount: [],
      to: {
        owner: identity.getPrincipal(),
        subaccount: [],
      } as unknown as Account,
      amount: BigInt(1_000_000) * E8S_PER_ICP,
      fee: [],
      memo: [],
      created_at_time: [],
    });

    // setup cmc actor
    const cmcActor = pic.createActor<CMCActorService>(
      cmcIdlFactory as unknown as IDL.InterfaceFactory,
      CMC_CANISTER_ID,
    );
    cmcActor.setIdentity(minterIdentity);

    return new Manager(
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

  // used for when a refresh is pending on a node
  async advanceBlocksAndTimeMinutes(mins: number): Promise<void> {
    const totalSeconds = mins * 60;
    const intervalSeconds = 20;
    const blocksPerInterval = 20; // 1 block per second for 20 seconds
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

  async initBackendCanister(): Promise<
    CanisterFixture<RabbitholeActorService>
  > {
    const canisterId = await this.pic.createCanister({
      sender: this.ownerIdentity.getPrincipal(),
      targetSubnetId: this.applicationSubnetId,
    });
    await this.installCode({
      canisterId,
      wasm: RABBITHOLE_BACKEND_WASM_PATH,
      sender: this.ownerIdentity.getPrincipal(),
      targetSubnetId: this.applicationSubnetId,
      arg: IDL.encode(initBackend({ IDL }), [{
        github: []
      }]),
    });
    const actor = this.pic.createActor<RabbitholeActorService>(
      rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      canisterId,
    );
    actor.setIdentity(this.ownerIdentity);

    // authorize storage deployer to create canisters on application subnet
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

  async installCode(options: InstallCodeOptions) {
    const wasmBytes: Uint8Array =
      options.wasm instanceof Uint8Array
        ? options.wasm
        : await readFile(options.wasm);
    if (wasmBytes.length > this.maxChunkSize) {
      await this.clearChunkStore(options.canisterId);
      const chunks = await this.wasmToChunks(wasmBytes);

      const chunkIds: UploadChunkResult[] = [];
      for await (const { chunk, orderId } of chunks) {
        const chunkHash = await this.uploadChunk(options.canisterId, chunk);
        chunkIds.push({ chunkHash, orderId });
      }

      const chunkHashesList = chunkIds
        .sort((a, b) => a.orderId - b.orderId)
        .map(({ chunkHash }) => chunkHash);

      return await this.installChunkedCode({
        arg: nonNullish(options.arg) ? options.arg : new Uint8Array(),
        target_canister: options.canisterId as any,
        chunk_hashes_list: chunkHashesList as Array<ChunkHash>,
        wasm_module_hash: sha256(wasmBytes),
        mode: { install: null },
        sender_canister_version: [],
        store_canister: [],
      });
    }

    return await this.pic.installCode(options);
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

  async upgradeBackendCanister(
    fixture: CanisterFixture<RabbitholeActorService>,
  ): Promise<void> {
    const wasmBytes = await readFile(RABBITHOLE_BACKEND_WASM_PATH);
    await this.clearChunkStore(fixture.canisterId);
    const chunks = await this.wasmToChunks(wasmBytes);
    const chunkIds: UploadChunkResult[] = [];
    for await (const { chunk, orderId } of chunks) {
      const chunkHash = await this.uploadChunk(fixture.canisterId, chunk);
      chunkIds.push({ chunkHash, orderId });
    }
    const chunkHashesList = chunkIds
      .sort((a, b) => a.orderId - b.orderId)
      .map(({ chunkHash }) => chunkHash);

    await this.installChunkedCode({
      arg: IDL.encode(initBackend({ IDL }), [{ github: [] }]),
      target_canister: fixture.canisterId as any,
      chunk_hashes_list: chunkHashesList as Array<ChunkHash>,
      wasm_module_hash: sha256(wasmBytes),
      mode: {
        upgrade: [
          {
            wasm_memory_persistence: [{ keep: null }],
            skip_pre_upgrade: [false],
          },
        ],
      },
      sender_canister_version: [],
      store_canister: [],
    });
  }

  private async clearChunkStore(canisterId: Principal): Promise<void> {
    await this.pic.updateCall({
      method: "clear_chunk_store",
      arg: IDL.encode(
        [IDL.Record({ canister_id: IDL.Principal })],
        [{ canister_id: canisterId }],
      ),
      canisterId: Principal.fromText(MANAGEMENT_CANISTER_ID),
      sender: this.ownerIdentity.getPrincipal(),
    });
  }

  private async installChunkedCode(args: InstallChunkedCodeArgs) {
    const canister_install_mode = IDL.Variant({
      reinstall: IDL.Null,
      upgrade: IDL.Opt(
        IDL.Record({
          wasm_memory_persistence: IDL.Opt(
            IDL.Variant({ keep: IDL.Null, replace: IDL.Null }),
          ),
          skip_pre_upgrade: IDL.Opt(IDL.Bool),
        }),
      ),
      install: IDL.Null,
    });

    const arg = IDL.encode(
      [
        IDL.Record({
          arg: IDL.Vec(IDL.Nat8),
          wasm_module_hash: IDL.Vec(IDL.Nat8),
          mode: canister_install_mode,
          chunk_hashes_list: IDL.Vec(IDL.Record({ hash: IDL.Vec(IDL.Nat8) })),
          target_canister: IDL.Principal,
          store_canister: IDL.Opt(IDL.Principal),
          sender_canister_version: IDL.Opt(IDL.Nat64),
        }),
      ],
      [args],
    );

    const subnetId = await this.pic.getCanisterSubnetId(args.target_canister as any);

    await this.pic.updateCall({
      method: "install_chunked_code",
      arg,
      canisterId: Principal.fromText(MANAGEMENT_CANISTER_ID),
      sender: this.ownerIdentity.getPrincipal(),
      targetSubnetId: subnetId ?? undefined,
    });
  }

  private async uploadChunk(
    canisterId: Principal,
    chunk: Blob,
  ): Promise<ChunkHash> {
    const arg = IDL.encode(
      [
        IDL.Record({
          chunk: IDL.Vec(IDL.Nat8),
          canister_id: IDL.Principal,
        }),
      ],
      [
        {
          chunk: new Uint8Array(await chunk.arrayBuffer()),
          canister_id: canisterId,
        },
      ],
    );

    const response = await this.pic.updateCall({
      method: "upload_chunk",
      arg,
      canisterId: Principal.fromText(MANAGEMENT_CANISTER_ID),
      sender: this.ownerIdentity.getPrincipal(),
    });

    const result = IDL.decode(
      [IDL.Record({ hash: IDL.Vec(IDL.Nat8) })],
      response,
    );

    const [hash] = result as unknown as [ChunkHash];

    return hash;
  }

  private async wasmToChunks(
    wasm: Uint8Array<ArrayBufferLike>,
  ): Promise<UploadChunkParams[]> {
    const blob = new Blob([wasm]);

    const uploadChunks: UploadChunkParams[] = [];

    // Split data into chunks
    let orderId = 0;
    for (let start = 0; start < blob.size; start += this.maxChunkSize) {
      const chunk = blob.slice(start, start + this.maxChunkSize);
      uploadChunks.push({
        chunk,
        orderId,
      });

      orderId++;
    }

    return uploadChunks;
  }
}
