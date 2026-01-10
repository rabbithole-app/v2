interface ImportMeta {
  readonly env: Readonly<ImportMetaEnv>;
}

interface ImportMetaEnv {
  CANISTER_ID_ENCRYPTED_STORAGE: string;
  CANISTER_ID_RABBITHOLE_BACKEND: string;
  CANISTER_ID_RABBITHOLE_FRONTEND: string;
  DFX_NETWORK: string;
  DFX_VERSION: string;
}
