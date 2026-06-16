import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Cycles "mo:core/Cycles";
import Debug "mo:core/Debug";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import Liminal "mo:liminal";
import LiminalApp "mo:liminal/App";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import ZenDB "mo:zendb";
import StorageTypes "mo:encrypted-storage/Types";

import TreasuryTypes "mo:treasury/Types";
import TreasuryConst "mo:treasury/Const";
import BackendEvents "BackendEvents/lib";
import IdentityVerification "IdentityVerification/lib";
import BackendIdentityHandler "IdentityVerification/BackendHandler";
import Payments "Payments/lib";
import StorageDeployerOrchestrator "StorageDeployer";
import CMCTypes "Types/CMCTypes";
import LedgerTypes "Types/LedgerTypes";
import XRCTypes "Types/XRCTypes";
import Account "StorageDeployer/Utils/Account";
import StorageReleaseConfig "StorageDeployer/StorageReleaseConfig";

import KnownWasmHashesMixin "KnownWasmHashes/mixin";
import AvatarStorageMixin "AvatarStorage/mixin";
import UsersMixin "Users/mixin";
import IdentityVerificationMixin "IdentityVerification/mixin";
import IdentityAttributes "mo:identity-attributes";
import NotificationsMixin "Notifications/mixin";
import Settings "Settings/lib";
import SettingsMixin "Settings/mixin";
import SharedAccess "SharedAccess/lib";
import StorageAccessBackendConsumer "StorageAccessBridge/BackendConsumer";
import TreasuryMixin "Treasury/mixin";
import Subscriptions "Subscriptions/lib";
import SubscriptionsMixin "Subscriptions/mixin";
import PaymentsMixin "Payments/mixin";
import Balance "Balance/lib";
import BalanceMixin "Balance/mixin";
import CmcRecoveryMixin "CmcRecovery/mixin";
import CmcRecovery "CmcRecovery/lib";
import CreationsClass "StorageDeployer/Creations";
import LicensesClass "StorageDeployer/Licenses";
import Notifications "Notifications/lib";

import Types "Types";
import Utils "Utils/lib";

