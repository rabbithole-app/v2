export const environment = {
  identityProviderUrl: `https://${
    import.meta.env.CANISTER_ID_INTERNET_IDENTITY
  }.localhost`,
  appUrl: `https://${
    import.meta.env.CANISTER_ID_RABBITHOLE_FRONTEND
  }.localhost`,
  appName: 'Rabbithole',
  httpAgentHost: undefined,
  envName: 'DEV',
  production: false,
  scheme: 'rabbithole',
  backendCanisterId: import.meta.env.CANISTER_ID_RABBITHOLE_BACKEND,
  assetsCanisterId: import.meta.env.CANISTER_ID_ASSETS,
};
