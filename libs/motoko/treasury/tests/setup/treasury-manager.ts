import { type Actor, createIdentity, type DeferredActor } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { resolve } from "node:path";

import { BaseManager, minterIdentity } from "@rabbithole/testing";

import {
  idlFactory as evmRpcIdlFactory,
  init as evmRpcInit,
  type _SERVICE as EvmRpcService,
} from "../../declarations/evm_rpc/evm_rpc.did.js";
import {
  idlFactory as treasuryIdlFactory,
  init as treasuryInit,
  type _SERVICE as TreasuryService,
} from "../../declarations/treasury/treasury.did.js";
import {
  getEvmTxParams,
  sendErc20,
  signTransaction,
  waitForTx,
} from "./evm-signer";
import {
  fundWithSol,
  SOLANA_DEVNET_RPC,
} from "./sol-signer";

const ICRC1_LEDGER_WASM_PATH = resolve(
  import.meta.dirname,
  "wasm",
  "ic-icrc1-ledger.wasm.gz",
);

import {
  idlFactory as icrc1LedgerIdlFactory,
  init as icrc1LedgerInit,
  type _SERVICE as IcrcLedgerService,
} from "@rabbithole/declarations/icrc-ledger";
export { icrc1LedgerIdlFactory, icrc1LedgerInit, type IcrcLedgerService };

const CKUSDC_FEE = 10_000n; // 0.01 USDC (6 decimals)

const TREASURY_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "treasury",
  "treasury.wasm",
);

const EVM_RPC_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "evm_rpc",
  "evm_rpc.wasm.gz",
);

const SOL_RPC_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "sol_rpc",
  "sol_rpc.wasm.gz",
);

// ---- Base Sepolia testnet constants ----

/** Public RPC endpoint for Base Sepolia testnet. */
export const BASE_SEPOLIA_RPC = "https://base-sepolia-rpc.publicnode.com";

/** Chain ID for Base Sepolia testnet. */
export const BASE_SEPOLIA_CHAIN_ID = 84532n;

/** Official Circle USDC on Base Sepolia. */
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** Placeholder USDT on Base Sepolia (no official Circle contract). */
export const BASE_SEPOLIA_USDT = "0x0000000000000000000000000000000000000000";

/**
 * Deterministic test funder wallet (seed: sha256("rabbithole-treasury-test-funder-v1")).
 * Fund this address on Base Sepolia with ETH + USDC before running EVM tests.
 */
export const TEST_FUNDER_PRIVATE_KEY =
  "0x189aef4312a0e16ba3872119c9895aaf51f83b0b292b4107b09673b03fad974a";
export const TEST_FUNDER_ADDRESS =
  "0x7ba0edcc915019b7ff8d2e27f2f19be960c022af";

// ---- Solana Devnet testnet constants ----

/** SPL USDC mint on Solana Devnet (Circle's official devnet token). */
export const SOL_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Placeholder USDT mint on Solana Devnet (no official token). */
export const SOL_DEVNET_USDT_MINT = "11111111111111111111111111111111";

const DEFAULT_DISTRIBUTION_CONFIG = [
  {
    l1Bps: 1500n,
    l2Bps: 0n,
    minWithdraw: {
      icp: 10_000n,
      ckUsdc: 1_000n,
      ckUsdt: 1_000n,
      ckEth: 1_000_000_000_000n,
      baseEth: 1_000_000_000_000n,
      baseUsdc: 1_000n,
      baseUsdt: 1_000n,
      sol: 1_000_000n,
      solUsdc: 1_000n,
      solUsdt: 1_000n,
    },
  },
] as const;

export class TreasuryManager extends BaseManager {
  _ckUsdcCanisterId?: Principal;
  _nnsSubnetId?: Principal;
  readonly adminIdentity: ReturnType<typeof createIdentity>;
  readonly deferredTreasuryActor: DeferredActor<TreasuryService>;
  readonly evmRpcCanisterId?: Principal;
  readonly solRpcCanisterId?: Principal;

  readonly treasuryActor: Actor<TreasuryService>;

  readonly treasuryCanisterId: Principal;

