import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

import ICPayWebhooks "mo:icpay-webhooks";
import Json "mo:json";
import TreasuryTypes "mo:treasury/Types";
import StorageEnvironment "../StorageEnvironment";

module {
  public type PaymentPurpose = {
    #deposit;
    #license;
    #pro_monthly;
  };

  public type StorageBackendType = { #BlobStorage; #OnChain };
  public type StorageVetKeyLevel = { #standard; #highReplication };

  /// Env-var names that `buildEnvironmentVariables` pins to backend-derived
  /// runtime values (backend principal, frontend canister, cashier, etc.).
  /// Caller-provided pairs with these names are dropped so system defaults win.
  /// `VETKEY_NAME` stays outside this list for now because the paid license
  /// flow still passes the selected vetkey level through controlled envPairs.
  public let RESERVED_ENV_NAMES : [Text] = StorageEnvironment.SYSTEM_ENV_NAMES;

  func isReservedEnvName(name : Text) : Bool {
    for (reserved in RESERVED_ENV_NAMES.vals()) {
      if (Text.equal(name, reserved)) return true;
    };
    false;
  };

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

  public func parseStorageVetKeyLevel(text : Text) : ?StorageVetKeyLevel {
    if (text == "standard") ?#standard
    else if (text == "high-replication" or text == "highReplication") ?#highReplication
    else null;
  };

  public func encodeStorageInitArg(owner : Principal, storageBackendType : ?StorageBackendType) : Blob {
    to_candid ({ owner; storageBackendType });
  };

  public func extractStorageConfig(metadata : Json.Json) : ?{
    storageBackendType : StorageBackendType;
    vetKeyLevel : StorageVetKeyLevel;
  } {
    let sbtText = switch (Json.get(metadata, "storageBackendType")) {
      case (?#string(s)) s;
      case _ return null;
    };
    let ?sbt = parseStorageBackendType(sbtText) else return null;
    let vetKeyLevel = switch (Json.get(metadata, "vetKeyLevel")) {
      case (?#string(s)) {
        switch (parseStorageVetKeyLevel(s)) {
          case (?level) level;
          case null return null;
        };
      };
      case _ #standard;
    };
    ?{ storageBackendType = sbt; vetKeyLevel };
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
