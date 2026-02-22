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
} from "./evm-signer.ts";
import {
  fundWithSol,
  SOLANA_DEVNET_RPC,
} from "./sol-signer";

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

export class TreasuryManager extends BaseManager {
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
          evmConfig: [],
          solConfig: [],
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

    // Deploy treasury with evmConfig pointing to evm_rpc canister
    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          evmConfig: [
            {
              chainId: BASE_SEPOLIA_CHAIN_ID,
              ecdsaKeyName: "dfx_test_key",
              evmRpcCanisterId: evmRpcFixture.canisterId.toText(),
              usdcContract: BASE_SEPOLIA_USDC,
              usdtContract: BASE_SEPOLIA_USDT,
              rpcUrls: [BASE_SEPOLIA_RPC],
            },
          ],
          solConfig: [],
          distributionConfig: [
            {
              l1Bps: 2000n, // 20%
              l2Bps: 500n, // 5%
              minWithdraw: {
                icp: 10_000n, // 0.0001 ICP
                ckUsdc: 1_000n, // $0.001
                ckUsdt: 1_000n,
                ckEth: 1_000_000_000_000n, // 0.000001 ETH
                baseEth: 1_000_000_000_000n,
                baseUsdc: 1_000n,
                baseUsdt: 1_000n,
                sol: 1_000_000n, // 0.001 SOL
                solUsdc: 1_000n,
                solUsdt: 1_000n,
              },
            },
          ],
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

    // Deploy treasury with solConfig pointing to sol_rpc canister
    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        {
          admin: adminIdentity.getPrincipal(),
          evmConfig: [],
          solConfig: [
            {
              schnorrKeyName: "dfx_test_key",
              solRpcCanisterId: solRpcCanisterId.toText(),
              usdcMint: SOL_DEVNET_USDC_MINT,
              usdtMint: SOL_DEVNET_USDT_MINT,
              rpcUrl: [SOLANA_DEVNET_RPC],
            },
          ],
          distributionConfig: [
            {
              l1Bps: 2000n, // 20%
              l2Bps: 500n, // 5%
              minWithdraw: {
                icp: 10_000n,
                ckUsdc: 1_000n,
                ckUsdt: 1_000n,
                ckEth: 1_000_000_000_000n,
                baseEth: 1_000_000_000_000n,
                baseUsdc: 1_000n,
                baseUsdt: 1_000n,
                sol: 1_000_000n, // 0.001 SOL
                solUsdc: 1_000n,
                solUsdt: 1_000n,
              },
            },
          ],
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
}
