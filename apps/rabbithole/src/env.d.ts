interface ImportMeta {
  readonly env: Readonly<ImportMetaEnv>;
}

interface ImportMetaEnv {
  CANISTER_ID_ASSETS: string;
  CANISTER_ID_INTERNET_IDENTITY: string;
  CANISTER_ID_RABBITHOLE_BACKEND: string;
  CANISTER_ID_RABBITHOLE_FRONTEND: string;
  DFX_NETWORK: string;
  DFX_VERSION: string;
}
