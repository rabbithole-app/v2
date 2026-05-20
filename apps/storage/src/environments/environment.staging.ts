import {
  BLOB_STORAGE_CASHIER_CANISTER_ID,
  BLOB_STORAGE_GATEWAY_URL,
} from '@rabbithole/core/app-runtime';

export const environment = {
  identityProviderUrl: 'https://id.ai/authorize',
  appUrl: 'https://dev.rabbithole.app',
  appName: 'Rabbithole',
  openIdProviders: ['google', 'apple', 'microsoft'] as const,
  httpAgentHost: 'https://icp-api.io',
  evmRpcUrl: 'https://sepolia.base.org',
  solanaRpcUrl: 'https://api.devnet.solana.com',
  envName: 'STAGING',
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: '',
  blobStorageGatewayUrl: BLOB_STORAGE_GATEWAY_URL,
  blobStorageCashierCanisterId: BLOB_STORAGE_CASHIER_CANISTER_ID,
};
