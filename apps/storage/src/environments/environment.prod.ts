export const environment = {
  identityProviderUrl: 'https://id.ai/authorize',
  appUrl: 'https://rabbithole.app',
  appName: 'Rabbithole',
  openIdProviders: ['google', 'apple', 'microsoft'] as const,
  envName: 'PROD',
  httpAgentHost: 'https://icp-api.io',
  evmRpcUrl: 'https://mainnet.base.org',
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  production: true,
  scheme: 'rabbithole',
  backendCanisterId: '',
};
