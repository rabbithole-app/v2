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
};
