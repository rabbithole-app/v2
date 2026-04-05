import { INTERNET_IDENTITY_CANISTER_ID } from '@rabbithole/core';

export const environment = {
  identityProviderUrl: `https://${INTERNET_IDENTITY_CANISTER_ID}.localhost`,
  appUrl: `https://${
    import.meta.env.CANISTER_ID_RABBITHOLE_FRONTEND
  }.localhost`,
  appName: 'Rabbithole',
  httpAgentHost: 'https://localhost',
  envName: 'STAGING',
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: import.meta.env.CANISTER_ID_RABBITHOLE_BACKEND,
  blobStorageGatewayUrl: 'https://dev-blob.caffeine.ai',
  blobStorageCashierCanisterId: 'xc7sj-uyaaa-aaaaf-qbrja-cai',
};