  private constructor(
    base: BaseManager,
    treasuryActor: Actor<TreasuryService>,
    deferredTreasuryActor: DeferredActor<TreasuryService>,
    treasuryCanisterId: Principal,
    adminIdentity: ReturnType<typeof createIdentity>,
    evmRpcCanisterId?: Principal,
    solRpcCanisterId?: Principal,
  ) {
    super(
      base.pic,
      base.ownerIdentity,
      base.icpLedgerActor,
      base.cmcActor,
      base.applicationSubnetId,
    );
    this.treasuryActor = treasuryActor;
    this.deferredTreasuryActor = deferredTreasuryActor;
    this.treasuryCanisterId = treasuryCanisterId;
    this.adminIdentity = adminIdentity;
    this.evmRpcCanisterId = evmRpcCanisterId;
    this.solRpcCanisterId = solRpcCanisterId;
  }

  static override async create(): Promise<TreasuryManager> {
    const adminIdentity = createIdentity("treasury-admin");
    const base = await BaseManager.create();

    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          thresholdKeyName: "dfx_test_key",
          chains: [],
          distributionConfig: [],
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    const deferredActor = base.pic.createDeferredActor<TreasuryService>(
      treasuryIdlFactory,
      fixture.canisterId,
    );

    return new TreasuryManager(
      base,
      fixture.actor,
      deferredActor,
      fixture.canisterId,
      adminIdentity,
    );
  }

  /** Deploy ckUSDC ICRC-1 ledger on fiduciary subnet with mainnet canister ID. */
  static async createWithCkUsdc(): Promise<TreasuryManager> {
    const adminIdentity = createIdentity("treasury-admin");
    // Fiduciary subnet allows targetCanisterId for mainnet ckUSDC canister ID
    const base = await BaseManager.create({ fiduciary: true });

    // Get fiduciary subnet
    const fiduciarySubnet = await base.pic.getFiduciarySubnet();
    if (!fiduciarySubnet) throw new Error("Fiduciary subnet not found. Use BaseManager.create({ fiduciary: true })");

    // Deploy ckUSDC ICRC-1 ledger with mainnet canister ID on fiduciary subnet
    const ckUsdcCanisterId = Principal.fromText("xevnm-gaaaa-aaaar-qafnq-cai");
    const initArg = IDL.encode(icrc1LedgerInit({ IDL }), [
      {
        Init: {
          decimals: [6],
          token_symbol: "ckUSDC",
          transfer_fee: CKUSDC_FEE,
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
            controller_id: adminIdentity.getPrincipal(),
          },
          max_memo_length: [],
          index_principal: [],
          token_name: "Chain-Key USDC",
          feature_flags: [{ icrc2: true }],
        },
      },
    ]);

    await base.pic.setupCanister({
      targetCanisterId: ckUsdcCanisterId,
      targetSubnetId: fiduciarySubnet.id,
      wasm: ICRC1_LEDGER_WASM_PATH,
      idlFactory: icrc1LedgerIdlFactory,
      arg: initArg,
      sender: adminIdentity.getPrincipal(),
    });

    // Deploy treasury on application subnet (uses hardcoded ckUSDC canister ID from Const.mo)
    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          thresholdKeyName: "dfx_test_key",
          chains: [],
          distributionConfig: [],
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    const deferredActor = base.pic.createDeferredActor<TreasuryService>(
      treasuryIdlFactory,
      fixture.canisterId,
    );

