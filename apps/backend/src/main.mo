import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import Liminal "mo:liminal";
import LiminalApp "mo:liminal/App";
import ZenDB "mo:zendb";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";

import StorageDeployerOrchestrator "StorageDeployer";
import CMCTypes "Types/CMCTypes";
import LedgerTypes "Types/LedgerTypes";
import XRCTypes "Types/XRCTypes";
import Account "StorageDeployer/Utils/Account";

import AdminMixin "AdminManager/mixin";
import KnownWasmHashesMixin "KnownWasmHashes/mixin";
import UsersMixin "Users/mixin";
import ProfilesMixin "Profiles/mixin";
import NotificationsMixin "Notifications/mixin";
import SettingsMixin "Settings/mixin";
import TreasuryMixin "Treasury/mixin";
import SubscriptionsMixin "Subscriptions/mixin";
import PaymentsMixin "Payments/mixin";
import BalanceMixin "Balance/mixin";

import Types "Types";

shared ({ caller = installer }) persistent actor class Rabbithole(initArgs : Types.InitArgs) = self {
  let canisterId = Principal.fromActor(self);

  // --- Assets & HTTP ---

  var assetStableData = HttpAssets.init_stable_store(canisterId, installer);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  transient var assetStore = HttpAssets.Assets(assetStableData, null);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // --- Database ---

  let zendb = ZenDB.newStableStore(canisterId, null);
  transient let db = ZenDB.launchDefaultDB(zendb);

  // --- Storage Deployer ---

  let defaultGithub : Types.GithubOptions = {
    apiUrl = "https://api.github.com";
    owner = "rabbithole-app";
    repo = "v2";
    token = null;
  };

  let storageOrchestrator = StorageDeployerOrchestrator.new({
    github = Option.get(initArgs.github, defaultGithub);
    assets = [(#LatestDraft, [#StorageWASM("encrypted-storage.wasm.gz"), #StorageFrontend("storage-frontend.tar")])];
  });
  storageOrchestrator.canisterId := ?canisterId;

  // --- Mixins (order matters: dependencies first) ---

  include AdminMixin(installer);
  include KnownWasmHashesMixin(assertAdmin);
  include ProfilesMixin(
    db,
    installer,
    func(key : Text) { if (assetStore.exists(key)) assetCanister.delete_asset(canisterId, { key }) },
    func(caller : Principal, args : HttpAssets.StoreArgs) { assetCanister.store(caller, args) },
  );
  include UsersMixin(db, resolveReferralCode);
  include NotificationsMixin();
  include SettingsMixin();
  include TreasuryMixin(
    {
      canisterId;
      admin = installer;
      evmConfig = initArgs.evmConfig;
      solConfig = initArgs.solConfig;
    },
    assertAdmin,
  );
  include SubscriptionsMixin(
    db,
    { assertAdmin },
    {
      findOwnerByCanister = func(cId : Principal) : ?Principal = StorageDeployerOrchestrator.findOwnerByCanister(storageOrchestrator, cId);
      isKnownWasm;
      hasUsedTrial;
      markTrialUsed;
    },
  );
  include PaymentsMixin(
    initArgs.icpaySecretKey,
    { assertAdmin },
    {
      notifyUser;
      getAmbassadorChain;
      activateSubscription = activateSubscriptionInternal;
      distributePayment = treasuryDistributePayment;
    },
  );
  // --- Exchange rate & top-up helpers for BalanceMixin ---

  let CMC_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";
  let ICP_LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";
  let XRC_CANISTER_ID = "uf6dk-hyaaa-aaaaq-qaaaq-cai";
  let XRC_CYCLES_COST : Nat = 260_000_000;
  let LEDGER_FEE : Nat = 10_000;
  let MEMO_TOP_UP : Nat64 = 0x50555054; // "TPUP" — required by CMC for notify_top_up

  func getIcpXdrRate() : async Nat {
    let cmc = actor (CMC_CANISTER_ID) : CMCTypes.Self;
    let response = await cmc.get_icp_xdr_conversion_rate();
    Nat64.toNat(response.data.xdr_permyriad_per_icp);
  };

  func getXrcRate(base : Text, quote : Text) : async ?(Nat64, Nat32) {
    let xrc = actor (XRC_CANISTER_ID) : XRCTypes.Self;
    let result = await (with cycles = XRC_CYCLES_COST) xrc.get_exchange_rate({
      base_asset = { symbol = base; class_ = #Cryptocurrency };
      quote_asset = { symbol = quote; class_ = #FiatCurrency };
      timestamp = null;
    });
    switch (result) {
      case (#Ok(rate)) ?(rate.rate, rate.metadata.decimals);
      case (#Err(_)) null;
    };
  };

  func verifyCanisterOwner(cId : Principal, caller : Principal) : Bool {
    switch (StorageDeployerOrchestrator.findOwnerByCanister(storageOrchestrator, cId)) {
      case (?owner) Principal.equal(owner, caller);
      case null false;
    };
  };

  func transferIcpToCmc(icpE8s : Nat, targetCanisterId : Principal) : async Result.Result<Nat, Text> {
    let ledger = actor (ICP_LEDGER_CANISTER_ID) : LedgerTypes.Self;
    let cmcSubaccount = Account.principalToSubaccount(targetCanisterId);

    // Get AccountIdentifier from ledger (legacy format required by CMC notify_top_up)
    let accountId = await ledger.account_identifier({
      owner = Principal.fromText(CMC_CANISTER_ID);
      subaccount = ?cmcSubaccount;
    });

    // Use legacy transfer API (AccountIdentifier format, compatible with CMC notify_top_up)
    let transferResult = await ledger.transfer({
      to = accountId;
      fee = { e8s = Nat64.fromNat(LEDGER_FEE) };
      memo = MEMO_TOP_UP;
      from_subaccount = null;
      created_at_time = ?{ timestamp_nanos = Nat64.fromNat(Int.abs(Time.now())) };
      amount = { e8s = Nat64.fromNat(icpE8s) };
    });
    switch (transferResult) {
      case (#Ok(blockIndex)) #ok(Nat64.toNat(blockIndex));
      case (#Err(err)) #err("ICP transfer failed: " # debug_show err);
    };
  };

  func notifyTopUpCmc(blockIndex : Nat64, targetCanisterId : Principal) : async Result.Result<Nat, Text> {
    let cmc = actor (CMC_CANISTER_ID) : CMCTypes.Self;
    let result = await cmc.notify_top_up({
      block_index = blockIndex;
      canister_id = targetCanisterId;
    });
    switch (result) {
      case (#Ok(cycles)) #ok(cycles);
      case (#Err(err)) #err("CMC notify_top_up failed: " # debug_show err);
    };
  };

  include BalanceMixin(
    { assertAdmin },
    {
      getExpiring = getExpiringSubscriptions;
      getExpired = getExpiredSubscriptions;
      activate = activateSubscriptionInternal;
      renew = renewSubscriptionInternal;
      get = getSubscriptionInternal;
    },
    {
      chargeAndDistribute = treasuryChargeAndDistribute;
      getBalance = treasuryGetBalance;
      simpleTransfer = treasurySimpleTransfer;
      simpleRefund = treasurySimpleRefund;
    },
    { getIcpXdrRate; getXrcRate },
    {
      getUserSettings;
      getAmbassadorChain;
      notifyUser;
      verifyCanisterOwner;
      transferIcpToCmc;
      notifyTopUp = notifyTopUpCmc;
    },
  );

  // --- Storage Deployer Helpers ---

  func handleAssetDownloaded(details : StorageDeployerOrchestrator.DownloadDetails) {
    if (Text.contains(details.name, #text ".wasm")) {
      registerWasmHash(details.sha256, details.key);
    };
  };

  transient let startCallbacks : StorageDeployerOrchestrator.StartCallbacks = {
    onAssetDownloaded = ?handleAssetDownloaded;
  };

  func syncLatestWasmHash() {
    switch (StorageDeployerOrchestrator.getLatestWasmHash(storageOrchestrator)) {
      case (?(hash, tag)) registerWasmHash(hash, tag);
      case null {};
    };
  };

  // --- System lifecycle ---

  system func preupgrade() {
    StorageDeployerOrchestrator.stop<system>(storageOrchestrator);
  };

  ignore Timer.setTimer<system>(
    #seconds 0,
    func() : async () {
      await StorageDeployerOrchestrator.start<system>(storageOrchestrator, startCallbacks);
      syncLatestWasmHash();
    },
  );

  // Payment queue drain: check every 10 seconds if there are queued events
  ignore Timer.recurringTimer<system>(#seconds(10), func() : async () {
    schedulePaymentDrain<system>();
  });

  // Daily timer: expire subscriptions + auto-renew
  ignore Timer.recurringTimer<system>(#seconds(86400), func() : async () {
    let expiredUsers = expireOverdueSubscriptions();
    for (userId in expiredUsers.vals()) {
      notifyUser(userId, #subscriptionExpired);
    };
    syncLatestWasmHash();
    await processAutoRenewals();
  });

  // --- Storage Deployer API ---

  public shared ({ caller }) func createStorage(
    options : StorageDeployerOrchestrator.CreateStorageOptions,
  ) : async Result.Result<(), StorageDeployerOrchestrator.CreateStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.createStorage<system>(storageOrchestrator, caller, options);
  };

  public query ({ caller }) func listStorages() : async [StorageDeployerOrchestrator.StorageInfo] {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.listStorages(storageOrchestrator, caller);
  };

  public shared ({ caller }) func addStorage(
    canisterId : Principal,
    initArg : Blob,
  ) : async Result.Result<Nat, StorageDeployerOrchestrator.AddStorageError> {
    assert not Principal.isAnonymous(caller);
    await StorageDeployerOrchestrator.addStorage(storageOrchestrator, caller, canisterId, initArg, isKnownWasm);
  };

  public shared ({ caller }) func deleteStorage(storageId : Nat) : async Result.Result<(), StorageDeployerOrchestrator.DeleteStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.deleteStorage(storageOrchestrator, caller, storageId);
  };

  public shared ({ caller }) func upgradeStorage(
    canisterId : Principal,
  ) : async Result.Result<(), StorageDeployerOrchestrator.UpgradeStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.upgradeStorage<system>(storageOrchestrator, caller, canisterId);
  };

  public query func checkStorageUpdate(canisterId : Principal) : async ?StorageDeployerOrchestrator.UpdateInfo {
    StorageDeployerOrchestrator.checkStorageUpdate(storageOrchestrator, canisterId);
  };

  public shared ({ caller }) func startStorageDeployer() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.start<system>(storageOrchestrator, startCallbacks);
  };

  public shared ({ caller }) func stopStorageDeployer() : async () {
    assertAdmin(caller);
    StorageDeployerOrchestrator.stop<system>(storageOrchestrator);
  };

  public query func isStorageDeployerRunning() : async Bool {
    StorageDeployerOrchestrator.isRunning(storageOrchestrator);
  };

  /// Register the latest downloaded WASM hash as known.
  public shared ({ caller }) func registerLatestWasmHash() : async () {
    assertAdmin(caller);
    syncLatestWasmHash();
  };

  // --- Storage Canister Callbacks ---

  public shared ({ caller }) func onStorageLowCycles(
    balance : Nat,
    daysLeft : Nat,
    severity : { #warning; #critical },
  ) : async () {
    let ?storageOwner = StorageDeployerOrchestrator.findOwnerByCanister(storageOrchestrator, caller) else return;
    notifyUser(storageOwner, #lowCycles({ canisterId = caller; remaining = balance; estimatedDaysLeft = daysLeft; severity }));
    // Trigger auto top-up if user has it enabled
    await processAutoTopUp(storageOwner, caller, balance, severity);
  };

  public query func getReleasesFullStatus() : async StorageDeployerOrchestrator.ReleasesFullStatus {
    StorageDeployerOrchestrator.getReleasesFullStatus(storageOrchestrator);
  };

  public shared ({ caller }) func refreshReleases() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.refreshReleases<system>(storageOrchestrator);
  };

  // --- HTTP interface ---

  transient let app = Liminal.App({
    middleware = Array.concat<LiminalApp.Middleware>(
      [
        CORSMiddleware.default(),
        AssetsMiddleware.new({ store = assetStore }),
      ],
      switch (getIcpayMiddleware()) { case (?m) [m]; case null [] },
    );
    errorSerializer = Liminal.defaultJsonErrorSerializer;
    candidRepresentationNegotiator = Liminal.defaultCandidRepresentationNegotiator;
    logger = Liminal.buildDebugLogger(#info);
    urlNormalization = {
      pathIsCaseSensitive = false;
      preserveTrailingSlash = false;
      queryKeysAreCaseSensitive = false;
      removeEmptyPathSegments = true;
      resolvePathDotSegments = true;
      usernameIsCaseSensitive = false;
    };
  });

  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public query func http_request_streaming_callback(token : HttpAssets.StreamingToken) : async HttpAssets.StreamingCallbackResponse {
    switch (assetStore.http_request_streaming_callback(token)) {
      case (#err(e)) throw Error.reject(e);
      case (#ok(response)) response;
    };
  };

  assetStore.set_streaming_callback(http_request_streaming_callback);
};
