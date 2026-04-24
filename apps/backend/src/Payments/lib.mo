import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

import ICPayWebhooks "mo:icpay-webhooks";
import Json "mo:json";
import TreasuryTypes "mo:treasury/Types";

module {
  public type PaymentPurpose = {
    #deposit;
    #license;
    #pro_monthly;
  };

  public type StorageBackendType = { #BlobStorage; #OnChain };

  /// Env-var names that `buildEnvironmentVariables` pins to system-derived
  /// values (backend principal, etc.). User-provided pairs with these names
  /// are silently dropped so the system default always wins.
  public let RESERVED_ENV_NAMES : [Text] = [
    "PUBLIC_CANISTER_ID:rabbithole-backend",
    "CAFFFEINE_STORAGE_CASHIER_PRINCIPAL",
  ];

  func isReservedEnvName(name : Text) : Bool {
    for (reserved in RESERVED_ENV_NAMES.vals()) {
      if (Text.equal(name, reserved)) return true;
    };
    false;
  };

  /// Strip user-supplied envPairs of anything that would try to override a
  /// system-pinned name. Non-destructive: everything else passes through
  /// untouched, so the caller never sees an error from "slightly wrong"
  /// input. The canister consuming the init arg is still free to apply its
  /// own domain validation on lengths / character sets.
  public func sanitizeEnvPairs(pairs : ?[{ name : Text; value : Text }]) : ?[{ name : Text; value : Text }] {
    let ?arr = pairs else return null;
    let filtered = Array.filter<{ name : Text; value : Text }>(
      arr,
      func(p) = not isReservedEnvName(p.name),
    );
    if (filtered.size() == 0) null else ?filtered;
  };

  public func parseStorageBackendType(text : Text) : ?StorageBackendType {
    if (text == "BlobStorage") ?#BlobStorage
    else if (text == "OnChain") ?#OnChain
    else null;
  };

  public func encodeStorageInitArg(owner : Principal, storageBackendType : ?StorageBackendType) : Blob {
    to_candid ({ owner; storageBackendType });
  };

  public func extractEnvPairs(metadata : Json.Json) : ?[{ name : Text; value : Text }] {
    let ?#string(vetKeyName) = Json.get(metadata, "vetKeyName") else return null;
    ?[{ name = "VETKEY_NAME"; value = vetKeyName }];
  };

  public func extractStorageConfig(metadata : Json.Json) : ?{
    storageBackendType : StorageBackendType;
  } {
    let sbtText = switch (Json.get(metadata, "storageBackendType")) {
      case (?#string(s)) s;
      case _ return null;
    };
    let ?sbt = parseStorageBackendType(sbtText) else return null;
    ?{ storageBackendType = sbt };
  };

  public func parsePurpose(text : Text) : ?PaymentPurpose {
    if (text == "deposit") ?#deposit
    else if (text == "license") ?#license
    else if (text == "pro_monthly") ?#pro_monthly
    else null;
  };

  /// Map ICPay PaymentMethod to treasury TokenId
  public func resolveTokenId(method : ICPayWebhooks.PaymentMethod) : TreasuryTypes.TokenId {
    switch (method.network) {
      case (#IC) {
        switch (method.currency) {
          case (#native) #ICP;
          case (#token(addr)) {
            if (Text.equal(addr, "xevnm-gaaaa-aaaar-qafnq-cai")) #ckUSDC
            else if (Text.equal(addr, "cngnf-vqaaa-aaaar-qag4q-cai")) #ckUSDT
            else if (Text.equal(addr, "ss2fx-dyaaa-aaaar-qacoq-cai")) #ckETH
            else #ICP;
          };
        };
      };
      case (#EVM) {
        switch (method.currency) {
          case (#native) #BaseETH;
          case (#token(_)) #BaseUSDC; // TODO: distinguish USDC vs USDT by contract
        };
      };
      case (#Sol) {
        switch (method.currency) {
          case (#native) #SOL;
          case (#token(_)) #SolUSDC; // TODO: distinguish by mint
        };
      };
      case _ #ICP;
    };
  };
};
