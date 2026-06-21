import {
  BACKEND_CANISTER_ID,
  BLOB_STORAGE_CASHIER_CANISTER_ID,
  BLOB_STORAGE_GATEWAY_URL,
  canisterUrl,
  ENV_NAME,
  EVM_RPC_URL,
  HTTP_AGENT_HOST,
  INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
  SOL_RPC_URL,
} from '@rabbithole/core/app-runtime';

export const environment = {
  identityProviderUrl: INTERNET_IDENTITY_FRONTEND_CANISTER_ID
    ? canisterUrl(
        INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
        HTTP_AGENT_HOST || 'https://localhost',
        '/authorize',
      )
    : '',
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
  httpAgentHost: HTTP_AGENT_HOST || 'https://localhost',
  evmRpcUrl: EVM_RPC_URL || 'https://sepolia.base.org',
  solanaRpcUrl: SOL_RPC_URL || 'https://api.devnet.solana.com',
  envName: ENV_NAME || 'DEV',
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: BACKEND_CANISTER_ID,
  blobStorageGatewayUrl: BLOB_STORAGE_GATEWAY_URL || 'https://blob.caffeine.ai',
  blobStorageCashierCanisterId:
    BLOB_STORAGE_CASHIER_CANISTER_ID || 'xc7sj-uyaaa-aaaaf-qbrja-cai',
};