shared ({ caller = installer }) persistent actor class Rabbithole(initArgs : Types.InitArgs) = self {
  let canisterId = Principal.fromActor(self);
  transient let backendInitArgs = switch (initArgs) {
    case (#v1(args)) args;
  };
  transient let treasuryChainsPatch = switch (backendInitArgs.treasury) {
    case (?treasury) treasury.chains;
    case null null;
  };

  // --- Database ---

  let zendb = ZenDB.newStableStore(canisterId, null);
  transient let db = ZenDB.launchDefaultDB(zendb);

  // --- Storage Deployer ---

  transient let backendThresholdKeyName = Utils.envText<system>("THRESHOLD_KEY_NAME", "key_1");
  transient let storageReleaseConfig = StorageReleaseConfig.fromEnv<system>();

  let storageOrchestrator : StorageDeployerOrchestrator.Store = StorageDeployerOrchestrator.new<system>({
    github = storageReleaseConfig.github;
    assets = storageReleaseConfig.assets;
  });
  storageOrchestrator.canisterId := ?canisterId;

  // Transient ZenDB class handles — recreated on every upgrade, backing
  // rows persist via the stable `db` store.
  transient let licenses = LicensesClass.Licenses(db);
  transient let creations = CreationsClass.Creations(db);

  // Callback the orchestrator fires from its queue when a fresh canister is
  // minted for a creation that has an attached license.
  transient let storageOrchestratorRuntime = StorageDeployerOrchestrator.newRuntimeState();

  transient let bindLicenseCallback : StorageDeployerOrchestrator.BindLicense = func(owner, paymentId, cid) = licenses.bind(owner, paymentId, cid);

  // `orchestratorCallbacks` is declared AFTER the mixins below so its
  // payAmbassadorShareCallback can reference `getAmbassadorChain` and
  // `treasuryDistributeAmbassadorShare` (both provided by Users / Treasury
  // mixins). See the second declaration near the bottom of the actor body.

  // --- Mixins (order matters: dependencies first) ---
  //
  // Users must come before every admin-guarded mixin (KnownWasmHashes, Treasury,
  // Subscriptions, Payments, Balance) because Users provides `assertAdmin` — the
  // guard is backed by `user.role == #admin` rather than a separate set.

  include AvatarStorageMixin(canisterId, db);
  include UsersMixin(installer, db, avatarUploadReservations, avatarDrafts);
  include IdentityVerificationMixin({
    onVerifiedAttributes = func(caller : Principal, attrs : IdentityVerification.VerifiedIdentityAttributes) : Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
      BackendIdentityHandler.onVerifiedAttributes(
        sharedAccess,
        {
          upsertFromVerifiedAttributes;
        },
        caller,
        attrs,
      );
    };
    claimVerifiedEmailAccess = func(caller : Principal, attrs : IdentityVerification.VerifiedIdentityAttributes) : async Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
      await BackendIdentityHandler.claimVerifiedEmailAccess(
        sharedAccess,
        {
          claimStorageEmailAccessByCommitment;
        },
        caller,
        attrs,
      );
    };
  });
  include IdentityAttributes({
    onVerified = storeVerifiedIdentityAttributes;
  });
  include KnownWasmHashesMixin({ assertAdmin });
  include NotificationsMixin({
    listAdmins = func() : [Principal] = users.listByRole(#admin);
  });
  transient let backendEvents : BackendEvents.EventSink = {
    emit = consumeBackendEvent;
  };
  let sharedAccess = SharedAccess.new();

  func notifyStorageSubscriptionChanged(storageCanisterId : Principal) : async () {
    let storageActor : actor {
      invalidateSubscriptionCache : () -> async ();
    } = actor (Principal.toText(storageCanisterId));
    try {
      await storageActor.invalidateSubscriptionCache();
    } catch (_) {};
  };

  func notifyUserStoragesSubscriptionChanged(userId : Principal) : async () {
    for (record in creations.listByOwner(userId).vals()) {
      switch (record.canisterId) {
        case (?storageCanisterId) await notifyStorageSubscriptionChanged(storageCanisterId);
        case null {};
      };
    };
  };

  public type SharedStorageAccessView = {
    access : SharedAccess.SharedStorageAccess;
    storageStatus : ?StorageDeployerOrchestrator.CreationStatus;
    updateAvailable : ?StorageDeployerOrchestrator.UpdateInfo;
  };

  func claimStorageEmailAccessByCommitment(principal : Principal, storageCanisterId : Principal, commitment : Blob) : async () {
    let storage : actor {
      claimPendingAccessByBackendAttestation : StorageTypes.ClaimPendingAccessByBackendAttestationArguments -> async [StorageTypes.PrincipalAccessGrant];
    } = actor (Principal.toText(storageCanisterId));
    try {
      ignore await storage.claimPendingAccessByBackendAttestation({
        principal;
        emailCommitments = [commitment];
      });
    } catch error {
      ignore error;
    };
  };

  include SettingsMixin();
  include TreasuryMixin(
    {
      canisterId;
      thresholdKeyName = backendThresholdKeyName;
      chains = treasuryChainsPatch;
    },
    { assertAdmin },
  );

  public query ({ caller }) func adminGetUserWalletMeta(userId : Principal) : async {
    walletAddresses : {
      icSubaccount : Blob;
      evmAddress : ?Text;
      solAddress : ?Text;
    };
    settings : Settings.UserSettings;
  } {
    assertAdmin(caller);
    {
      walletAddresses = treasuryGetWalletAddresses(userId);
      settings = getUserSettings(userId);
    };
  };

  func storageLicenseLimits<system>() : Subscriptions.LicenseStorageLimits {
    {
      includedBytes = Utils.envNat<system>("STORAGE_LICENSE_INCLUDED_BYTES", 5_368_709_120);
      maxFileBytes = Utils.envNat<system>("STORAGE_LICENSE_MAX_FILE_BYTES", 2_147_483_648);
    };
  };
  transient let currentStorageLicenseLimits = storageLicenseLimits<system>();

  include SubscriptionsMixin(
    db,
    { assertAdmin },
    {
      findOwnerByCanister = func(cId : Principal) : ?Principal = StorageDeployerOrchestrator.findOwnerByCanister(creations, cId);
      findStorageLicense = func(cId : Principal) : ?StorageDeployerOrchestrator.License = StorageDeployerOrchestrator.findLicenseByCanister(licenses, cId);
      isKnownWasm;
      onSubscriptionChanged = notifyUserStoragesSubscriptionChanged;
    },
  );
  let STORAGE_INITIAL_CYCLES : Nat = 1_500_000_000_000;

  func emitBackendNotification(recipient : Principal, payload : Notifications.NotificationPayload) {
    backendEvents.emit(#notificationRequested({ recipient; payload; correlationId = null }));
  };

  func emitBackendAdminNotification(payload : Notifications.NotificationPayload) {
    backendEvents.emit(#adminNotificationRequested({ payload; correlationId = null }));
  };

  func creationProgress(status : StorageDeployerOrchestrator.CreationStatus) : ?BackendEvents.Progress {
    switch (status) {
      case (#InstallingWasm({ progress })) ?progress;
      case (#ReinstallingWasm({ progress })) ?progress;
      case (#UploadingFrontend({ progress })) ?progress;
      case (#UpgradingWasm({ progress })) ?progress;
      case (#UpgradingFrontend({ progress })) ?progress;
      case _ null;
    };
  };

  func creationTerminal(status : StorageDeployerOrchestrator.CreationStatus) : Bool {
    switch (status) {
      case (#Completed(_) or #Failed(_)) true;
      case _ false;
    };
  };

  func emitCreationChanged(record : StorageDeployerOrchestrator.StorageCreationRecord) {
    backendEvents.emit(#creationChanged({ accountOwner = record.owner; creationId = record.id; canisterId = record.canisterId; stage = record.statusTag; progress = creationProgress(record.status); terminal = creationTerminal(record.status); eventIndex = record.events.size() }));
  };

  func emitCreationRecordChanged(creationId : Nat) {
    switch (StorageDeployerOrchestrator.getCreationRecordById(creations, creationId)) {
      case (?record) emitCreationChanged(record);
      case null {};
    };
  };

  func appendCreationEvent(creationId : Nat, status : StorageDeployerOrchestrator.CreationStatus) {
    StorageDeployerOrchestrator.appendEvent(creations, creationId, status);
    emitCreationRecordChanged(creationId);
  };

  /// Deferred ambassador payout — fires from the orchestrator at
  /// `#CanisterCreated` (the refund point of no return). Looks up the
  /// license receipt for token + amount, resolves the user's ambassador
  /// chain, and calls treasury to move the L1/L2 shares from the treasury
  /// subaccount to the ambassador subaccounts. Result (success / failure
  /// reason) is stamped on the creation record's `ambassadorPayoutStatus`
  /// so admins can retry failed payouts without losing context.
  func payAmbassadorShareForPayment(
    creationId : Nat,
    owner : Principal,
    paymentId : Text,
  ) : async* () {
    try {
      let ?license = StorageDeployerOrchestrator.findLicenseByPaymentId(licenses, owner, paymentId) else {
        Debug.print("[ambassador payout] license not found: owner=" # Principal.toText(owner) # " paymentId=" # paymentId);
        StorageDeployerOrchestrator.setAmbassadorPayoutStatus(creations, creationId, #failed("license not found"));
        return;
      };

      // Ambassador chain is immutable per user (set at registration), so
      // snapshotting at payout time matches charge time by construction.
      let chain = getAmbassadorChain(owner);

      let result = await* treasuryDistributeAmbassadorShare({
        paymentId;
        payer = owner;
        tokenId = license.receipt.tokenId;
        totalAmount = license.receipt.amount;
        ambassadorL1 = chain.l1;
        ambassadorL2 = chain.l2;
        metadata = ?"license";
      });

      let status : StorageDeployerOrchestrator.AmbassadorPayoutStatus = switch (result) {
        case (#ok(_)) #completed;
        case (#err(#AlreadyProcessed)) #completed; // idempotent: payout already done
        case (#err(#PartiallyCompleted(_))) #failed("partial distribution — check distributionLog");
        case (#err(e)) #failed(debug_show e);
      };
      StorageDeployerOrchestrator.setAmbassadorPayoutStatus(creations, creationId, status);
      emitAdminPayoutFailureNotification(creationId, owner, status);
    } catch (e) {
      Debug.print("[ambassador payout] trapped creationId=" # Nat.toText(creationId) # ": " # Error.message(e));
      let status : StorageDeployerOrchestrator.AmbassadorPayoutStatus = #failed("trapped: " # Error.message(e));
      StorageDeployerOrchestrator.setAmbassadorPayoutStatus(creations, creationId, status);
      emitAdminPayoutFailureNotification(creationId, owner, status);
    };
  };

  /// Fanout a `#ambassadorPayoutFailed` event to admins when the deferred
  /// payout lands in `#failed` state. Silent on `#completed` / `#pending`
  /// / `#skipped` — those don't need admin attention.
  func emitAdminPayoutFailureNotification(
    creationId : Nat,
    owner : Principal,
    status : StorageDeployerOrchestrator.AmbassadorPayoutStatus,
  ) {
    switch (status) {
      case (#failed(reason)) emitBackendAdminNotification(#ambassadorPayoutFailed({ creationId; owner; reason }));
      case _ {};
    };
  };

  // Fired at #CanisterCreated — the refund point of no return. The callback
  // is awaited inline by the orchestrator so the payout result lands on the
  // creation record before WASM install is queued. Failures are captured in
  // `ambassadorPayoutStatus` rather than bubbling up as a task error.
  transient let payAmbassadorShareCallback : StorageDeployerOrchestrator.PayAmbassadorShare = func(creationId : Nat, owner : Principal, paymentId : Text) : async* () {
    await* payAmbassadorShareForPayment(creationId, owner, paymentId);
  };

  // `var` — onCmcNotifyFailed assigned after CmcRecoveryMixin include (below).
  transient var orchestratorCallbacks : StorageDeployerOrchestrator.OrchestratorCallbacks = {
    runtime = storageOrchestratorRuntime;
    bindLicense = ?bindLicenseCallback;
    payAmbassadorShare = ?payAmbassadorShareCallback;
    onCmcNotifyFailed = null;
    onCreationChanged = ?emitCreationChanged;
    onAssetDownloaded = null;
  };

  transient var includedFundingSettlementHook : (Nat, CmcRecovery.IncludedFundingSettlement) -> () = func(_, _) {};

  func registerIncludedFundingSettlementHook(hook : (Nat, CmcRecovery.IncludedFundingSettlement) -> ()) {
    includedFundingSettlementHook := hook;
  };

  func settleIncludedFundingReservation(blockIndex : Nat, settlement : CmcRecovery.IncludedFundingSettlement) {
    includedFundingSettlementHook(blockIndex, settlement);
  };

  // --- Internal: storage environment for license purchase ---

  func storageVetKeyEnv<system>(level : Payments.StorageVetKeyLevel) : ?[{
    name : Text;
    value : Text;
  }] {
    let keyName = switch (level) {
      case (#standard) backendThresholdKeyName;
      case (#highReplication) "key_1";
    };
    ?[{ name = "VETKEY_NAME"; value = keyName }];
  };

  func createStorageForUserInternal<system>(userId : Principal, initArg : Blob, envPairs : ?[{ name : Text; value : Text }]) : Result.Result<(), Text> {
    let result = StorageDeployerOrchestrator.createStorage<system>(
      storageOrchestrator,
      creations,
      userId,
      {
        releaseSelector = storageReleaseConfig.installSelector;
        initArg;
        envPairs;
        target = #Create({
          initialCycles = STORAGE_INITIAL_CYCLES;
          subnetId = null;
        });
      },
      orchestratorCallbacks,
    );
    switch (result) {
      case (#ok()) #ok();
      case (#err(e)) #err(debug_show e);
    };
  };

  include PaymentsMixin(
    backendInitArgs.icpaySecretKey,
    { assertAdmin },
    {
      events = backendEvents;
      getAmbassadorChain;
      grantPaidPeriod = grantPaidPeriodInternal;
      onSubscriptionChanged = notifyUserStoragesSubscriptionChanged;
      distributePayment = treasuryDistributePayment;
      storageVetKeyEnv;
      createStorageForUser = createStorageForUserInternal;
      addLicense = func(owner : Principal, receipt : { tokenId : TreasuryTypes.TokenId; amount : Nat; paymentId : Text; paidAt : Int }) : Result.Result<(), { #DuplicatePayment }> {
        StorageDeployerOrchestrator.addLicense(
          licenses,
          owner,
          {
            tokenId = receipt.tokenId;
            amount = receipt.amount;
            paymentId = receipt.paymentId;
            paidAt = receipt.paidAt;
            status = #completed;
          },
          currentStorageLicenseLimits,
        );
      };
    },
  );

  // --- Exchange rate & top-up helpers for BalanceMixin ---

  transient let CMC_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";
  transient let ICP_LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";
  transient let XRC_CANISTER_ID = Utils.envText<system>("PUBLIC_CANISTER_ID:xrc", "uf6dk-hyaaa-aaaaq-qaaaq-cai");
  // XRC rejects calls with < 1B cycles attached (XRC_REQUEST_CYCLES_COST check).
  // Actual fee is 20M (cache hit) to 500M (stablecoin pair); unused is auto-refunded.
  transient let XRC_CYCLES_COST : Nat = 1_000_000_000;
  transient let LEDGER_FEE : Nat = 10_000;
  transient let MEMO_TOP_UP : Nat64 = 0x50555054; // "TPUP" — required by CMC for notify_top_up

  // Backend self-topup parameters. When `Cycles.balance()` drops below
  // `BACKEND_CYCLES_THRESHOLD`, the backend burns ICP from the treasury
  // subaccount to buy cycles up to `BACKEND_CYCLES_TARGET`. Transient so we
  // can retune via upgrade without migration.
  transient let BACKEND_CYCLES_THRESHOLD : Nat = 2_000_000_000_000; // 2 TC
  transient let BACKEND_CYCLES_TARGET : Nat = 5_000_000_000_000; // 5 TC

  type EnsureStorageCyclesForUploadRequest = {
    currentBalance : Nat;
    requiredBalance : Nat;
    postWriteFreezingReserve : Nat;
    projectedCapacityBytes : Nat;
    remainingUploadBytes : Nat;
    activeUploadedBytes : Nat;
  };

  func getIcpXdrRate() : async Nat {
    let cmc = actor (CMC_CANISTER_ID) : CMCTypes.Self;
    let response = await cmc.get_icp_xdr_conversion_rate();
    Nat64.toNat(response.data.xdr_permyriad_per_icp);
  };

  func getXrcRate(base : Text, quote : Text) : async ?(Nat64, Nat32) {
    let xrc = actor (XRC_CANISTER_ID) : XRCTypes.Self;
    try {
      let result = await (with cycles = XRC_CYCLES_COST) xrc.get_exchange_rate({
        base_asset = { symbol = base; class_ = #Cryptocurrency };
        quote_asset = { symbol = quote; class_ = #FiatCurrency };
        timestamp = null;
      });
      switch (result) {
        case (#Ok(rate)) {
          ?(rate.rate, rate.metadata.decimals);
        };
        case (#Err(_)) {
          null;
        };
      };
    } catch (_) {
      null;
    };
  };

  func verifyCanisterOwner(cId : Principal, caller : Principal) : Bool {
    switch (StorageDeployerOrchestrator.findOwnerByCanister(creations, cId)) {
      case (?owner) Principal.equal(owner, caller);
      case null false;
    };
  };

  func formatUsdCents(cents : Nat) : Text {
    let whole = cents / 100;
    let fractional = cents % 100;
    "$" # Nat.toText(whole) # "." # (if (fractional < 10) "0" else "") # Nat.toText(fractional);
  };

  func transferIcpToCmcInner(icpE8s : Nat, targetCanisterId : Principal, fromSubaccount : ?Blob) : async Result.Result<Nat, Text> {
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
      from_subaccount = fromSubaccount;
      created_at_time = ?{
        timestamp_nanos = Nat64.fromNat(Int.abs(Time.now()));
      };
      amount = { e8s = Nat64.fromNat(icpE8s) };
    });
    switch (transferResult) {
      case (#Ok(blockIndex)) #ok(Nat64.toNat(blockIndex));
      case (#Err(err)) #err("ICP transfer failed: " # debug_show err);
    };
  };

  /// Transfer ICP from the treasury subaccount to CMC for a target
  /// canister. Caller must ensure sufficient balance via
  /// `guardTreasuryIcpReserve`, including the ledger fee. `icpE8s`
  /// is the amount CMC should receive; the ledger fee is charged
  /// separately by `ledger.transfer`. CMC `#Refunded` returns ICP to
  /// the same subaccount, keeping the round-trip inside treasury.
  func transferIcpToCmc(icpE8s : Nat, targetCanisterId : Principal) : async Result.Result<Nat, Text> {
    await transferIcpToCmcInner(icpE8s, targetCanisterId, ?TreasuryConst.treasurySubaccount());
  };

  /// Notify CMC of an ICP deposit → cycles credit. Raw `NotifyError`
  /// variant passes through so callers can classify via the CmcRecovery
  /// classifier.
  func notifyTopUpCmc(blockIndex : Nat64, targetCanisterId : Principal) : async Result.Result<Nat, CMCTypes.NotifyError> {
    let cmc = actor (CMC_CANISTER_ID) : CMCTypes.Self;
    let result = await cmc.notify_top_up({
      block_index = blockIndex;
      canister_id = targetCanisterId;
    });
    switch (result) {
      case (#Ok(cycles)) #ok(cycles);
      case (#Err(err)) #err(err);
    };
  };

  /// Retry `notify_create_canister` with the original settings (controllers,
  /// env vars, subnet). CMC applies these only if the block isn't yet
  /// resolved — `null` would risk mis-configured canister in that window.
  func retryCmcCreateCanisterForCreation(
    creationId : Nat,
    blockIndex : Nat,
  ) : async Result.Result<Principal, CMCTypes.NotifyError> {
    let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
      return #err(#Other({ error_message = "creation record missing for id=" # Nat.toText(creationId); error_code = 0 }));
    };
    let envVars = StorageDeployerOrchestrator.buildEnvironmentVariables(storageOrchestrator, record.envPairs, null);
    let subnetSelection : ?CMCTypes.SubnetSelection = switch (record.subnetId) {
      case (?subnet) ?#Subnet({ subnet });
      case null null;
    };
    let cmc = actor (CMC_CANISTER_ID) : CMCTypes.Self;
    let result = await cmc.notify_create_canister({
      block_index = Nat64.fromNat(blockIndex);
      controller = canisterId;
      subnet_selection = subnetSelection;
      settings = ?{
        controllers = ?[canisterId, record.owner];
        freezing_threshold = null;
        wasm_memory_threshold = null;
        environment_variables = envVars;
        reserved_cycles_limit = null;
        log_visibility = null;
        log_memory_limit = null;
        wasm_memory_limit = null;
        memory_allocation = null;
        compute_allocation = null;
      };
      subnet_type = null;
    });
    switch (result) {
      case (#Ok(cId)) #ok(cId);
      case (#Err(err)) #err(err);
    };
  };

  /// Per-creationId mutex shared between recovery strategies of
  /// `recoverFailedStorage`, `reinstallFailedStorageWasm`, and the
  /// CmcRecovery Timer continuation.
  /// Acquired synchronously at entry (before any `await`) so concurrent
  /// calls on the same id see the lock and bail. Transient — on upgrade
  /// the set resets (in-flight messages are lost anyway).
  transient let creationLocks = Set.empty<Nat>();

  /// Internal resume — no caller auth, shared by `recoverFailedStorage` and
  /// CmcRecovery Timer continuation. Idempotent: invalid preconditions
  /// (missing / non-failed / refunded creation) return `#err` with no side
  /// effects. Takes `creationLocks` internally — concurrent invocations on
  /// the same id serialize.
  func resumeFailedCreationInternal(creationId : Nat) : async Result.Result<(), Text> {
    if (Set.contains(creationLocks, Nat.compare, creationId)) {
      return #err("another refund, resume, or reinstall is in progress for this creation");
    };
    Set.add(creationLocks, Nat.compare, creationId);

    try {
      let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
        return #err("creation not found");
      };
      let isFailed = switch (record.status) {
        case (#Failed _) true;
        case _ false;
      };
      if (not isFailed) return #err("creation is not in failed state");
      let ?paymentId = record.licensePaymentId else {
        return #err("no license on record — use purchase flow instead");
      };
      let ?license = StorageDeployerOrchestrator.findLicenseByPaymentId(licenses, record.owner, paymentId) else {
        return #err("license for payment not found");
      };
      switch (license.receipt.status) {
        case (#completed) {};
        case (#refunded _) return #err("license was refunded — cannot resume");
      };

      // Checkpoint-aware target: existing canister → Link, else → fresh Create.
      let target : StorageDeployerOrchestrator.TargetCanister = switch (record.canisterId) {
        case (?id) #Existing(id);
        case null #Create({
          initialCycles = STORAGE_INITIAL_CYCLES;
          subnetId = null;
        });
      };

      ignore StorageDeployerOrchestrator.startStorageCreation<system>(
        storageOrchestrator,
        creations,
        creationId,
        {
          releaseSelector = #Version(record.releaseTag);
          initArg = record.initArg;
          envPairs = record.envPairs;
          target;
        },
        orchestratorCallbacks,
      );
      #ok();
    } finally {
      Set.remove(creationLocks, Nat.compare, creationId);
    };
  };

  /// Internal repair for failed initial creations whose canister exists but
  /// cannot continue via plain #install. This uses management-canister
  /// #reinstall, so it is deliberately kept out of the normal resume path.
  func reinstallFailedCreationWasmInternal(creationId : Nat) : async Result.Result<(), Text> {
    if (Set.contains(creationLocks, Nat.compare, creationId)) {
      return #err("another refund, resume, or reinstall is in progress for this creation");
    };
    Set.add(creationLocks, Nat.compare, creationId);

    try {
      let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
        return #err("creation not found");
      };
      let isFailed = switch (record.status) {
        case (#Failed _) true;
        case _ false;
      };
      if (not isFailed) return #err("creation is not in failed state");
      let ?paymentId = record.licensePaymentId else {
        return #err("no license on record — use purchase flow instead");
      };
      let ?license = StorageDeployerOrchestrator.findLicenseByPaymentId(licenses, record.owner, paymentId) else {
        return #err("license for payment not found");
      };
      switch (license.receipt.status) {
        case (#completed) {};
        case (#refunded _) return #err("license was refunded — cannot reinstall");
      };

      await StorageDeployerOrchestrator.reinstallFailedCreationWasm<system>(
        storageOrchestrator,
        creations,
        creationId,
        orchestratorCallbacks,
      );
    } finally {
      Set.remove(creationLocks, Nat.compare, creationId);
    };
  };

  /// Internal refund — idempotent contract. Missing / already-refunded /
  /// post-canister-creation states return `#err` with no side effects. This
  /// lets CmcRecovery retry race with parallel admin calls safely.
  func refundFailedCreationInternal(creationId : Nat) : async Result.Result<(), Text> {
    if (Set.contains(creationLocks, Nat.compare, creationId)) {
      return #err("another refund, resume, or reinstall is in progress for this creation");
    };
    Set.add(creationLocks, Nat.compare, creationId);

    try {
      let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
        return #err("creation not found");
      };
      let owner = record.owner;
      let isFailed = switch (record.status) {
        case (#Failed _) true;
        case _ false;
      };
      if (not isFailed) return #err("creation is not in failed state");
      if (record.canisterId != null) {
        return #err("canister already created — cannot refund; use #resume instead");
      };
      let ?paymentId = record.licensePaymentId else {
        return #err("no license on record");
      };
      let ?license = StorageDeployerOrchestrator.findLicenseByPaymentId(licenses, owner, paymentId) else {
        return #err("license for payment not found");
      };
      switch (license.receipt.status) {
        case (#completed) {};
        case (#refunded _) return #err("already refunded");
      };

      try {
        switch (await* treasurySimpleRefund(owner, license.receipt.tokenId, license.receipt.amount)) {
          case (#err msg) #err("refund transfer failed: " # msg);
          case (#ok _) {
            ignore StorageDeployerOrchestrator.markLicenseRefunded(
              licenses,
              owner,
              paymentId,
              null,
              "creation failed before canister existed",
            );
            ignore StorageDeployerOrchestrator.removeRefundedCreation(creations, creationId);
            emitBackendAdminNotification(#creationRefunded({ creationId; owner; tokenId = debug_show license.receipt.tokenId; amount = license.receipt.amount }));
            #ok();
          };
        };
      } catch (err) {
        #err("refund rejected: " # Error.message(err));
      };
    } finally {
      Set.remove(creationLocks, Nat.compare, creationId);
    };
  };

  include CmcRecoveryMixin(
    { assertAdmin },
    { simpleRefund = treasurySimpleRefund },
    {
      notifyTopUp = notifyTopUpCmc;
      notifyCreateCanisterForCreation = retryCmcCreateCanisterForCreation;
    },
    {
      get = creations.get;
      mutate = creations.mutate;
    },
    {
      resumeFailedCreationInternal;
      refundFailedCreationInternal;
      events = backendEvents;
      selfCanisterId = canisterId;
      settleIncludedFundingReservation;
    },
  );

  orchestratorCallbacks := {
    orchestratorCallbacks with
    onCmcNotifyFailed = ?(
      func(creationId : Nat, blockIndex : Nat, err : CMCTypes.NotifyError) : async* () {
        let refund : ?CmcRecovery.RefundContext = switch (StorageDeployerOrchestrator.getCreationRecordById(creations, creationId)) {
          case (?record) {
            switch (record.licensePaymentId) {
              case (?paymentId) {
                switch (StorageDeployerOrchestrator.findLicenseByPaymentId(licenses, record.owner, paymentId)) {
                  case (?license) ?{
                    payer = record.owner;
                    tokenId = license.receipt.tokenId;
                    amount = license.receipt.amount;
                  };
                  case null null;
                };
              };
              case null null;
            };
          };
          case null null;
        };
        ignore await* handleCmcNotifyError(#storageCreation({ creationId }), blockIndex, refund, err);
      }
    );
  };

  include BalanceMixin(
    { assertAdmin },
    {
      getExpiring = getExpiringSubscriptions;
      getExpired = getExpiredSubscriptions;
      activate = activateSubscriptionInternal;
      renew = renewSubscriptionInternal;
      get = getSubscriptionInternal;
      grantPaidPeriod = grantPaidPeriodInternal;
    },
    {
      chargeAndDistribute = treasuryChargeAndDistribute;
      getBalance = treasuryGetBalance;
      simpleTransfer = treasurySimpleTransfer;
      simpleRefund = treasurySimpleRefund;
      getIcpBalance = treasuryGetIcpBalance;
    },
    { getIcpXdrRate; getXrcRate },
    {
      getUserSettings;
      getAmbassadorChain;
      events = backendEvents;
      verifyCanisterOwner;
      transferIcpToCmc;
      notifyTopUp = notifyTopUpCmc;
      cmcHandleNotifyError = handleCmcNotifyError;
      selfCanisterId = canisterId;
      backendCyclesThreshold = BACKEND_CYCLES_THRESHOLD;
      backendCyclesTarget = BACKEND_CYCLES_TARGET;
      onSubscriptionChanged = notifyUserStoragesSubscriptionChanged;
      registerIncludedFundingSettlement = registerIncludedFundingSettlementHook;
    },
  );

  // --- Storage Deployer Helpers ---

  func handleAssetDownloaded(details : StorageDeployerOrchestrator.DownloadDetails) {
    if (Text.contains(details.name, #text ".wasm")) {
      registerWasmHash(details.sha256, details.key);
    };
  };

  orchestratorCallbacks := {
    orchestratorCallbacks with
    onAssetDownloaded = ?handleAssetDownloaded;
  };

  transient let startCallbacks : StorageDeployerOrchestrator.StartCallbacks = {
    onAssetDownloaded = ?handleAssetDownloaded;
    orchestrator = orchestratorCallbacks;
  };

  func syncDownloadedWasmHashes() {
    for ((hash, tag) in storageOrchestrator.getDownloadedWasmHashes().vals()) {
      registerWasmHash(hash, tag);
    };
  };

  // --- System lifecycle ---

  system func preupgrade() {
    storageOrchestrator.stop();
  };

  ignore Timer.setTimer<system>(
    #seconds 0,
    func() : async () {
      await StorageDeployerOrchestrator.start<system>(storageOrchestrator, creations, startCallbacks);
      syncDownloadedWasmHashes();
    },
  );

  // Payment queue drain: check every 10 seconds if there are queued webhook events.
  ignore Timer.recurringTimer<system>(
    #seconds(10),
    func() : async () {
      schedulePaymentDrain<system>();
    },
  );

  // Daily timer: expire subscriptions + auto-renew
  ignore Timer.recurringTimer<system>(
    #seconds(86400),
    func() : async () {
      let expiredUsers = expireOverdueSubscriptions();
      for (userId in expiredUsers.vals()) {
        emitBackendNotification(userId, #subscriptionExpired);
        await notifyUserStoragesSubscriptionChanged(userId);
      };
      syncDownloadedWasmHashes();
      processAutoRenewals<system>();
    },
  );

  /// Purchase a license and kick off storage creation. Returns the creation
  /// id immediately — charge + deploy run asynchronously on the orchestrator
  /// side. Frontend polls `listCreations({filter.id=[id]})` to follow progress.
  ///
  /// The initial record is created with `#ProcessingPayment(#Starting)`. A
  /// detached Timer picks up the flow on the next tick and transitions the
  /// record through all payment phases (`FetchingRates`, `Charging`,
  /// `RecordingLicense`, `Queueing`) before handing off to the
  /// unified deploy queue.
  public shared ({ caller }) func purchaseLicenseAndCreateStorage(
    storageBackendType : Payments.StorageBackendType,
    vetKeyLevel : Payments.StorageVetKeyLevel,
  ) : async Result.Result<Nat, PurchaseError> {
    assert not Principal.isAnonymous(caller);

    // Opportunistic self-topup trigger. Fire-and-forget — doesn't delay the purchase.
    maybeTopUpSelf<system>();

    let initArg = Payments.encodeStorageInitArg(caller, ?storageBackendType);
    let options : StorageDeployerOrchestrator.CreateStorageOptions = {
      releaseSelector = storageReleaseConfig.installSelector;
      initArg;
      envPairs = Payments.sanitizeEnvPairs(storageVetKeyEnv<system>(vetKeyLevel));
      target = #Create({
        initialCycles = STORAGE_INITIAL_CYCLES;
        subnetId = null;
      });
    };

    // 1. Create record with #ProcessingPayment(#Starting) — visible in
    //    listStorages immediately, timeline seeded with the initial event.
    let creationId = switch (storageOrchestrator.createStorageRecord(creations, caller, options)) {
      case (#ok(id)) id;
      case (#err(#AlreadyInProgress)) return #err(#ActivationFailed("Storage creation already in progress"));
      case (#err(#ReleaseNotFound)) return #err(#ActivationFailed("No storage release is ready for deployment"));
      case (#err(e)) return #err(#ActivationFailed(debug_show e));
    };
    emitCreationRecordChanged(creationId);

    // 2. Schedule charge + deploy on a separate message. User gets the id back
    //    within milliseconds regardless of how long the payment pipeline takes.
    ignore Timer.setTimer<system>(
      #seconds 0,
      func() : async () {
        await processPaymentAndStart<system>(caller, creationId, options);
      },
    );

    #ok(creationId);
  };

  /// Background payment pipeline. Runs after the synchronous part of
  /// `purchaseLicenseAndCreateStorage` has returned `creationId` to the user.
  /// Every phase advances `record.status` via `appendEvent` so the timeline
  /// reflects exactly what the backend is doing right now.
  func processPaymentAndStart<system>(
    caller : Principal,
    creationId : Nat,
    options : StorageDeployerOrchestrator.CreateStorageOptions,
  ) : async () {
    // Bail out if the record has been removed (rare: deleteStorage between
    // the outer call returning and this timer tick firing).
    if (Option.isNull(StorageDeployerOrchestrator.getCreationRecordById(creations, creationId))) return;

    // Phases emitted from inside chargeForLicense (FetchingRates → CheckingBalances → Charging).
    // The callback maps Balance.ChargePhase into CreationStatus variants so the
    // user sees "Fetching exchange rates" → "Checking your balances" → "Charging 0.054 SOL"
    // with meaningful timing, rather than one long "Fetching" stall.
    let onChargePhase = func(phase : Balance.ChargePhase) {
      let status : StorageDeployerOrchestrator.CreationStatus = switch (phase) {
        case (#fetchingRates) #ProcessingPayment(#FetchingRates);
        case (#checkingBalances) #ProcessingPayment(#CheckingBalances);
        case (#charging(c)) #ProcessingPayment(#Charging(c));
      };
      appendCreationEvent(creationId, status);
    };

    let chargeResult = try {
      await* chargeForLicense<system>(caller, onChargePhase);
    } catch (err) {
      appendCreationEvent(creationId, #Failed("Charge trapped: " # Error.message(err)));
      return;
    };

    let charged = switch (chargeResult) {
      case (#ok(c)) c;
      case (#insufficientFunds(details)) {
        appendCreationEvent(creationId, #Failed("Insufficient funds: need " # formatUsdCents(details.required)));
        return;
      };
      case (#err(msg)) {
        appendCreationEvent(creationId, #Failed("Charge failed: " # msg));
        return;
      };
    };

    // Record license — this is the commit point for the payment.
    appendCreationEvent(creationId, #ProcessingPayment(#RecordingLicense));
    let receipt : StorageDeployerOrchestrator.PaymentReceipt = {
      tokenId = charged.tokenId;
      amount = charged.amount;
      paymentId = charged.paymentId;
      paidAt = Time.now();
      status = #completed;
    };
    switch (StorageDeployerOrchestrator.addLicense(licenses, caller, receipt, currentStorageLicenseLimits)) {
      case (#ok()) {};
      case (#err(#DuplicatePayment)) {}; // Idempotent
    };
    StorageDeployerOrchestrator.setLicensePaymentId(creations, creationId, charged.paymentId);

    // Hand off to the deploy queue. startStorageCreation will flip the record
    // to #Pending (distinct tag — new timeline event).
    appendCreationEvent(creationId, #ProcessingPayment(#Queueing));
    switch (StorageDeployerOrchestrator.startStorageCreation<system>(storageOrchestrator, creations, creationId, options, orchestratorCallbacks)) {
      case (#ok()) {};
      case (#err(e)) appendCreationEvent(creationId, #Failed("Start failed: " # e));
    };
  };

  public type RecoveryStrategy = { #resume; #refund };

  /// Recover a failed storage creation. Owner OR admin may call.
  ///
  /// Strategies:
  ///   - `#resume`: re-queue the deploy. Checkpoint-aware —
  ///     * `record.canisterId == null`  → `#CreateCanister` (treasury ICP intact)
  ///     * `record.canisterId == ?id`   → `#LinkCanister(id)` (point-of-no-return crossed)
  ///     Preserves original `initArg` + `envPairs`. Refuses if the license was refunded.
  ///   - `#refund`: ICP goes back to the owner, license flips `#refunded`,
  ///     creation record is deleted. Only allowed BEFORE `#CanisterCreated` —
  ///     once the canister exists, cycles can't be recovered.
  ///
  /// Both strategies share the same per-creationId lock (`creationLocks`), so
  /// concurrent recover calls on the same id serialize: the loser sees
  /// "another refund or resume is in progress".
  public shared ({ caller }) func recoverFailedStorage(
    creationId : Nat,
    strategy : RecoveryStrategy,
  ) : async Result.Result<(), Text> {
    assert not Principal.isAnonymous(caller);

    // Auth first — internal helpers skip this (Timer self-calls from
    // CmcRecovery retry go through them directly).
    let ?owner = StorageDeployerOrchestrator.getCreationOwner(creations, creationId) else {
      return #err("creation not found");
    };
    if (not Principal.equal(caller, owner) and not isAdminPrincipal(caller)) {
      return #err("not owner and not admin");
    };

    switch (strategy) {
      case (#resume) await resumeFailedCreationInternal(creationId);
      case (#refund) await refundFailedCreationInternal(creationId);
    };
  };

  /// Admin-only recovery for non-terminal creations that lost their transient
  /// queue/timer state. Upgrades are reverted to Completed; initial creations
  /// become Failed and can then use the regular recoverFailedStorage flow.
  public shared ({ caller }) func recoverStuckCreation(
    creationId : Nat
  ) : async Result.Result<(), Text> {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.recoverStuckCreation(
      storageOrchestrator,
      creations,
      creationId,
      "Interrupted by admin recovery",
    );
  };

  /// Owner-or-admin repair for failed initial creations whose canister already
  /// exists but cannot be resumed with a plain install. Reinstalls the latest
  /// storage WASM, so completed storages and failed upgrades are rejected.
  public shared ({ caller }) func reinstallFailedStorageWasm(
    creationId : Nat
  ) : async Result.Result<(), Text> {
    assert not Principal.isAnonymous(caller);

    let ?owner = StorageDeployerOrchestrator.getCreationOwner(creations, creationId) else {
      return #err("creation not found");
    };
    if (not Principal.equal(caller, owner) and not isAdminPrincipal(caller)) {
      return #err("not owner and not admin");
    };

    await reinstallFailedCreationWasmInternal(creationId);
  };

  /// List licenses with optional filter + pagination. Callers omit `options`
  /// (`[]`) to get the caller's own licenses with defaults. Non-admins are
  /// pinned to their own `owner` regardless of filter.owner passed in.
  public query ({ caller }) func listLicenses(
    options : ?StorageDeployerOrchestrator.ListLicensesOptions
  ) : async StorageDeployerOrchestrator.GetLicensesResponse {
    assert not Principal.isAnonymous(caller);
    let opts = Option.get(options, StorageDeployerOrchestrator.DEFAULT_LIST_LICENSES_OPTIONS);
    let pinned = { opts with filter = { opts.filter with owner = ?[caller] } };
    let effective = if (isAdminPrincipal(caller)) opts else pinned;
    StorageDeployerOrchestrator.listLicensesWithOptions(licenses, effective);
  };

  // --- Storage Deployer API ---

  public query ({ caller }) func listStorages() : async [StorageDeployerOrchestrator.StorageInfo] {
    assert not Principal.isAnonymous(caller);
    storageOrchestrator.listStorages(creations, caller);
  };

  public query ({ caller }) func listSharedWithMeStorages() : async [SharedAccess.SharedStorageAccess] {
    assert not Principal.isAnonymous(caller);
    SharedAccess.listForPrincipal(sharedAccess, caller);
  };

  public query ({ caller }) func listSharedWithMeStorageViews() : async [SharedStorageAccessView] {
    assert not Principal.isAnonymous(caller);
    Array.map<SharedAccess.SharedStorageAccess, SharedStorageAccessView>(
      SharedAccess.listForPrincipal(sharedAccess, caller),
      func(access) {
        let record = creations.findByCanister(access.storageCanisterId);
        {
          access;
          storageStatus = switch (record) {
            case (?value) ?value.status;
            case null null;
          };
          updateAvailable = StorageDeployerOrchestrator.checkStorageUpdate(storageOrchestrator, creations, access.storageCanisterId);
        };
      },
    );
  };

  /// Register an externally-deployed storage canister with this backend.
  ///
  /// Required: caller must be a controller of `canisterId`, and the
  /// canister's `module_hash` must match one of the known Rabbithole
  /// storage WASM releases.
  ///
  /// Ownership semantics — important:
  ///   - `record.owner = caller` (the controller who registered it).
  ///     This is the *billing owner* in our backend — who pays for
  ///     managed services (auto-topup, notifications, listStorages).
  ///   - The storage canister's internal `initArgs.owner` (who holds
  ///     VetKey root permissions, data access) can be a DIFFERENT
  ///     principal — controller ≠ data owner on IC.
  ///   - That divergence is intentional. A controller registers the
  ///     canister for managed services; data access stays gated by
  ///     the storage canister's permission rules (see
  ///     `createAccessBatch` / `revokeAccessBatch`).
  ///
  /// Backend id trust — not verified:
  ///   - Caller could have set `PUBLIC_CANISTER_ID:rabbithole-backend`
  ///     env var to a different backend, in which case the canister's
  ///     subscription gates and auto-topup calls would route elsewhere.
  ///     That's self-sabotage (controller loses Pro features), not a
  ///     risk for us — so we don't verify.
  ///
  /// Storage license entitlement is attached only through the paid creation
  /// flow. Imported canisters do not receive included encrypted storage quota.
  public shared ({ caller }) func addStorage(
    canisterId : Principal,
    initArg : Blob,
  ) : async Result.Result<Nat, StorageDeployerOrchestrator.AddStorageError> {
    assert not Principal.isAnonymous(caller);
    await StorageDeployerOrchestrator.addStorage(storageOrchestrator, creations, caller, canisterId, initArg, isKnownWasm);
  };

  public shared ({ caller }) func deleteStorage(storageId : Nat) : async Result.Result<(), StorageDeployerOrchestrator.DeleteStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.deleteStorage(creations, caller, storageId);
  };

  /// List creations with optional filter + pagination. Callers omit `options`
  /// (`[]`) to get the caller's own creations with defaults. Non-admins are
  /// pinned to their own `owner` regardless of filter.owner passed in.
  /// Records include current status/progress, but omit full timeline,
  /// diagnostics and recovery payload. Use `getCreationDetail` for a row's
  /// popover/details panel.
  public query ({ caller }) func listCreations(
    options : ?StorageDeployerOrchestrator.ListCreationsOptions
  ) : async StorageDeployerOrchestrator.GetCreationsResponse {
    assert not Principal.isAnonymous(caller);
    let opts = Option.get(options, StorageDeployerOrchestrator.DEFAULT_LIST_CREATIONS_OPTIONS);
    let pinned = { opts with filter = { opts.filter with owner = ?[caller] } };
    let effective = if (isAdminPrincipal(caller)) opts else pinned;
    creations.list(effective);
  };

  /// Full creation detail with timeline and diagnostics. Non-admin callers can
  /// only read their own records.
  public query ({ caller }) func getCreationDetail(
    creationId : Nat
  ) : async ?StorageDeployerOrchestrator.StorageCreationRecord {
    assert not Principal.isAnonymous(caller);
    switch (StorageDeployerOrchestrator.getCreationRecordById(creations, creationId)) {
      case (?record) {
        if (isAdminPrincipal(caller) or Principal.equal(caller, record.owner)) {
          ?record;
        } else {
          null;
        };
      };
      case null null;
    };
  };

  public shared ({ caller }) func startStorageUpgrade(
    canisterId : Principal,
    releaseTag : Text,
    observedState : StorageDeployerOrchestrator.StorageReleaseState,
  ) : async Result.Result<(), StorageDeployerOrchestrator.UpgradeStorageError> {
    assert not Principal.isAnonymous(caller);
    await StorageDeployerOrchestrator.startStorageUpgrade<system>(storageOrchestrator, creations, caller, canisterId, releaseTag, observedState, orchestratorCallbacks);
  };

  public shared ({ caller }) func prepareStorageRelease(releaseTag : Text) : async Result.Result<(), Text> {
    assertAdmin(caller);
    StorageDeployerOrchestrator.prepareStorageRelease<system>(storageOrchestrator, releaseTag, ?handleAssetDownloaded);
  };

  public query func getStorageUpgradePlan(
    canisterId : Principal,
    remoteState : StorageDeployerOrchestrator.StorageReleaseState,
  ) : async Result.Result<StorageDeployerOrchestrator.StorageReleaseOptionsResult, StorageDeployerOrchestrator.UpgradeStorageError> {
    StorageDeployerOrchestrator.getStorageUpgradePlan(storageOrchestrator, creations, canisterId, remoteState);
  };

  public shared ({ caller }) func startStorageDeployer() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.start<system>(storageOrchestrator, creations, startCallbacks);
  };

  public shared ({ caller }) func stopStorageDeployer() : async () {
    assertAdmin(caller);
    storageOrchestrator.stop();
  };

  public query func isStorageDeployerRunning() : async Bool {
    storageOrchestrator.isRunning();
  };

  /// Admin-only retry for a creation whose deferred ambassador payout
  /// landed in `#failed`. Re-invokes the payout; on success the record's
  /// `ambassadorPayoutStatus` flips to `#completed` (or back to `#failed`
  /// with the new reason). Idempotent via the treasury dedup set — if
  /// the payout had actually succeeded and only the status-stamp failed,
  /// treasury returns `#AlreadyProcessed` which we translate to `#completed`.
  public shared ({ caller }) func retryAmbassadorPayout(creationId : Nat) : async Result.Result<(), Text> {
    assertAdmin(caller);
    let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
      return #err("creation not found");
    };
    let ?paymentId = record.licensePaymentId else {
      return #err("creation has no license — nothing to pay out");
    };
    await* payAmbassadorShareForPayment(creationId, record.owner, paymentId);
    #ok();
  };

  // --- Storage Canister Callbacks ---

  public shared ({ caller }) func onStorageLowCycles(
    balance : Nat,
    daysLeft : Nat,
    severity : { #warning; #critical },
  ) : async () {
    let ?storageOwner = StorageDeployerOrchestrator.findOwnerByCanister(creations, caller) else return;
    emitBackendNotification(storageOwner, #lowCycles({ canisterId = caller; remaining = balance; estimatedDaysLeft = daysLeft; severity }));
    backendEvents.emit(#cyclesAlert({ target = #storage({ accountOwner = storageOwner; canisterId = caller }); remaining = balance; threshold = null; estimatedDaysLeft = ?daysLeft; severity }));
    // Trigger auto top-up if user has it enabled
    await processAutoTopUp(storageOwner, caller, balance, severity);
  };

  public shared ({ caller }) func ensureStorageCyclesForUpload(
    request : EnsureStorageCyclesForUploadRequest
  ) : async Result.Result<{ cyclesAdded : ?Nat; requiredBalance : Nat }, Text> {
    let ?storageOwner = StorageDeployerOrchestrator.findOwnerByCanister(creations, caller) else {
      return #err("Unknown storage canister");
    };

    let requiredBalance = request.requiredBalance;
    if (request.currentBalance >= requiredBalance) {
      return #ok({ cyclesAdded = null; requiredBalance });
    };

    switch (await ensureAutoTopUpForStorageOperation<system>(storageOwner, caller, request.currentBalance, requiredBalance)) {
      case (#ok(info)) #ok({ cyclesAdded = ?info.cyclesAdded; requiredBalance });
      case (#err(message)) #err(message);
    };
  };

  public shared ({ caller }) func onStorageAccessChanged(envelope : BackendEvents.StorageAccessChanged) : async () {
    let ?storageOwner = StorageDeployerOrchestrator.findOwnerByCanister(creations, caller) else return;
    let normalizedEnvelope = StorageAccessBackendConsumer.normalizeStorageAccessChanged(storageOwner, caller, envelope);
    let matchedEmailRecipients = switch (StorageAccessBackendConsumer.pendingEmailCommitment(normalizedEnvelope)) {
      case (?commitment) {
        StorageAccessBackendConsumer.verifiedEmailPrincipalsForCommitment(users.listVerifiedEmailIdentities(), normalizedEnvelope.storageCanisterId, commitment);
      };
      case null [];
    };
    StorageAccessBackendConsumer.apply(sharedAccess, normalizedEnvelope, matchedEmailRecipients);
    backendEvents.emit(#storageAccessChanged(normalizedEnvelope));
    switch (StorageAccessBackendConsumer.pendingEmailCommitment(normalizedEnvelope)) {
      case (?commitment) {
        for (principal in matchedEmailRecipients.vals()) {
          await claimStorageEmailAccessByCommitment(principal, normalizedEnvelope.storageCanisterId, commitment);
        };
      };
      case null {};
    };
  };

  public query func getStorageReleaseAdminStatus() : async StorageDeployerOrchestrator.ReleasesFullStatus {
    storageOrchestrator.getStorageReleaseAdminStatus();
  };

  public shared ({ caller }) func refreshStorageReleaseIndex() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.refreshStorageReleaseIndex<system>(storageOrchestrator, ?handleAssetDownloaded);
  };

  // --- HTTP interface: ICPay webhook only ---

  transient let app = Liminal.App({
    middleware = Array.concat<LiminalApp.Middleware>(
      [CORSMiddleware.default()],
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

};
