export const environment = {
  identityProviderUrl: 'https://identity.ic0.app',
  appUrl: `https://${import.meta.env.CANISTER_ID_RABBITHOLE_FRONTEND}.icp0.io`,
  appName: 'Rabbithole',
  envName: 'PROD',
  // Point to icp-api for the mainnet. Leaving host undefined will work for localhost
  httpAgentHost: 'https://icp-api.io',
  production: true,
  scheme: 'rabbithole',
  backendCanisterId: import.meta.env.CANISTER_ID_RABBITHOLE_BACKEND,
};
