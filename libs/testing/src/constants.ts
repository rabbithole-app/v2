import { Principal } from "@icp-sdk/core/principal";
import { resolve } from "node:path";

export const GOVERNANCE_CANISTER_ID = Principal.fromText(
  "rrkah-fqaaa-aaaaa-aaaaq-cai",
);

export const ICP_LEDGER_CANISTER_ID = Principal.fromText(
  "ryjl3-tyaaa-aaaaa-aaaba-cai",
);

export const NNS_ROOT_CANISTER_ID = Principal.fromText(
  "r7inp-6aaaa-aaaaa-aaabq-cai",
);

export const CMC_CANISTER_ID = Principal.fromText(
  "rkp4c-7iaaa-aaaaa-aaaca-cai",
);

export const ICP_TRANSACTION_FEE = 10_000n;
export const E8S_PER_ICP = 100_000_000n;
export const ONE_TRILLION = 1_000_000_000_000n;

export const NNS_STATE_PATH = resolve(
  import.meta.dirname,
  "state",
  "nns_state",
);
