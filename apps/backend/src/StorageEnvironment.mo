module {
  public let RABBITHOLE_BACKEND_CANISTER_ID = "PUBLIC_CANISTER_ID:rabbithole-backend";
  public let RABBITHOLE_FRONTEND_CANISTER_ID = "PUBLIC_CANISTER_ID:rabbithole-frontend";
  public let INTERNET_IDENTITY_BACKEND_CANISTER_ID = "PUBLIC_CANISTER_ID:internet_identity_backend";
  public let INTERNET_IDENTITY_FRONTEND_CANISTER_ID = "PUBLIC_CANISTER_ID:internet_identity_frontend";

  public let VETKEY_NAME = "VETKEY_NAME";
  public let CASHIER_PRINCIPAL = "CAFFFEINE_STORAGE_CASHIER_PRINCIPAL";
  public let TRUSTED_ATTRIBUTE_SIGNERS = "trusted_attribute_signers";
  public let FRONTEND_ORIGINS = "frontend_origins";

  public let STORAGE_FRONTEND_ORIGINS = "STORAGE_FRONTEND_ORIGINS";

  /// Earliest storage release whose WASM can pull its own frontend from the
  /// backend. Releases below this cannot receive frontend-only installs.
  public let STORAGE_PULL_MIN_VERSION = "STORAGE_PULL_MIN_VERSION";

  public let SYSTEM_ENV_NAMES : [Text] = [
    RABBITHOLE_BACKEND_CANISTER_ID,
    RABBITHOLE_FRONTEND_CANISTER_ID,
    INTERNET_IDENTITY_BACKEND_CANISTER_ID,
    INTERNET_IDENTITY_FRONTEND_CANISTER_ID,
    CASHIER_PRINCIPAL,
    TRUSTED_ATTRIBUTE_SIGNERS,
    FRONTEND_ORIGINS,
    STORAGE_FRONTEND_ORIGINS,
  ];
};
