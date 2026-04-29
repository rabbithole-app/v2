import {
  BACKEND_CANISTER_ID,
  BLOB_STORAGE_CASHIER_CANISTER_ID,
  BLOB_STORAGE_GATEWAY_URL,
  canisterUrl,
  ENV_NAME,
  EVM_RPC_URL,
  HTTP_AGENT_HOST,
  ICPAY_API_URL,
  ICPAY_PUBLISHABLE_KEY,
  INTERNET_IDENTITY_BACKEND_CANISTER_ID,
  INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
  SOL_RPC_URL,
} from '@rabbithole/core';

if (!INTERNET_IDENTITY_BACKEND_CANISTER_ID || !INTERNET_IDENTITY_FRONTEND_CANISTER_ID) {
  throw new Error('Local environment requires Internet Identity canister IDs in ic_env.');
}

export const environment = {
  identityProviderUrl: canisterUrl(
    INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
    HTTP_AGENT_HOST,
    '/authorize',
  ),
  identitySignerCanisterId: INTERNET_IDENTITY_BACKEND_CANISTER_ID,
  appUrl: 'http://localhost:4200',
  appName: 'Rabbithole',
  openIdProviders: [
    {
      id: 'dev',
      icon: 'hugeDeveloper',
      issuer: 'https://openid.localhost',
      label: 'Continue with Dev OpenID',
    },
  ] as const,
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
