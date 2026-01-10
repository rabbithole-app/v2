import { INTERNET_IDENTITY_CANISTER_ID } from '@rabbithole/core';

export const environment = {
  identityProviderUrl: `https://${INTERNET_IDENTITY_CANISTER_ID}.localhost`,
  appUrl: 'http://localhost:4200',
  appName: 'Rabbithole',
  httpAgentHost: 'https://localhost',
  envName: 'DEV',
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: import.meta.env.CANISTER_ID_RABBITHOLE_BACKEND,
  encryptedStorageCanisterId: import.meta.env.CANISTER_ID_ENCRYPTED_STORAGE,
};
