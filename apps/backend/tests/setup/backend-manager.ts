import { type CanisterFixture, createIdentity, type DeferredActor, SubnetStateType } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

import {
  IcrcIcrc1Service,
  idlFactoryEvmRpc,
  idlFactoryIcrcLedger,
  idlFactoryXrcMock,
  initBackend,
  initEvmRpc,
  initIcrcLedger,
  initXrc,
  type RabbitholeActorService,
  rabbitholeIdlFactory,
} from "@rabbithole/declarations";
import { BaseManager, minterIdentity } from "@rabbithole/testing";

import {
  BACKEND_ENVIRONMENT_VARIABLES,
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

export interface BackendInitConfig {
  chains?: Array<Record<string, unknown>>;
}

export class BackendManager extends BaseManager {
  /**
   * Fixed treasury subaccount — mirrors `libs/motoko/treasury/src/Const.mo`
   * `treasurySubaccount()`. Layout: [0x00, "treasury" (8 bytes), 23 × 0].
   */
  static readonly TREASURY_SUBACCOUNT: Uint8Array = new Uint8Array([
    0x00, 0x74, 0x72, 0x65, 0x61, 0x73, 0x75, 0x72, 0x79,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
  ]);
  get backendCanisterId(): Principal {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    return this._backendCanisterId;
  }
  get evmRpcCanisterId(): Principal {
    if (!this._evmRpcCanisterId) throw new Error("Call deployEvmRpc first");
    return this._evmRpcCanisterId;
  }

  get solRpcCanisterId(): Principal {
    if (!this._solRpcCanisterId) throw new Error("Call deploySolRpc first");
    return this._solRpcCanisterId;
  }

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

    return new BackendManager(
      base.pic,
      base.ownerIdentity,
      base.icpLedgerActor,
      base.cmcActor,
      base.applicationSubnetId,
    );
  }

  /** Create a DeferredActor for calls that trigger HTTPS outcalls. */
  createDeferredBackendActor(): DeferredActor<RabbitholeActorService> {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    return this.pic.createDeferredActor<RabbitholeActorService>(
      rabbitholeIdlFactory as unknown as IDL.InterfaceFactory,
      this._backendCanisterId,
    );
  }

  /** Create a typed ICRC-1 ledger actor */
  createIcrcLedgerActor(canisterId: Principal) {
    return this.pic.createActor<IcrcIcrc1Service>(idlFactoryIcrcLedger, canisterId);
  }

  /** Deploy ckETH ledger (18 decimals) */
  async deployCkEthLedger() {
    await this.deployIcrc1Ledger({
      canisterId: CKETH_CANISTER_ID,
      symbol: "ckETH",
      name: "Chain-Key Ether",
      decimals: 18,
      fee: 2_000_000_000_000n, // 0.000002 ETH
    });
  }

  /** Deploy ckUSDC ledger (6 decimals, 0.01 fee) */
  async deployCkUsdcLedger() {
    await this.deployIcrc1Ledger({
      canisterId: CKUSDC_CANISTER_ID,
      symbol: "ckUSDC",
      name: "Chain-Key USDC",
      decimals: 6,
      fee: 10_000n,
    });
  }

  /** Deploy the evm_rpc canister in Demo mode. Requires II subnet. */
  async deployEvmRpc(): Promise<Principal> {
    const fixture = await this.pic.setupCanister({
      idlFactory: idlFactoryEvmRpc,
      wasm: EVM_RPC_WASM_PATH,
      arg: IDL.encode(initEvmRpc({ IDL }), [{
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

  /** Deploy an ICRC-1 ledger as a mock for ckUSDC, ckETH, etc. */
  async deployIcrc1Ledger(opts: {
    canisterId: Principal;
    decimals: number;
    fee: bigint;
    name: string;
    symbol: string;
  }) {
    const initArg = IDL.encode(initIcrcLedger({ IDL }), [
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
      idlFactory: idlFactoryIcrcLedger,
      arg: initArg,
      sender: this.ownerIdentity.getPrincipal(),
    });
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

  /** Deploy the XRC mock canister with a default rate. */
  async deployXrcMock(rate = 10_000_000_000n) {
    await this.pic.setupCanister({
      idlFactory: idlFactoryXrcMock,
      wasm: XRC_MOCK_WASM_PATH,
      targetCanisterId: XRC_CANISTER_ID,
      arg: IDL.encode(initXrc({ IDL }), [
        {
          response: {
            ExchangeRate: {
              base_asset: [],
              quote_asset: [],
              metadata: [
                {
                  decimals: 9,
                  base_asset_num_received_rates: 5n,
                  base_asset_num_queried_sources: 5n,
                  quote_asset_num_received_rates: 5n,
                  quote_asset_num_queried_sources: 5n,
                  standard_deviation: 0n,
                  forex_timestamp: [],
                },
              ],
              rate,
            },
          },
        },
      ]),
    });
    await this.pic.addCycles(XRC_CANISTER_ID, 10_000_000_000_000n);
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
        environmentVariables: BACKEND_ENVIRONMENT_VARIABLES,
        arg: IDL.encode(initBackend({ IDL }), [{
          icpaySecretKey: [],
          chains: config?.chains ?? [],
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

  /** Mint ICRC-1 tokens to the backend's treasury subaccount (unified
   *  ICP pool for CMC top-ups + ambassador payouts + refunds). */
  async mintToTreasurySubaccount(
    ledgerCanisterId: Principal,
    amount: bigint,
  ) {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    const ledgerActor = this.pic.createActor<IcrcIcrc1Service>(
      idlFactoryIcrcLedger,
      ledgerCanisterId,
    );
    ledgerActor.setIdentity(minterIdentity);
    const result = await ledgerActor.icrc1_transfer({
      to: { owner: this._backendCanisterId, subaccount: [BackendManager.TREASURY_SUBACCOUNT] },
      fee: [], memo: [], from_subaccount: [], created_at_time: [],
      amount,
    });
    if ("Err" in result) throw new Error(`Mint to treasury failed: ${JSON.stringify(result.Err)}`);
  }

  /** Mint ICRC-1 tokens to a user's subaccount on the backend canister */
  async mintToUserSubaccount(
    ledgerCanisterId: Principal,
    userPrincipal: Principal,
    amount: bigint,
  ) {
    if (!this._backendCanisterId) throw new Error("Call initBackendCanister first");
    const ledgerActor = this.pic.createActor<IcrcIcrc1Service>(
      idlFactoryIcrcLedger,
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

  async upgradeBackendCanister(fixture: CanisterFixture<RabbitholeActorService>) {
    await this.pic.upgradeCanister({
      sender: this.ownerIdentity.getPrincipal(),
      canisterId: fixture.canisterId,
      wasm: RABBITHOLE_BACKEND_WASM_PATH,
      arg: IDL.encode(initBackend({ IDL }), [{
        icpaySecretKey: [],
        chains: [],
      }]),
      upgradeModeOptions: {
        skip_pre_upgrade: [],
        wasm_memory_persistence: [{ keep: null }],
      },
    });
  }
}

function buildBaseChainConfig(config: {
  chainId: bigint;
  evmRpcCanisterId: string;
  rpcUrls: string[];
  usdcContract: string;
  usdtContract: string;
}) {
  return {
    Evm: {
      networkId: "base-sepolia",
      chainId: config.chainId,
      evmRpcCanisterId: config.evmRpcCanisterId,
      rpcUrls: config.rpcUrls,
      assets: [
        {
          tokenId: { BaseETH: null },
          symbol: "ETH",
          decimals: 18,
          locator: { Native: null },
        },
        {
          tokenId: { BaseUSDC: null },
          symbol: "USDC",
          decimals: 6,
          locator: { Contract: config.usdcContract },
        },
        {
          tokenId: { BaseUSDT: null },
          symbol: "USDT",
          decimals: 6,
          locator: { Contract: config.usdtContract },
        },
      ],
    },
  };
}

function buildSolanaChainConfig(config: {
  rpcUrl: string[];
  solRpcCanisterId: string;
  usdcMint: string;
  usdtMint: string;
}) {
  return {
    Solana: {
      networkId: "devnet",
      solRpcCanisterId: config.solRpcCanisterId,
      rpcUrl: config.rpcUrl.length > 0 ? [config.rpcUrl[0]] : [],
      assets: [
        {
          tokenId: { SOL: null },
          symbol: "SOL",
          decimals: 9,
          locator: { Native: null },
        },
        {
          tokenId: { SolUSDC: null },
          symbol: "USDC",
          decimals: 6,
          locator: { Mint: config.usdcMint },
        },
        {
          tokenId: { SolUSDT: null },
          symbol: "USDT",
          decimals: 6,
          locator: { Mint: config.usdtMint },
        },
      ],
    },
  };
}

export { buildBaseChainConfig, buildSolanaChainConfig };
