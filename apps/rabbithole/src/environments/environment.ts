import { INTERNET_IDENTITY_CANISTER_ID } from '@rabbithole/core';

export const environment = {
  identityProviderUrl: `https://${INTERNET_IDENTITY_CANISTER_ID}.localhost`,
  appUrl: 'http://localhost:4200',
  appName: 'Rabbithole',
  httpAgentHost: 'https://localhost',
  evmRpcUrl: 'https://sepolia.base.org',
  solanaRpcUrl: 'https://api.devnet.solana.com',
  envName: 'DEV',
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: import.meta.env.CANISTER_ID_RABBITHOLE_BACKEND,
  blobStorageGatewayUrl: 'https://dev-blob.caffeine.ai',
  blobStorageCashierCanisterId: 'xc7sj-uyaaa-aaaaf-qbrja-cai',
  icpay: {
    publishableKey: 'pk_GP6RSrfGQTRWxw2QeBXThqOGuYcPak3E',
    apiUrl: 'https://api.betterstripe.com',
  },
};
