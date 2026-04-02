import { type CanisterFixture, type Actor, type DeferredActor, SubnetStateType, createIdentity } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

import {
  initBackend,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
} from "@rabbithole/declarations";
import { BaseManager, minterIdentity } from "@rabbithole/testing";

import {
  CKETH_CANISTER_ID,
  CKUSDC_CANISTER_ID,
  CMC_CANISTER_ID,
  EVM_RPC_WASM_PATH,
  GOVERNANCE_CANISTER_ID,
  ICRC1_LEDGER_WASM_PATH,
  RABBITHOLE_BACKEND_WASM_PATH,
  SOL_RPC_WASM_PATH,
  XRC_CANISTER_ID,
  XRC_MOCK_WASM_PATH,
} from "./constants.ts";
import {
  xrcMockIdlFactory,
  encodeXrcMockInitArg,
} from "@rabbithole/declarations";
import {
  idlFactory as icrc1LedgerIdlFactory,
  init as icrc1LedgerInit,
  type _SERVICE as IcrcLedgerService,
} from "@rabbithole/declarations/icrc-ledger";
// @ts-expect-error — JS IDL factory without TS types
import { idlFactory as evmRpcIdlFactory, init as evmRpcInit } from "../../../../libs/motoko/treasury/declarations/evm_rpc/evm_rpc.did.js";

export interface BackendInitConfig {
  evmConfig?: {
    chainId: bigint;
    ecdsaKeyName: string;
    evmRpcCanisterId: string;
    usdcContract: string;
    usdtContract: string;
    rpcUrls: string[];
  };
  solConfig?: {
    schnorrKeyName: string;
    solRpcCanisterId: string;
    usdcMint: string;
    usdtMint: string;
    rpcUrl: string[];
  };
}

export class BackendManager extends BaseManager {
  private _backendCanisterId?: Principal;
  private _evmRpcCanisterId?: Principal;
  private _solRpcCanisterId?: Principal;

