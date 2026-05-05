/**
 * Re-export EVM signer utilities from the shared testing library.
 */
export {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_RPC,
  BASE_SEPOLIA_USDC,
  BASE_SEPOLIA_USDT,
  encodeErc20Transfer,
  fundWithEth,
  fundWithUsdc,
  getEvmTxParams,
  sendErc20,
  signTransaction,
  TEST_FUNDER_ADDRESS,
  TEST_FUNDER_PRIVATE_KEY,
  waitForTx,
} from "@rabbithole/testing/evm";