    const manager = new TreasuryManager(
      base,
      fixture.actor,
      deferredActor,
      fixture.canisterId,
      adminIdentity,
    );
    manager._ckUsdcCanisterId = ckUsdcCanisterId;
    return manager;
  }

  /** Create TreasuryManager with EVM support (real evm_rpc canister). */
  static async createWithEvm(): Promise<TreasuryManager> {
    const adminIdentity = createIdentity("treasury-admin");
    // II subnet provides threshold ECDSA keys needed for EVM address derivation.
    // ingressMaxRetries raised for multi-step EVM calls (ECDSA sign + RPC outcalls).
    const base = await BaseManager.create({ ii: true, ingressMaxRetries: 500 });

    // Deploy the official evm_rpc canister
    const evmRpcFixture = await base.setupCanister<EvmRpcService>({
      idlFactory: evmRpcIdlFactory,
      wasm: EVM_RPC_WASM_PATH,
      arg: IDL.encode(evmRpcInit({ IDL }), [
        {
          demo: [true],
          manageApiKeys: [],
          logFilter: [],
          overrideProvider: [],
          nodesInSubnet: [1],
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    // Deploy treasury with Base EVM chain pointing to evm_rpc canister
    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          thresholdKeyName: "dfx_test_key",
          chains: [baseChainConfig(evmRpcFixture.canisterId.toText())],
          distributionConfig: DEFAULT_DISTRIBUTION_CONFIG,
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    const deferredActor = base.pic.createDeferredActor<TreasuryService>(
      treasuryIdlFactory,
      fixture.canisterId,
    );

    return new TreasuryManager(
      base,
      fixture.actor,
      deferredActor,
      fixture.canisterId,
      adminIdentity,
      evmRpcFixture.canisterId,
    );
  }

  /** Create TreasuryManager with both EVM and Solana support. */
  static async createWithEvmAndSol(): Promise<TreasuryManager> {
    const adminIdentity = createIdentity("treasury-admin");
    const base = await BaseManager.create({ ii: true, ingressMaxRetries: 500 });

    const evmRpcFixture = await base.setupCanister<EvmRpcService>({
      idlFactory: evmRpcIdlFactory,
      wasm: EVM_RPC_WASM_PATH,
      arg: IDL.encode(evmRpcInit({ IDL }), [
        {
          demo: [true],
          manageApiKeys: [],
          logFilter: [],
          overrideProvider: [],
          nodesInSubnet: [1],
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    const solRpcCanisterId = await base.pic.createCanister({
      sender: adminIdentity.getPrincipal(),
    });
    await base.pic.installCode({
      canisterId: solRpcCanisterId,
      wasm: SOL_RPC_WASM_PATH,
      arg: IDL.encode(
        [IDL.Record({ mode: IDL.Opt(IDL.Variant({ Demo: IDL.Null, Normal: IDL.Null })) })],
        [{ mode: [{ Demo: null }] }],
      ),
      sender: adminIdentity.getPrincipal(),
    });

    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          thresholdKeyName: "dfx_test_key",
          chains: [
            baseChainConfig(evmRpcFixture.canisterId.toText()),
            solanaDevnetChainConfig(solRpcCanisterId.toText()),
          ],
          distributionConfig: DEFAULT_DISTRIBUTION_CONFIG,
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    const deferredActor = base.pic.createDeferredActor<TreasuryService>(
      treasuryIdlFactory,
      fixture.canisterId,
    );

    return new TreasuryManager(
      base,
      fixture.actor,
      deferredActor,
      fixture.canisterId,
      adminIdentity,
      evmRpcFixture.canisterId,
      solRpcCanisterId,
    );
  }

  /** Create TreasuryManager with Solana support (real sol_rpc canister). */
  static async createWithSol(): Promise<TreasuryManager> {
    const adminIdentity = createIdentity("treasury-admin");
    // II subnet provides threshold Schnorr (Ed25519) keys needed for Solana address derivation.
    const base = await BaseManager.create({ ii: true, ingressMaxRetries: 500 });

    // Deploy the sol_rpc canister in Demo mode (no API keys required)
    const solRpcCanisterId = await base.pic.createCanister({
      sender: adminIdentity.getPrincipal(),
    });
    await base.pic.installCode({
      canisterId: solRpcCanisterId,
      wasm: SOL_RPC_WASM_PATH,
      arg: IDL.encode(
        [IDL.Record({ mode: IDL.Opt(IDL.Variant({ Demo: IDL.Null, Normal: IDL.Null })) })],
        [{ mode: [{ Demo: null }] }],
      ),
      sender: adminIdentity.getPrincipal(),
    });

    // Deploy treasury with Solana chain pointing to sol_rpc canister
    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          thresholdKeyName: "dfx_test_key",
          chains: [solanaDevnetChainConfig(solRpcCanisterId.toText())],
          distributionConfig: DEFAULT_DISTRIBUTION_CONFIG,
        },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    const deferredActor = base.pic.createDeferredActor<TreasuryService>(
      treasuryIdlFactory,
      fixture.canisterId,
    );

    return new TreasuryManager(
      base,
      fixture.actor,
      deferredActor,
      fixture.canisterId,
      adminIdentity,
      undefined,
      solRpcCanisterId,
    );
  }

  /**
   * Fund an EVM address with ETH from the test funder wallet on Base Sepolia.
   * Sends a real transaction, waits for it to be mined.
   */
  static async fundWithEth(
    toAddress: string,
    amountWei: bigint,
  ): Promise<string> {
    const rpcUrl = BASE_SEPOLIA_RPC;
    const { nonce, gasPrice } = await getEvmTxParams(rpcUrl, TEST_FUNDER_ADDRESS);
    const txHash = await signTransaction({
      rpcUrl,
      privateKey: TEST_FUNDER_PRIVATE_KEY,
      to: toAddress,
      value: amountWei,
      nonce,
      gasPrice,
      gasLimit: 21_000n,
      chainId: Number(BASE_SEPOLIA_CHAIN_ID),
    });
    await waitForTx(rpcUrl, txHash);
    return txHash;
  }

  /**
   * Fund a Solana address with SOL from the test funder wallet on Solana Devnet.
   * Sends a real transaction, waits for confirmation.
   */
  static async fundWithSol(
    toAddress: string,
    lamports: bigint,
  ): Promise<string> {
    return fundWithSol(toAddress, lamports);
  }

  /**
   * Fund an EVM address with ERC-20 tokens (USDC) from the test funder wallet on Base Sepolia.
   * Sends a real transaction, waits for it to be mined.
   */
  static async fundWithUsdc(
    toAddress: string,
    amount: bigint,
  ): Promise<string> {
    const rpcUrl = BASE_SEPOLIA_RPC;
    const { nonce, gasPrice } = await getEvmTxParams(rpcUrl, TEST_FUNDER_ADDRESS);
    const txHash = await sendErc20({
      rpcUrl,
      privateKey: TEST_FUNDER_PRIVATE_KEY,
      contract: BASE_SEPOLIA_USDC,
      to: toAddress,
      amount,
      nonce,
      gasPrice,
      chainId: Number(BASE_SEPOLIA_CHAIN_ID),
    });
    await waitForTx(rpcUrl, txHash);
    return txHash;
  }

  /** Get ckUSDC balance of a subaccount under the Treasury canister. */
  async getCkUsdcSubaccountBalance(userPrincipal: Principal): Promise<bigint> {
    if (!this._ckUsdcCanisterId) throw new Error("ckUSDC not deployed.");
    const ckUsdcActor = this.pic.createActor(icrc1LedgerIdlFactory, this._ckUsdcCanisterId);
    const subaccount = principalToSubAccount(userPrincipal);
    return ckUsdcActor.icrc1_balance_of({
      owner: this.treasuryCanisterId,
      subaccount: [subaccount],
    }) as Promise<bigint>;
  }

  /** Get ICP balance of a subaccount under the Treasury canister. */
  async getSubaccountBalance(principal: Principal): Promise<bigint> {
    const subaccount = principalToSubAccount(principal);
    return this.icpLedgerActor.icrc1_balance_of({
      owner: this.treasuryCanisterId,
      subaccount: [subaccount],
    });
  }

  /**
   * Get the treasury canister's derived EVM address.
   * Uses DeferredActor + ticks since getEvmAddress involves threshold ECDSA
   * (management canister call that needs PocketIC processing rounds).
   */
  async getTreasuryEvmAddress(): Promise<string> {
    this.deferredTreasuryActor.setIdentity(this.adminIdentity);
    const getResult =
      await this.deferredTreasuryActor.getEvmAddress();
    // Threshold ECDSA needs processing rounds
    for (let i = 0; i < 10; i++) {
      await this.pic.tick(2);
    }
    const address = await getResult();
    if (address.length === 0) {
      throw new Error("Treasury has no EVM address (evmConfig not set?)");
    }
    return address[0];
  }

  /**
   * Get the treasury canister's own EVM signing address (empty derivation path).
   * This is the address that signs distributePayment ERC-20 transfers.
   */
  async getTreasurySigningAddress(): Promise<string> {
    this.deferredTreasuryActor.setIdentity(this.adminIdentity);
    const getResult =
      await this.deferredTreasuryActor.getTreasurySigningAddress();
    for (let i = 0; i < 10; i++) {
      await this.pic.tick(2);
    }
    const address = await getResult();
    if (address.length === 0) {
      throw new Error("Treasury has no signing address (evmConfig not set?)");
    }
    return address[0];
  }
  /**
   * Get the treasury canister's derived Solana address for a caller.
   * Uses DeferredActor + ticks since getSolAddress involves threshold Schnorr
   * (management canister call that needs PocketIC processing rounds).
   */
  async getTreasurySolAddress(): Promise<string> {
    this.deferredTreasuryActor.setIdentity(this.adminIdentity);
    const getResult =
      await this.deferredTreasuryActor.getSolAddress();
    for (let i = 0; i < 10; i++) {
      await this.pic.tick(2);
    }
    const address = await getResult();
    if (address.length === 0) {
      throw new Error("Treasury has no SOL address (solConfig not set?)");
    }
    return address[0];
  }

  /**
   * Get the treasury canister's own Solana signing address (empty derivation path).
   * This is the address used to sign SOL/SPL transfers in distributePayment.
   */
  async getTreasurySolSigningAddress(): Promise<string> {
    this.deferredTreasuryActor.setIdentity(this.adminIdentity);
    const getResult =
      await this.deferredTreasuryActor.getTreasurySolSigningAddress();
    for (let i = 0; i < 10; i++) {
      await this.pic.tick(2);
    }
    const address = await getResult();
    if (address.length === 0) {
      throw new Error("Treasury has no SOL signing address (solConfig not set?)");
    }
    return address[0];
  }

  /** Mint ckUSDC to a user's subaccount on the Treasury canister. */
  async mintCkUsdcToUserSubaccount(userPrincipal: Principal, amount: bigint): Promise<void> {
    if (!this._ckUsdcCanisterId) throw new Error("ckUSDC not deployed. Use createWithCkUsdc().");
    const ckUsdcActor = this.pic.createActor(icrc1LedgerIdlFactory, this._ckUsdcCanisterId);
    ckUsdcActor.setIdentity(minterIdentity);
    const subaccount = principalToSubAccount(userPrincipal);
    const result = await ckUsdcActor.icrc1_transfer({
      to: { owner: this.treasuryCanisterId, subaccount: [subaccount] },
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
      amount,
    });
    if (!("Ok" in (result as Record<string, unknown>))) {
      throw new Error(`mintCkUsdcToUserSubaccount failed: ${JSON.stringify(result)}`);
    }
  }

  /** Mint ICP to Treasury canister's default account (simulating ICPay deposit). */
  async mintToTreasury(amount: bigint): Promise<void> {
    this.icpLedgerActor.setIdentity(minterIdentity);
    const result = await this.icpLedgerActor.icrc1_transfer({
      to: { owner: this.treasuryCanisterId, subaccount: [] },
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
      amount,
    });
    if (!("Ok" in result)) {
      throw new Error(`mintToTreasury failed: ${JSON.stringify(result)}`);
    }
  }

  /** Mint ICP to a user's subaccount on the Treasury canister (simulating user deposit). */
  async mintToUserSubaccount(userPrincipal: Principal, amount: bigint): Promise<void> {
    const subaccount = principalToSubAccount(userPrincipal);
    this.icpLedgerActor.setIdentity(minterIdentity);
    const result = await this.icpLedgerActor.icrc1_transfer({
      to: { owner: this.treasuryCanisterId, subaccount: [subaccount] },
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
      amount,
    });
    if (!("Ok" in result)) {
      throw new Error(`mintToUserSubaccount failed: ${JSON.stringify(result)}`);
    }
  }
}

function baseChainConfig(evmRpcCanisterId: string) {
  return {
    Evm: {
      networkId: "base-sepolia",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      evmRpcCanisterId,
      rpcUrls: [BASE_SEPOLIA_RPC],
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
          locator: { Contract: BASE_SEPOLIA_USDC },
        },
        {
          tokenId: { BaseUSDT: null },
          symbol: "USDT",
          decimals: 6,
          locator: { Contract: BASE_SEPOLIA_USDT },
        },
      ],
    },
  };
}

function solanaDevnetChainConfig(solRpcCanisterId: string) {
  return {
    Solana: {
      networkId: "devnet",
      solRpcCanisterId,
      rpcUrl: [SOLANA_DEVNET_RPC],
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
          locator: { Mint: SOL_DEVNET_USDC_MINT },
        },
        {
          tokenId: { SolUSDT: null },
          symbol: "USDT",
          decimals: 6,
          locator: { Mint: SOL_DEVNET_USDT_MINT },
        },
      ],
    },
  };
}
