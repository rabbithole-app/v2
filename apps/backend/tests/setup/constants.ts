import { Principal } from "@icp-sdk/core/principal";
import { resolve } from "node:path";

export { CMC_CANISTER_ID, E8S_PER_ICP, GOVERNANCE_CANISTER_ID, ICP_LEDGER_CANISTER_ID, ICP_TRANSACTION_FEE, NNS_ROOT_CANISTER_ID, ONE_TRILLION_CYCLES } from "@rabbithole/testing";

export const XRC_CANISTER_ID = Principal.fromText("uf6dk-hyaaa-aaaaq-qaaaq-cai");
export const CASHIER_CANISTER_ID = Principal.fromText("xc7sj-uyaaa-aaaaf-qbrja-cai");
export const POCKETIC_THRESHOLD_KEY_NAME = "key_1";
export const BACKEND_ENVIRONMENT_VARIABLES = [
  { name: "PUBLIC_BLOB_STORAGE_CASHIER_CANISTER_ID", value: CASHIER_CANISTER_ID.toText() },
  { name: "THRESHOLD_KEY_NAME", value: POCKETIC_THRESHOLD_KEY_NAME },
  { name: "GITHUB_API_URL", value: "http://mock-server:8080" },
  { name: "GITHUB_OWNER", value: "user" },
  { name: "GITHUB_REPO", value: "repo" },
];

export function buildStorageEnvironmentVariables(
  backendId: Principal,
  vetKeyName = POCKETIC_THRESHOLD_KEY_NAME,
) {
  return [
    { name: "PUBLIC_CANISTER_ID:rabbithole-backend", value: backendId.toText() },
    { name: "VETKEY_NAME", value: vetKeyName },
    { name: "CAFFFEINE_STORAGE_CASHIER_PRINCIPAL", value: CASHIER_CANISTER_ID.toText() },
  ];
}

// icp-cli stores built artifacts as gzipped wasm files without extension,
// one per canister under .icp/cache/artifacts/<name>.
const ICP_ARTIFACTS_DIR = resolve(import.meta.dirname, "..", "..", ".icp", "cache", "artifacts");

export const RABBITHOLE_BACKEND_WASM_PATH = resolve(ICP_ARTIFACTS_DIR, "rabbithole-backend");
export const STORAGE_WASM_PATH = resolve(ICP_ARTIFACTS_DIR, "encrypted-storage");

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

// EVM/SOL RPC wasms are downloaded by icp-cli via pre-built + url: in icp.yaml
// and cached under apps/backend/.icp/cache/artifacts/.
export const EVM_RPC_WASM_PATH = resolve(ICP_ARTIFACTS_DIR, "evm_rpc");
export const SOL_RPC_WASM_PATH = resolve(ICP_ARTIFACTS_DIR, "sol_rpc");

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
