import {
  BACKEND_CANISTER_ID,
  ENV_NAME,
  FRONTEND_CANISTER_ID,
  HTTP_AGENT_HOST,
} from '@rabbithole/core';

export const environment = {
  identityProviderUrl: 'https://id.ai/authorize',
  appUrl: `https://${FRONTEND_CANISTER_ID}.icp0.io`,
  appName: 'Rabbithole',
  envName: ENV_NAME,
  httpAgentHost: HTTP_AGENT_HOST,
  production: true,
  scheme: 'rabbithole',
  backendCanisterId: BACKEND_CANISTER_ID,
};
