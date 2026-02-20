import { resolve } from "node:path";

export { CMC_CANISTER_ID, E8S_PER_ICP, GOVERNANCE_CANISTER_ID, ICP_LEDGER_CANISTER_ID, ICP_TRANSACTION_FEE, NNS_ROOT_CANISTER_ID, NNS_STATE_PATH, ONE_TRILLION } from "@rabbithole/testing";

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
