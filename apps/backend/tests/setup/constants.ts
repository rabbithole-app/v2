import { Principal } from "@icp-sdk/core/principal";
import { resolve } from "node:path";

export { CMC_CANISTER_ID, E8S_PER_ICP, GOVERNANCE_CANISTER_ID, ICP_LEDGER_CANISTER_ID, ICP_TRANSACTION_FEE, NNS_ROOT_CANISTER_ID, NNS_STATE_PATH, ONE_TRILLION_CYCLES } from "@rabbithole/testing";

export const XRC_CANISTER_ID = Principal.fromText("uf6dk-hyaaa-aaaaq-qaaaq-cai");
export const CASHIER_CANISTER_ID = Principal.fromText("xc7sj-uyaaa-aaaaf-qbrja-cai");

export const RABBITHOLE_BACKEND_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "rabbithole-backend",
  "rabbithole-backend.wasm.gz",
);

export const STORAGE_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "encrypted-storage",
  "encrypted-storage.wasm.gz",
);

export const STORAGE_FRONTEND_ARCHIVE_PATH = resolve(
  import.meta.dirname,
  "..",
  "fixtures",
  "minimal-frontend.tar",
);

export const STORAGE_FRONTEND_V2_ARCHIVE_PATH = resolve(
  import.meta.dirname,
  "..",
  "fixtures",
  "minimal-frontend-v2.tar",
);

export const XRC_MOCK_WASM_PATH = resolve(
  import.meta.dirname,
  "wasm",
  "xrc_mock.wasm.gz",
);

export const ICRC1_LEDGER_WASM_PATH = resolve(
  import.meta.dirname,
  "wasm",
  "ic-icrc1-ledger.wasm.gz",
);

export const CKUSDC_CANISTER_ID = Principal.fromText("xevnm-gaaaa-aaaar-qafnq-cai");
export const CKETH_CANISTER_ID = Principal.fromText("ss2fx-dyaaa-aaaar-qacoq-cai");

// EVM/SOL RPC canister WASMs (built by treasury's dfx build)
export const EVM_RPC_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "libs",
  "motoko",
  "treasury",
  ".dfx",
  "local",
  "canisters",
  "evm_rpc",
  "evm_rpc.wasm.gz",
);

export const SOL_RPC_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "libs",
  "motoko",
  "treasury",
  ".dfx",
  "local",
  "canisters",
  "sol_rpc",
  "sol_rpc.wasm.gz",
);

// XRC mock inflated rates (9 decimals) for minimal testnet token usage
// ETH=$10M → $9.90 Pro charge = ~990_000_000_000 wei (dust)
export const INFLATED_ETH_RATE = 10_000_000_000_000_000n;
// SOL=$1M → $9.90 Pro charge = ~9_900_000 lamports (~0.01 SOL)
export const INFLATED_SOL_RATE = 1_000_000_000_000_000n;

// EVM testnet constants and funding helpers (via subpath import)
export {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_RPC,
  BASE_SEPOLIA_USDC,
  BASE_SEPOLIA_USDT,
  fundWithEth,
  fundWithUsdc,
} from "@rabbithole/testing/evm";

// Solana constants (no @solana/web3.js dependency)
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const SOL_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const SOL_DEVNET_USDT_MINT = "11111111111111111111111111111111";
// For fundWithSol(), import from "@rabbithole/testing/sol-signer"
