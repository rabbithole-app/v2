import {
  BACKEND_CANISTER_ID,
  BLOB_STORAGE_CASHIER_CANISTER_ID,
  BLOB_STORAGE_GATEWAY_URL,
  ENV_NAME,
  EVM_RPC_URL,
  HTTP_AGENT_HOST,
  ICPAY_API_URL,
  ICPAY_PUBLISHABLE_KEY,
  INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
  SOL_RPC_URL,
} from '@rabbithole/core';

if (!INTERNET_IDENTITY_FRONTEND_CANISTER_ID) {
  throw new Error('Local environment requires PUBLIC_CANISTER_ID:internet_identity_frontend in ic_env.');
}

export const environment = {
  identityProviderUrl: `https://${INTERNET_IDENTITY_FRONTEND_CANISTER_ID}.localhost`,
  appUrl: 'http://localhost:4200',
  appName: 'Rabbithole',
  httpAgentHost: HTTP_AGENT_HOST,
  evmRpcUrl: EVM_RPC_URL,
  solanaRpcUrl: SOL_RPC_URL,
  envName: ENV_NAME,
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: BACKEND_CANISTER_ID,
  blobStorageGatewayUrl: BLOB_STORAGE_GATEWAY_URL,
  blobStorageCashierCanisterId: BLOB_STORAGE_CASHIER_CANISTER_ID,
  icpay: {
    publishableKey: ICPAY_PUBLISHABLE_KEY,
    apiUrl: ICPAY_API_URL,
  },
};
