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
import Runtime "mo:core/Runtime";

import Liminal "mo:liminal";
import LiminalApp "mo:liminal/App";
import ZenDB "mo:zendb";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";

import TreasuryTypes "mo:treasury/Types";
import TreasuryConst "mo:treasury/Const";
import Payments "Payments/lib";
import StorageDeployerOrchestrator "StorageDeployer";
import CMCTypes "Types/CMCTypes";
import LedgerTypes "Types/LedgerTypes";
import XRCTypes "Types/XRCTypes";
import Account "StorageDeployer/Utils/Account";

import KnownWasmHashesMixin "KnownWasmHashes/mixin";
import UsersMixin "Users/mixin";
import IdentityVerificationMixin "IdentityVerification/mixin";
import ProfilesMixin "Profiles/mixin";
import NotificationsMixin "Notifications/mixin";
import SettingsMixin "Settings/mixin";
import TreasuryMixin "Treasury/mixin";
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

  // --- Assets & HTTP ---

  var assetStableData = HttpAssets.init_stable_store(canisterId, installer);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  transient var assetStore = HttpAssets.Assets(assetStableData, null);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // --- Database ---

  let zendb = ZenDB.newStableStore(canisterId, null);
  transient let db = ZenDB.launchDefaultDB(zendb);

  // --- Storage Deployer ---

  transient let backendThresholdKeyName = Utils.envText<system>("THRESHOLD_KEY_NAME", "key_1");

  let storageOrchestrator = StorageDeployerOrchestrator.new<system>({
    github = {
      apiUrl = Utils.envText<system>("GITHUB_API_URL", "https://api.github.com");
      owner = Utils.envText<system>("GITHUB_OWNER", "rabbithole-app");
      repo = Utils.envText<system>("GITHUB_REPO", "v2");
      token = Runtime.envVar<system>("GITHUB_TOKEN");
    };
    assets = [(#LatestDraft, [#StorageWASM("encrypted-storage.wasm.gz"), #StorageFrontend("storage-frontend.tar")])];
  });
  storageOrchestrator.canisterId := ?canisterId;

  // Transient ZenDB class handles — recreated on every upgrade, backing
  // rows persist via the stable `db` store.
  transient let licenses = LicensesClass.Licenses(db);
  transient let creations = CreationsClass.Creations(db);

  // Callback the orchestrator fires from its queue when a fresh canister is
  // minted for a creation that has an attached license.
  transient let bindLicenseCallback : StorageDeployerOrchestrator.BindLicense =
    func(owner, paymentId, cid) = licenses.bind(owner, paymentId, cid);

  // `orchestratorCallbacks` is declared AFTER the mixins below so its
  // payAmbassadorShareCallback can reference `getAmbassadorChain` and
  // `treasuryDistributeAmbassadorShare` (both provided by Users / Treasury
  // mixins). See the second declaration near the bottom of the actor body.

  // --- Mixins (order matters: dependencies first) ---
  //
  // Profiles must come before Users because Users reads `resolveReferralCode`.
  // Users must come before every admin-guarded mixin (KnownWasmHashes, Treasury,
  // Subscriptions, Payments, Balance) because Users provides `assertAdmin` — the
  // guard is backed by `user.role == #admin` rather than a separate set.

  include ProfilesMixin(
    db,
    installer,
    {
      deleteAsset = func(key : Text) { if (assetStore.exists(key)) assetCanister.delete_asset(canisterId, { key }) };
      storeAsset = func(caller : Principal, args : HttpAssets.StoreArgs) { assetCanister.store(caller, args) };
    },
  );
  include UsersMixin(installer, db, { resolveReferralCode });
  include IdentityVerificationMixin({
    upsertFromVerifiedAttributes;
  });
  include KnownWasmHashesMixin({ assertAdmin });
  include NotificationsMixin();
  include SettingsMixin();
  include TreasuryMixin(
    {
      canisterId;
      thresholdKeyName = backendThresholdKeyName;
      chains = initArgs.chains;
    },
    { assertAdmin },
  );
  include SubscriptionsMixin(
    db,
    { assertAdmin },
    {
      findOwnerByCanister = func(cId : Principal) : ?Principal = StorageDeployerOrchestrator.findOwnerByCanister(creations, cId);
      isKnownWasm;
      hasUsedTrial;
      markTrialUsed;
      userExists;
    },
  );
  let STORAGE_INITIAL_CYCLES : Nat = 1_500_000_000_000;

  /// Fanout a notification to every principal with role = #admin.
  /// `users` comes from `UsersMixin`; `notifyUser` from `NotificationsMixin`.
  /// Skips iteration if no admins exist (bootstrap race).
  func notifyAdmins(event : Notifications.TypedEvent) {
    for (admin in users.listByRole(#admin).vals()) {
      notifyUser(admin, event);
    };
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
      notifyAdminsOnPayoutFailure(creationId, owner, status);
    } catch (e) {
      Debug.print("[ambassador payout] trapped creationId=" # Nat.toText(creationId) # ": " # Error.message(e));
      let status : StorageDeployerOrchestrator.AmbassadorPayoutStatus = #failed("trapped: " # Error.message(e));
      StorageDeployerOrchestrator.setAmbassadorPayoutStatus(creations, creationId, status);
      notifyAdminsOnPayoutFailure(creationId, owner, status);
    };
  };

  /// Fanout a `#ambassadorPayoutFailed` event to admins when the deferred
  /// payout lands in `#failed` state. Silent on `#completed` / `#pending`
  /// / `#skipped` — those don't need admin attention.
  func notifyAdminsOnPayoutFailure(
    creationId : Nat,
    owner : Principal,
    status : StorageDeployerOrchestrator.AmbassadorPayoutStatus,
  ) {
    switch (status) {
      case (#failed(reason)) notifyAdmins(#ambassadorPayoutFailed({ creationId; owner; reason }));
      case _ {};
    };
  };

  // Fired at #CanisterCreated — the refund point of no return. The callback
  // is awaited inline by the orchestrator so the payout result lands on the
  // creation record before WASM install is queued. Failures are captured in
  // `ambassadorPayoutStatus` rather than bubbling up as a task error.
  transient let payAmbassadorShareCallback : StorageDeployerOrchestrator.PayAmbassadorShare =
    func(creationId : Nat, owner : Principal, paymentId : Text) : async* () {
      await* payAmbassadorShareForPayment(creationId, owner, paymentId);
    };

  // `var` — onCmcNotifyFailed assigned after CmcRecoveryMixin include (below).
  transient var orchestratorCallbacks : StorageDeployerOrchestrator.OrchestratorCallbacks = {
    bindLicense = ?bindLicenseCallback;
    payAmbassadorShare = ?payAmbassadorShareCallback;
    onCmcNotifyFailed = null;
  };

  // --- Internal: create storage for a user (called after license payment) ---
  func createStorageForUserInternal<system>(userId : Principal, initArg : Blob, envPairs : ?[{ name : Text; value : Text }]) : Result.Result<(), Text> {
    let result = StorageDeployerOrchestrator.createStorage<system>(
      storageOrchestrator,
      creations,
      userId,
      {
        releaseSelector = #Latest;
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
    initArgs.icpaySecretKey,
    { assertAdmin },
    {
      notifyUser;
      getAmbassadorChain;
      activateSubscription = activateSubscriptionInternal;
      grantPaidPeriod = grantPaidPeriodInternal;
      distributePayment = treasuryDistributePayment;
      createStorageForUser = createStorageForUserInternal;
      addLicense = func(owner : Principal, receipt : { tokenId : TreasuryTypes.TokenId; amount : Nat; paymentId : Text; paidAt : Int }) : Result.Result<(), { #DuplicatePayment }> {
        StorageDeployerOrchestrator.addLicense(licenses, owner, {
          tokenId = receipt.tokenId;
          amount = receipt.amount;
          paymentId = receipt.paymentId;
          paidAt = receipt.paidAt;
          status = #completed;
        });
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
  transient let BACKEND_CYCLES_TARGET    : Nat = 5_000_000_000_000; // 5 TC

  func getIcpXdrRate() : async Nat {
    let cmc = actor (CMC_CANISTER_ID) : CMCTypes.Self;
    let response = await cmc.get_icp_xdr_conversion_rate();
    Nat64.toNat(response.data.xdr_permyriad_per_icp);
  };

  func getXrcRate(base : Text, quote : Text) : async ?(Nat64, Nat32) {
    let xrc = actor (XRC_CANISTER_ID) : XRCTypes.Self;
    try {
      Debug.print("[xrc] " # base # "/" # quote # " attach=" # Nat.toText(XRC_CYCLES_COST) # " balanceBefore=" # Nat.toText(Cycles.balance()));
      let result = await (with cycles = XRC_CYCLES_COST) xrc.get_exchange_rate({
        base_asset = { symbol = base; class_ = #Cryptocurrency };
        quote_asset = { symbol = quote; class_ = #FiatCurrency };
        timestamp = null;
      });
      Debug.print("[xrc] " # base # "/" # quote # " balanceAfter=" # Nat.toText(Cycles.balance()) # " refunded=" # Nat.toText(Cycles.refunded()));
      switch (result) {
        case (#Ok(rate)) {
          Debug.print("[xrc] " # base # "/" # quote # " ok rate=" # Nat64.toText(rate.rate) # " decimals=" # debug_show rate.metadata.decimals);
          ?(rate.rate, rate.metadata.decimals);
        };
        case (#Err(e)) {
          Debug.print("[xrc] " # base # "/" # quote # " err=" # debug_show e);
          null;
        };
      };
    } catch (e) {
      Debug.print("[xrc] " # base # "/" # quote # " TRAP: " # Error.message(e));
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
      created_at_time = ?{ timestamp_nanos = Nat64.fromNat(Int.abs(Time.now())) };
      amount = { e8s = Nat64.fromNat(icpE8s) };
    });
    switch (transferResult) {
      case (#Ok(blockIndex)) #ok(Nat64.toNat(blockIndex));
      case (#Err(err)) #err("ICP transfer failed: " # debug_show err);
    };
  };

  /// Transfer ICP from the treasury subaccount to CMC for a target
  /// canister. Caller must ensure sufficient balance via
  /// `guardTreasuryIcpReserve`. CMC `#Refunded` returns ICP to the
  /// same subaccount, keeping the round-trip inside treasury.
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
    let envVars = StorageDeployerOrchestrator.buildEnvironmentVariables(storageOrchestrator, record.envPairs);
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

  /// Per-creationId mutex shared between `#resume` and `#refund` strategies
  /// of `recoverFailedStorage` AND the CmcRecovery Timer continuation.
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
      return #err("another refund or resume is in progress for this creation");
    };
    Set.add(creationLocks, Nat.compare, creationId);

    try {
      let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
        return #err("creation not found");
      };
      let isFailed = switch (record.status) { case (#Failed _) true; case _ false };
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
        case null #Create({ initialCycles = STORAGE_INITIAL_CYCLES; subnetId = null });
      };

      ignore StorageDeployerOrchestrator.startStorageCreation<system>(
        storageOrchestrator,
        creations,
        creationId,
        {
          releaseSelector = #Latest;
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

  /// Internal refund — idempotent contract. Missing / already-refunded /
  /// post-canister-creation states return `#err` with no side effects. This
  /// lets CmcRecovery retry race with parallel admin calls safely.
  func refundFailedCreationInternal(creationId : Nat) : async Result.Result<(), Text> {
    if (Set.contains(creationLocks, Nat.compare, creationId)) {
      return #err("another refund or resume is in progress for this creation");
    };
    Set.add(creationLocks, Nat.compare, creationId);

    try {
      let ?record = StorageDeployerOrchestrator.getCreationRecordById(creations, creationId) else {
        return #err("creation not found");
      };
      let owner = record.owner;
      let isFailed = switch (record.status) { case (#Failed _) true; case _ false };
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
            notifyAdmins(#creationRefunded({
              creationId;
              owner;
              tokenId = debug_show license.receipt.tokenId;
              amount = license.receipt.amount;
            }));
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
      notifyUser;
      notifyAdmins;
      selfCanisterId = canisterId;
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
                  case (?license) ?{ payer = record.owner; tokenId = license.receipt.tokenId; amount = license.receipt.amount };
                  case null null;
                };
              };
              case null null;
            };
          };
          case null null;
        };
        await* handleCmcNotifyError(#storageCreation({ creationId }), blockIndex, refund, err);
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
      notifyUser;
      notifyAdmins;
      verifyCanisterOwner;
      transferIcpToCmc;
      notifyTopUp = notifyTopUpCmc;
      cmcHandleNotifyError = handleCmcNotifyError;
      selfCanisterId = canisterId;
      backendCyclesThreshold = BACKEND_CYCLES_THRESHOLD;
      backendCyclesTarget = BACKEND_CYCLES_TARGET;
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
    orchestrator = orchestratorCallbacks;
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
      await StorageDeployerOrchestrator.start<system>(storageOrchestrator, creations, startCallbacks);
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
    processAutoRenewals<system>();
  });

  /// Purchase a license and kick off storage creation. Returns the creation
  /// id immediately — charge + deploy run asynchronously on the orchestrator
  /// side. Frontend polls `listCreations({filter.id=[id]})` to follow progress.
  ///
  /// The initial record is created with `#ProcessingPayment(#Starting)`. A
  /// detached Timer picks up the flow on the next tick and transitions the
  /// record through all payment phases (`FetchingRates`, `Charging`,
  /// `RecordingLicense`, `Activating`, `Queueing`) before handing off to the
  /// unified deploy queue.
  public shared ({ caller }) func purchaseLicenseAndCreateStorage(
    storageBackendType : Payments.StorageBackendType,
    envPairs : ?[{ name : Text; value : Text }],
  ) : async Result.Result<Nat, PurchaseError> {
    assert not Principal.isAnonymous(caller);

    // Silently drop reserved-name entries. Rest of the input passes through;
    // the storage canister applies its own domain validation on accept.
    let sanitizedEnvPairs = Payments.sanitizeEnvPairs(envPairs);

    // Opportunistic self-topup trigger. Fire-and-forget — doesn't delay the purchase.
    maybeTopUpSelf<system>();

    let initArg = Payments.encodeStorageInitArg(caller, ?storageBackendType);
    let options : StorageDeployerOrchestrator.CreateStorageOptions = {
      releaseSelector = #Latest;
      initArg;
      envPairs = sanitizedEnvPairs;
      target = #Create({
        initialCycles = STORAGE_INITIAL_CYCLES;
        subnetId = null;
      });
    };

    // 1. Create record with #ProcessingPayment(#Starting) — visible in
    //    listStorages immediately, timeline seeded with the initial event.
    let creationId = switch (StorageDeployerOrchestrator.createStorageRecord<system>(storageOrchestrator, creations, caller, options)) {
      case (#ok(id)) id;
      case (#err(#AlreadyInProgress)) return #err(#ActivationFailed("Storage creation already in progress"));
      case (#err(#ReleaseNotFound)) return #err(#ActivationFailed("No release available"));
      case (#err(e)) return #err(#ActivationFailed(debug_show e));
    };

    // 2. Schedule charge + deploy on a separate message. User gets the id back
    //    within milliseconds regardless of how long the payment pipeline takes.
    ignore Timer.setTimer<system>(#seconds 0, func() : async () {
      await processPaymentAndStart<system>(caller, creationId, options);
    });

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
      StorageDeployerOrchestrator.appendEvent(creations, creationId, status);
    };

    let chargeResult = try {
      await* chargeForLicense<system>(caller, onChargePhase);
    } catch (err) {
      StorageDeployerOrchestrator.appendEvent(creations, creationId, #Failed("Charge trapped: " # Error.message(err)));
      return;
    };

    let charged = switch (chargeResult) {
      case (#ok(c)) c;
      case (#insufficientFunds(details)) {
        StorageDeployerOrchestrator.appendEvent(creations, creationId, #Failed("Insufficient funds: need " # formatUsdCents(details.required)));
        return;
      };
      case (#err(msg)) {
        StorageDeployerOrchestrator.appendEvent(creations, creationId, #Failed("Charge failed: " # msg));
        return;
      };
    };

    // Record license — this is the commit point for the payment.
    StorageDeployerOrchestrator.appendEvent(creations, creationId, #ProcessingPayment(#RecordingLicense));
    let receipt : StorageDeployerOrchestrator.PaymentReceipt = {
      tokenId = charged.tokenId;
      amount = charged.amount;
      paymentId = charged.paymentId;
      paidAt = Time.now();
      status = #completed;
    };
    switch (StorageDeployerOrchestrator.addLicense(licenses, caller, receipt)) {
      case (#ok()) {};
      case (#err(#DuplicatePayment)) {}; // Idempotent
    };
    StorageDeployerOrchestrator.setLicensePaymentId(creations, creationId, charged.paymentId);

    // Activate Trial if not already subscribed.
    StorageDeployerOrchestrator.appendEvent(creations, creationId, #ProcessingPayment(#Activating));
    ignore activateSubscriptionInternal(caller, #Trial, null);

    // Hand off to the deploy queue. startStorageCreation will flip the record
    // to #Pending (distinct tag — new timeline event).
    StorageDeployerOrchestrator.appendEvent(creations, creationId, #ProcessingPayment(#Queueing));
    switch (StorageDeployerOrchestrator.startStorageCreation<system>(storageOrchestrator, creations, creationId, options, orchestratorCallbacks)) {
      case (#ok()) {};
      case (#err(e)) StorageDeployerOrchestrator.appendEvent(creations, creationId, #Failed("Start failed: " # e));
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

  /// List licenses with optional filter + pagination. Callers omit `options`
  /// (`[]`) to get the caller's own licenses with defaults. Non-admins are
  /// pinned to their own `owner` regardless of filter.owner passed in.
  public query ({ caller }) func listLicenses(
    options : ?StorageDeployerOrchestrator.ListLicensesOptions,
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
    StorageDeployerOrchestrator.listStorages(storageOrchestrator, creations, caller);
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
  ///     `grantStoragePermission` / `revokeStoragePermission`).
  ///
  /// Backend id trust — not verified:
  ///   - Caller could have set `PUBLIC_CANISTER_ID:rabbithole-backend`
  ///     env var to a different backend, in which case the canister's
  ///     subscription gates and auto-topup calls would route elsewhere.
  ///     That's self-sabotage (controller loses Pro features), not a
  ///     risk for us — so we don't verify.
  ///
  /// Trial — NOT auto-activated. Trial is part of the License offer
  /// (strategy §3), not a freebie for any account registration.
  /// Controller who wants Trial calls `activateTrial()` separately
  /// (per-account, not per-storage; only once per account).
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
  /// Records include the full `events` timeline — no separate history query.
  public query ({ caller }) func listCreations(
    options : ?StorageDeployerOrchestrator.ListCreationsOptions,
  ) : async StorageDeployerOrchestrator.GetCreationsResponse {
    assert not Principal.isAnonymous(caller);
    let opts = Option.get(options, StorageDeployerOrchestrator.DEFAULT_LIST_CREATIONS_OPTIONS);
    let pinned = { opts with filter = { opts.filter with owner = ?[caller] } };
    let effective = if (isAdminPrincipal(caller)) opts else pinned;
    creations.list(effective);
  };

  public shared ({ caller }) func upgradeStorage(
    canisterId : Principal,
  ) : async Result.Result<(), StorageDeployerOrchestrator.UpgradeStorageError> {
    assert not Principal.isAnonymous(caller);
    StorageDeployerOrchestrator.upgradeStorage<system>(storageOrchestrator, creations, caller, canisterId, orchestratorCallbacks);
  };

  public query func checkStorageUpdate(canisterId : Principal) : async ?StorageDeployerOrchestrator.UpdateInfo {
    StorageDeployerOrchestrator.checkStorageUpdate(storageOrchestrator, creations, canisterId);
  };

  public shared ({ caller }) func startStorageDeployer() : async () {
    assertAdmin(caller);
    await StorageDeployerOrchestrator.start<system>(storageOrchestrator, creations, startCallbacks);
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
