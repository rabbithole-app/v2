import {
  BACKEND_CANISTER_ID,
  BLOB_STORAGE_CASHIER_CANISTER_ID,
  BLOB_STORAGE_GATEWAY_URL,
  canisterUrl,
  ENV_NAME,
  EVM_RPC_URL,
  HTTP_AGENT_HOST,
  INTERNET_IDENTITY_BACKEND_CANISTER_ID,
  INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
  ICPAY_API_URL,
  ICPAY_PUBLISHABLE_KEY,
  SOL_RPC_URL,
  STORAGE_LICENSE_INCLUDED_BYTES,
  STORAGE_LICENSE_MAX_FILE_BYTES,
} from '@rabbithole/core/app-runtime';

const MAINNET_IDENTITY_PROVIDER_URL = 'https://id.ai/authorize';
const MAINNET_IDENTITY_SIGNER_CANISTER_ID = 'rdmx6-jaaaa-aaaaa-aaadq-cai';
const LOCAL_HTTP_AGENT_HOST = HTTP_AGENT_HOST || 'https://localhost';

export const environment = {
  identityProviderUrl: INTERNET_IDENTITY_FRONTEND_CANISTER_ID
    ? canisterUrl(
        INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
        LOCAL_HTTP_AGENT_HOST,
        '/authorize',
      )
    : MAINNET_IDENTITY_PROVIDER_URL,
  identitySignerCanisterId:
    INTERNET_IDENTITY_BACKEND_CANISTER_ID || MAINNET_IDENTITY_SIGNER_CANISTER_ID,
  appUrl: 'http://localhost:4200',
  appName: 'Rabbithole',
  docsUrl: 'http://localhost:4202',
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
  storageLicenseLimits: {
    includedBytes: STORAGE_LICENSE_INCLUDED_BYTES,
    maxFileBytes: STORAGE_LICENSE_MAX_FILE_BYTES,
  },
  icpay: {
    publishableKey: ICPAY_PUBLISHABLE_KEY,
    apiUrl: ICPAY_API_URL,
  },
};
