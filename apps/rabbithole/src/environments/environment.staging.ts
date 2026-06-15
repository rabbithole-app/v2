import {
  BACKEND_CANISTER_ID,
  BLOB_STORAGE_CASHIER_CANISTER_ID,
  BLOB_STORAGE_GATEWAY_URL,
  ENV_NAME,
  EVM_RPC_URL,
  FRONTEND_CANISTER_ID,
  HTTP_AGENT_HOST,
  ICPAY_API_URL,
  ICPAY_PUBLISHABLE_KEY,
  SOL_RPC_URL,
  STORAGE_LICENSE_INCLUDED_BYTES,
  STORAGE_LICENSE_MAX_FILE_BYTES,
} from '@rabbithole/core/app-runtime';

export const environment = {
  identityProviderUrl: 'https://id.ai/authorize',
  identitySignerCanisterId: 'rdmx6-jaaaa-aaaaa-aaadq-cai',
  appUrl: `https://${FRONTEND_CANISTER_ID}.icp0.io`,
  appName: 'Rabbithole',
  openIdProviders: ['google', 'apple', 'microsoft'] as const,
  httpAgentHost: HTTP_AGENT_HOST,
  evmRpcUrl: EVM_RPC_URL,
  solanaRpcUrl: SOL_RPC_URL,
  envName: ENV_NAME,
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: BACKEND_CANISTER_ID,
  blobStorageGatewayUrl: BLOB_STORAGE_GATEWAY_URL,
  blobStorageCashierCanisterId: BLOB_STORAGE_CASHIER_CANISTER_ID,
  storageLicenseLimits: {
    includedBytes: STORAGE_LICENSE_INCLUDED_BYTES,
    maxFileBytes: STORAGE_LICENSE_MAX_FILE_BYTES,
  },
  icpay: {
    publishableKey: ICPAY_PUBLISHABLE_KEY,
    apiUrl: ICPAY_API_URL,
  },
};