  static override async create(opts?: {
    fiduciary?: boolean;
    ii?: boolean;
    ingressMaxRetries?: number;
  }): Promise<BackendManager> {
    const base = await BaseManager.create({
      system: [{ state: { type: SubnetStateType.New } }],
      ...(opts?.fiduciary ? { fiduciary: true } : {}),
      ...(opts?.ii ? { ii: true } : {}),
      ...(opts?.ingressMaxRetries ? { ingressMaxRetries: opts.ingressMaxRetries } : {}),
    });

    // Chrono router advancement — backend-specific setup.
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

  /** Deploy the XRC mock canister with a default rate. */
  async deployXrcMock(defaultRate: bigint = 10_000_000_000n): Promise<void> {
    await this.pic.setupCanister({
      idlFactory: xrcMockIdlFactory,
      wasm: XRC_MOCK_WASM_PATH,
      targetCanisterId: XRC_CANISTER_ID,
      arg: encodeXrcMockInitArg(defaultRate),
    });
    await this.pic.addCycles(XRC_CANISTER_ID, 10_000_000_000_000);
  }

  /** Deploy an ICRC-1 ledger as a mock for ckUSDC, ckETH, etc. */
  async deployIcrc1Ledger(opts: {
    canisterId: Principal;
    symbol: string;
    name: string;
    decimals: number;
    fee: bigint;
  }): Promise<void> {
    const initArg = IDL.encode(icrc1LedgerInit({ IDL }), [
      {
        Init: {
          decimals: [opts.decimals],
          token_symbol: opts.symbol,
          transfer_fee: opts.fee,
          metadata: [],
          minting_account: { owner: minterIdentity.getPrincipal(), subaccount: [] },
          initial_balances: [],
          fee_collector_account: [],
          archive_options: {
            num_blocks_to_archive: 1000n,
            max_transactions_per_response: [],
            trigger_threshold: 2000n,
            more_controller_ids: [],
            max_message_size_bytes: [],
            cycles_for_archive_creation: [],
            node_max_memory_size_bytes: [],
            controller_id: this.ownerIdentity.getPrincipal(),
          },
          max_memo_length: [],
          index_principal: [],
          token_name: opts.name,
          feature_flags: [{ icrc2: true }],
        },
      },
    ]);

    // ckUSDC/ckETH require fiduciary subnet on mainnet
    const fiduciarySubnet = await this.pic.getFiduciarySubnet();
    await this.pic.setupCanister({
      targetCanisterId: opts.canisterId,
      ...(fiduciarySubnet ? { targetSubnetId: fiduciarySubnet.id } : {}),
      wasm: ICRC1_LEDGER_WASM_PATH,
      idlFactory: icrc1LedgerIdlFactory,
      arg: initArg,
      sender: this.ownerIdentity.getPrincipal(),
    });
  }

  /** Deploy ckUSDC ledger (6 decimals, 0.01 fee) */
  async deployCkUsdcLedger(): Promise<void> {
    await this.deployIcrc1Ledger({
      canisterId: CKUSDC_CANISTER_ID,
      symbol: "ckUSDC",
      name: "Chain-Key USDC",
      decimals: 6,
      fee: 10_000n,
    });
  }

  /** Deploy ckETH ledger (18 decimals) */
  async deployCkEthLedger(): Promise<void> {
    await this.deployIcrc1Ledger({
      canisterId: CKETH_CANISTER_ID,
      symbol: "ckETH",
      name: "Chain-Key Ether",
      decimals: 18,
      fee: 2_000_000_000_000n, // 0.000002 ETH
    });
  }

  /** Mint ICRC-1 tokens to a user's subaccount on the backend canister */
  async mintToUserSubaccount(
    ledgerCanisterId: Principal,
    userPrincipal: Principal,
    amount: bigint,
  ): Promise<void> {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    const ledgerActor = this.pic.createActor<IcrcLedgerService>(
      icrc1LedgerIdlFactory,
      ledgerCanisterId,
    );
    ledgerActor.setIdentity(minterIdentity);
    const subaccount = principalToSubAccount(userPrincipal);
    const result = await ledgerActor.icrc1_transfer({
      to: { owner: this._backendCanisterId, subaccount: [subaccount] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount,
    });
    if ("Err" in result) throw new Error(`Mint failed: ${JSON.stringify(result.Err)}`);
  }

  /** Create a typed ICRC-1 ledger actor */
  createIcrcLedgerActor(canisterId: Principal) {
    return this.pic.createActor<IcrcLedgerService>(icrc1LedgerIdlFactory, canisterId);
  }

  /** Deploy the evm_rpc canister in Demo mode. Requires II subnet. */
  async deployEvmRpc(): Promise<Principal> {
    const fixture = await this.pic.setupCanister({
      idlFactory: evmRpcIdlFactory as IDL.InterfaceFactory,
      wasm: EVM_RPC_WASM_PATH,
      arg: IDL.encode(evmRpcInit({ IDL }), [{
        demo: [true],
        manageApiKeys: [],
        logFilter: [],
        overrideProvider: [],
        nodesInSubnet: [1],
      }]),
      sender: this.ownerIdentity.getPrincipal(),
    });
    this._evmRpcCanisterId = fixture.canisterId;
    return fixture.canisterId;
  }

  /** Deploy the sol_rpc canister in Demo mode. Requires II subnet. */
  async deploySolRpc(): Promise<Principal> {
    const canisterId = await this.pic.createCanister({
      sender: this.ownerIdentity.getPrincipal(),
    });
    await this.pic.installCode({
      canisterId,
      wasm: SOL_RPC_WASM_PATH,
      arg: IDL.encode(
        [IDL.Record({ mode: IDL.Opt(IDL.Variant({ Demo: IDL.Null, Normal: IDL.Null })) })],
        [{ mode: [{ Demo: null }] }],
      ),
      sender: this.ownerIdentity.getPrincipal(),
    });
    this._solRpcCanisterId = canisterId;
    return canisterId;
  }

  get evmRpcCanisterId(): Principal {
    if (!this._evmRpcCanisterId) throw new Error("Call deployEvmRpc first");
    return this._evmRpcCanisterId;
  }

  get solRpcCanisterId(): Principal {
    if (!this._solRpcCanisterId) throw new Error("Call deploySolRpc first");
    return this._solRpcCanisterId;
  }

  /** Create a DeferredActor for calls that trigger HTTPS outcalls. */
  createDeferredBackendActor(): DeferredActor<RabbitholeActorService> {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    return this.pic.createDeferredActor<RabbitholeActorService>(
      rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      this._backendCanisterId,
    );
  }

  /**
   * Derive a user's EVM address via threshold ECDSA.
   * Uses DeferredActor + ticks for key derivation rounds.
   */
  async deriveEvmAddress(identity: ReturnType<typeof createIdentity>): Promise<string> {
    const deferred = this.createDeferredBackendActor();
    deferred.setIdentity(identity);
    const getResult = await deferred.getEvmAddress();
    for (let i = 0; i < 10; i++) await this.pic.tick(2);
    const address = await getResult();
    if (address.length === 0) throw new Error("No EVM address (evmConfig not set?)");
    return address[0];
  }

  /**
   * Derive a user's Solana address via threshold Schnorr.
   * Uses DeferredActor + ticks for key derivation rounds.
   */
  async deriveSolAddress(identity: ReturnType<typeof createIdentity>): Promise<string> {
    const deferred = this.createDeferredBackendActor();
    deferred.setIdentity(identity);
    const getResult = await deferred.getSolAddress();
    for (let i = 0; i < 10; i++) await this.pic.tick(2);
    const address = await getResult();
    if (address.length === 0) throw new Error("No SOL address (solConfig not set?)");
    return address[0];
  }

  async initBackendCanister(config?: BackendInitConfig): Promise<
    CanisterFixture<RabbitholeActorService>
  > {
    const { actor, canisterId } =
      await this.setupCanister<RabbitholeActorService>({
        idlFactory: rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
        wasm: RABBITHOLE_BACKEND_WASM_PATH,
        arg: IDL.encode(initBackend({ IDL }), [{
          github: [],
          icpaySecretKey: [],
          evmConfig: config?.evmConfig ? [config.evmConfig] : [],
          solConfig: config?.solConfig
            ? [{ ...config.solConfig, rpcUrl: config.solConfig.rpcUrl.length > 0 ? [config.solConfig.rpcUrl[0]] : [] }]
            : [],
        }]),
      });

    this._backendCanisterId = canisterId;
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

  get backendCanisterId(): Principal {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    return this._backendCanisterId;
  }

  async upgradeBackendCanister(
    fixture: CanisterFixture<RabbitholeActorService>,
  ): Promise<void> {
    await this.pic.upgradeCanister({
      sender: this.ownerIdentity.getPrincipal(),
      canisterId: fixture.canisterId,
      wasm: RABBITHOLE_BACKEND_WASM_PATH,
      arg: IDL.encode(initBackend({ IDL }), [{ github: [], icpaySecretKey: [], evmConfig: [], solConfig: [] }]),
      upgradeModeOptions: {
        skip_pre_upgrade: [],
        wasm_memory_persistence: [{ keep: null }],
      },
    });
  }
}
