// Constants
export {
  CMC_CANISTER_ID,
  E8S_PER_ICP,
  GOVERNANCE_CANISTER_ID,
  ICP_LEDGER_CANISTER_ID,
  ICP_TRANSACTION_FEE,
  NNS_ROOT_CANISTER_ID,
  NNS_STATE_PATH,
  ONE_TRILLION,
} from "./constants.ts";

// HTTPS outcall proxy (for testing canisters that make external HTTP requests)
export { drainProxy, type DrainProxyOptions, proxyHttpsOutcalls, runWithProxy } from "./https-outcall-proxy.ts";

// Base test manager (NNS/PocketIC infrastructure)
export { BaseManager, type CreateManagerOptions } from "./manager.ts";

// NNS minter identity (for ICP ledger operations in tests)
export { minterIdentity } from "./nns-identity.ts";
