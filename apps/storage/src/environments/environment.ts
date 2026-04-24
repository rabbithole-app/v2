import {
  BACKEND_CANISTER_ID,
  ENV_NAME,
  HTTP_AGENT_HOST,
  INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
} from '@rabbithole/core';

if (!INTERNET_IDENTITY_FRONTEND_CANISTER_ID) {
  throw new Error('Local environment requires PUBLIC_CANISTER_ID:internet_identity_frontend in ic_env.');
}

export const environment = {
  identityProviderUrl: `https://${INTERNET_IDENTITY_FRONTEND_CANISTER_ID}.localhost`,
  appUrl: 'http://localhost:4200',
  appName: 'Rabbithole',
  httpAgentHost: HTTP_AGENT_HOST,
  envName: ENV_NAME,
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: BACKEND_CANISTER_ID,
};
