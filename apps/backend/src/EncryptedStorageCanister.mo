import Array "mo:core/Array";
import Blob "mo:core/Blob";
import Cycles "mo:core/Cycles";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Result "mo:core/Result";
import Timer "mo:core/Timer";
import Time "mo:core/Time";

import IC "mo:ic";
import MemoryRegion "mo:memory-region/MemoryRegion";
import ManagementCanister "mo:ic-vetkeys/ManagementCanister";
import Liminal "mo:liminal";
import CORSMiddleware "mo:liminal/Middleware/CORS";
import AssetsMiddleware "mo:liminal/Middleware/Assets";
import HttpAssets "mo:http-assets";
import AssetCanister "mo:liminal/AssetCanister";
import Sha256 "mo:sha2/Sha256";
import Json "mo:json";
import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import EncryptedStorage "mo:encrypted-storage";
import EncryptedStorageClass "mo:encrypted-storage/Class";
import EncryptedStorageMiddleware "mo:encrypted-storage/Middleware";
import Const "mo:encrypted-storage/Const";
import T "mo:encrypted-storage/Types";
import SubscriptionGate "SubscriptionGate";
import HttpAssetsMixin "HttpAssetsMixin";
import IdentityVerification "IdentityVerification/lib";
import IdentityVerificationMixin "IdentityVerification/mixin";
import IdentityAttributes "mo:identity-attributes";
import StorageIdentityHandler "IdentityVerification/StorageHandler";
import StorageAccessClient "StorageAccessBridge/StorageClient";
import Utils "Utils/lib";

shared ({ caller = installer }) persistent actor class EncryptedStorageCanister(initArgs : {
    owner : Principal;
    storageBackendType : ?T.StorageBackend;
  }) = this {
  let owner = initArgs.owner;

  // Dynamic storage deployments receive these through canister settings
  // environment_variables, not through the install arg.
  transient let vetKeyName = Utils.envText<system>("VETKEY_NAME", "key_1");
  transient let backendId : ?Principal = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-backend")) {
    case (?id) ?Principal.fromText(id);
    case null null;
  };

  transient let keyId : ManagementCanister.VetKdKeyid = {
    curve = #bls12_381_g2;
    name = vetKeyName;
  };
  let canisterId = Principal.fromActor(this);
  let PAGE_BYTES : Nat = 65_536;
  let GIB_BYTES : Nat = 1_024 * 1_024 * 1_024;
  let SECONDS_PER_DAY : Nat = 24 * 60 * 60;
  let STORAGE_FREEZING_THRESHOLD_SECONDS_FALLBACK : Nat = 30 * SECONDS_PER_DAY;
  let STORAGE_COST_CYCLES_PER_GIB_SECOND_13_NODE : Nat = 127_000;
  let STORAGE_ONCHAIN_UPLOAD_TARGET_FLOOR_CYCLES : Nat = 1_000_000_000_000;
  let STORAGE_ONCHAIN_UPLOAD_OPERATION_MARGIN_CYCLES : Nat = 25_000_000_000;
  let IC_UPDATE_MESSAGE_EXECUTION_CYCLES : Nat = 5_000_000;
  let IC_INGRESS_MESSAGE_RECEPTION_CYCLES : Nat = 1_200_000;
  let IC_INGRESS_BYTE_RECEPTION_CYCLES : Nat = 2_000;
  let STORAGE_ONCHAIN_STABLE_WRITE_EXECUTION_CYCLES_PER_BYTE : Nat = 500;
  let STORAGE_ONCHAIN_HASH_INSTRUCTION_CYCLES_PER_BYTE : Nat = 384;
  let STORAGE_ONCHAIN_COMMIT_METADATA_CYCLES_PER_CHUNK : Nat = 2_000_000;
  let STORAGE_VETKD_DERIVE_TEST_KEY_CYCLES : Nat = 10_000_000_000;
  let STORAGE_VETKD_DERIVE_PRODUCTION_KEY_CYCLES : Nat = 26_153_846_153;
  let STORAGE_VETKD_DERIVE_KEY_MARGIN_CYCLES : Nat = 2_000_000_000;
  let STORAGE_ONCHAIN_UPLOAD_FUNDING_COOLDOWN : Time.Time = 60_000_000_000; // 60 seconds
  let STORAGE_FUNDING_IN_PROGRESS_ERROR : Text = "Storage funding is already in progress";

  var pendingStorageAccessEnvelopes : [StorageAccessClient.Envelope] = [];
  transient var uploadFundingInFlight : Bool = false;
  transient var uploadFundingRequestedBytes : Nat = 0;
  transient var uploadFundingRequestedTargetBalance : Nat = 0;
  transient var lastUploadFundingRequestAt : ?Time.Time = null;
  transient var lastUploadFundingCompletedAt : ?Time.Time = null;
  transient var lastUploadFundingError : ?Text = null;
  transient var cachedFreezingThresholdSeconds : ?Nat = null;
  transient var cachedRuntimeMemoryBytes : ?Nat = null;
  transient var cachedRuntimeStableMemoryBytes : ?Nat = null;
  transient var lastUploadCommitMeasurement : ?EncryptedStorage.UploadCommitMeasurement = null;

  func resetUploadFundingRetryState() : () {
    uploadFundingRequestedBytes := 0;
    uploadFundingRequestedTargetBalance := 0;
    lastUploadFundingRequestAt := null;
    lastUploadFundingError := null;
  };

  public type UploadMemoryProjection = {
    projectedAllocatedBytes : Nat;
    projectedCapacityBytes : Nat;
    projectedCapacityDeltaBytes : Nat;
  };

  public type ActiveUploadProjection = {
    sessionCount : Nat;
    reservationBytes : Nat;
    uploadedBytes : Nat;
    uploadedChunkCount : Nat;
    remainingBytes : Nat;
    remainingChunkCount : Nat;
  };

  public type UploadCycleCostEstimate = {
    operation : Nat;
    remainingWrite : Nat;
    remainingHashInstructions : Nat;
    vetKeyDerivation : Nat;
    commit : Nat;
    commitMetadata : Nat;
  };

  public type CycleSafetyEnvelope = {
    currentFreezingReserve : Nat;
    postWriteFreezingReserve : Nat;
    minimumSafeBalance : Nat;
    targetBalance : Nat;
    operationFloorBalance : Nat;
  };

  type UploadFundingRequirement = {
    memory : UploadMemoryProjection;
    activity : ActiveUploadProjection;
    cost : UploadCycleCostEstimate;
    safety : CycleSafetyEnvelope;
  };

  type EnsureStorageCyclesForUploadRequest = {
    currentBalance : Nat;
    requiredBalance : Nat;
    postWriteFreezingReserve : Nat;
    projectedCapacityBytes : Nat;
    remainingUploadBytes : Nat;
    activeUploadedBytes : Nat;
  };

  public type StorageCardMetrics = {
    subscriptionStatus : ?T.SubscriptionStatus;
    storedBytesUsed : Nat;
    backendId : ?Principal;
    storageBackendType : T.StorageBackend;
    memoryInfo : T.MemoryInfo;
    runtimeMemoryBytes : ?Nat;
    runtimeStableMemoryBytes : ?Nat;
  };

  public type CanisterCyclesFundingState = {
    requestedBytes : Nat;
    requestedTargetBalance : Nat;
    inFlight : Bool;
    lastRequestedAt : ?Time.Time;
    lastCompletedAt : ?Time.Time;
    lastError : ?Text;
  };

  public type LastUploadCommitMetrics = {
    bytes : Nat;
    chunkCount : Nat;
    hashRoundCount : Nat;
    hashInstructionCycles : Nat;
  };

  public type RuntimeMemoryMetrics = {
    memoryInfo : T.MemoryInfo;
    runtimeMemoryBytes : ?Nat;
    runtimeStableMemoryBytes : ?Nat;
  };

  public type CanisterCyclesCardMetrics = {
    balance : Nat;
    freezingThresholdSeconds : Nat;
    memory : UploadMemoryProjection;
    activity : ActiveUploadProjection;
    cost : UploadCycleCostEstimate;
    safety : CycleSafetyEnvelope;
    funding : CanisterCyclesFundingState;
    lastCommit : ?LastUploadCommitMetrics;
    runtimeMemory : RuntimeMemoryMetrics;
  };

  // Initialize HttpAssets first to use its certificate store
  var assetStableData = HttpAssets.init_stable_store(canisterId, owner);
  assetStableData := HttpAssets.upgrade_stable_store(assetStableData);

  // Extract certificate store from HttpAssets for shared use
  let httpAssetsState = HttpAssets.from_version(assetStableData);

  // Use shared certificate store from HttpAssets for EncryptedStorage
  var versionedStorage = EncryptedStorage.initStableStore({
    accountOwner = owner;
    canisterId;
    vetKdKeyId = keyId;
    domainSeparator = "file_storage_dapp";
    region = MemoryRegion.new();
    rootPermissions = [(owner, #ReadWriteManage), (canisterId, #ReadWriteManage)];
    certs = ?httpAssetsState.fs.certs;
    backendId;
    storageBackendType = switch (initArgs.storageBackendType) {
      case (?t) t;
      case null #BlobStorage;
    };
  });
  versionedStorage := EncryptedStorage.upgradeStableStore(versionedStorage, {
    accountOwner = owner;
    backendId;
  });
  transient let storage = EncryptedStorage.fromVersion(versionedStorage);

  func enqueueStorageAccessChanged(event : T.StoredStorageEvent) : () {
    pendingStorageAccessEnvelopes := StorageAccessClient.append(
      pendingStorageAccessEnvelopes,
      StorageAccessClient.toEnvelope(owner, canisterId, event),
    );
  };

  func drainStorageAccessChangedQueue() : async () {
    if (pendingStorageAccessEnvelopes.size() == 0) return;
    let batch = pendingStorageAccessEnvelopes;
    pendingStorageAccessEnvelopes := [];
    let failed = await StorageAccessClient.dispatch(storage.backendId, batch);
    if (failed.size() > 0) {
      pendingStorageAccessEnvelopes := StorageAccessClient.prependAll(failed, pendingStorageAccessEnvelopes);
    };
  };

  // Create class wrapper with subscription gates
  transient let es = EncryptedStorageClass.Storage(storage, ?{
    canStoreFileBytes = func(bytes : Nat) : Result.Result<(), Text> = SubscriptionGate.canStoreFileBytes(storage, bytes);
    canShare = func() : Result.Result<(), Text> = SubscriptionGate.canShare(storage);
    refreshSubscription = func() : async* Result.Result<T.SubscriptionStatus, Text> {
      await* SubscriptionGate.ensureSubscription(storage, false);
    };
    onAccessChanged = ?enqueueStorageAccessChanged;
  });

  func classifyStorageError(message : Text) : T.StorageErrorCode {
    if (Text.startsWith(message, #text "permission denied:")) return #PermissionDenied;
    if (Text.startsWith(message, #text "Upload funding is pending:")) return #FundingPending;
    if (Text.startsWith(message, #text "Manual OnChain funding required:")) return #InsufficientCycles;
    if (Text.startsWith(message, #text "Insufficient storage canister cycles:")) return #InsufficientCycles;
    if (Text.contains(message, #text "not found")) return #NotFound;
    if (Text.contains(message, #text "already exists")) return #Conflict;
    if (Text.contains(message, #text "Maximum number")) return #QuotaExceeded;
    if (
      Text.contains(message, #text "Invalid") or
      Text.contains(message, #text "Expected") or
      Text.contains(message, #text "out of bounds")
    ) return #Validation;
    #Internal;
  };

  func storageError(message : Text) : T.StorageError {
    {
      code = classifyStorageError(message);
      message;
    };
  };

  func ownerMetricsAccessError(caller : Principal) : ?T.StorageError {
    if (es.isOwnerEquivalent(caller)) return null;
    ?storageError("permission denied: caller is not owner-equivalent");
  };

  // Reset cached module hash on upgrade (body re-executes for persistent actor class)
  storage.cachedModuleHash := null;

  func refreshRuntimeStatus() : async Bool {
    try {
      let status = await IC.ic.canister_status({ canister_id = canisterId });
      storage.cachedIdleBurnPerDay := ?status.idle_cycles_burned_per_day;
      cachedFreezingThresholdSeconds := ?status.settings.freezing_threshold;
      cachedRuntimeMemoryBytes := ?status.memory_size;
      cachedRuntimeStableMemoryBytes := ?status.memory_metrics.stable_memory_size;
      true;
    } catch (_) {
      false;
    };
  };

  // Populate runtime cycle settings at startup so funding checks work immediately.
  ignore Timer.setTimer<system>(
    #seconds 0,
    func() : async () {
      ignore await refreshRuntimeStatus();
    },
  );

  func isCurrentController(principal : Principal) : async Bool {
    let status = await IC.ic.canister_status({ canister_id = canisterId });
    Array.any(status.settings.controllers, func(controller : Principal) : Bool = Principal.equal(controller, principal));
  };


  // Fire-and-forget low-cycles notification to backend
  func reportLowCyclesIfNeeded<system>() : () {
    switch (SubscriptionGate.checkCyclesOnUpdate(storage)) {
      case (?alert) {
        let ?bid = storage.backendId else return;
        let backend : actor {
          onStorageLowCycles : (Nat, Nat, { #warning; #critical }) -> async ();
        } = actor (Principal.toText(bid));
        ignore Timer.setTimer<system>(
          #seconds 0,
          func() : async () {
            try {
              await backend.onStorageLowCycles(alert.balance, alert.daysLeft, alert.severity);
            } catch _ {};
          },
        );
      };
      case null {};
    };
  };

  func divCeil(value : Nat, divisor : Nat) : Nat {
    if (value == 0) return 0;
    ((value - 1) / divisor) + 1;
  };

  func freezingThresholdSeconds() : Nat {
    switch (cachedFreezingThresholdSeconds) {
      case (?seconds) seconds;
      case null STORAGE_FREEZING_THRESHOLD_SECONDS_FALLBACK;
    };
  };

  func storageCyclesForBytesForSeconds(bytes : Nat, seconds : Nat) : Nat {
    divCeil(bytes * STORAGE_COST_CYCLES_PER_GIB_SECOND_13_NODE * seconds, GIB_BYTES);
  };

  func currentFreezingReserveCycles(memoryInfo : T.MemoryInfo) : Nat {
    let seconds = freezingThresholdSeconds();
    let cachedReserve = switch (storage.cachedIdleBurnPerDay) {
      case (?burnPerDay) divCeil(burnPerDay * seconds, SECONDS_PER_DAY);
      case null 0;
    };
    let regionReserve = storageCyclesForBytesForSeconds(memoryInfo.capacity, seconds);
    if (cachedReserve > regionReserve) cachedReserve else regionReserve;
  };

  func projectedCapacityAfterAdditionalBytes(memoryInfo : T.MemoryInfo, additionalBytes : Nat) : Nat {
    let projectedSize = memoryInfo.size + additionalBytes;
    let projectedPages = divCeil(projectedSize, PAGE_BYTES);
    projectedPages * PAGE_BYTES;
  };

  func postWriteFreezingReserveCycles(memoryInfo : T.MemoryInfo, projectedCapacityBytes : Nat) : Nat {
    let currentReserve = currentFreezingReserveCycles(memoryInfo);
    let capacityDelta = if (projectedCapacityBytes > memoryInfo.capacity) {
      Nat.sub(projectedCapacityBytes, memoryInfo.capacity);
    } else {
      0;
    };
    currentReserve + storageCyclesForBytesForSeconds(capacityDelta, freezingThresholdSeconds());
  };

  func hashInstructionCycles(bytes : Nat) : Nat {
    // SHA-256 is paid incrementally by appendUploadChunk. The base benchmark
    // is ~320M instructions per MB; keep 20% headroom for reserve estimates.
    bytes * STORAGE_ONCHAIN_HASH_INSTRUCTION_CYCLES_PER_BYTE;
  };

  func uploadChunkCount(bytes : Nat) : Nat {
    if (bytes == 0) 0 else divCeil(bytes, Const.ONCHAIN_UPLOAD_MAX_STORED_CHUNK_SIZE);
  };

  func uploadWriteCost(bytes : Nat, chunkCount : Nat) : Nat {
    let perMessageCost = IC_INGRESS_MESSAGE_RECEPTION_CYCLES + IC_UPDATE_MESSAGE_EXECUTION_CYCLES;
    let perByteCost =
      IC_INGRESS_BYTE_RECEPTION_CYCLES +
      STORAGE_ONCHAIN_STABLE_WRITE_EXECUTION_CYCLES_PER_BYTE +
      STORAGE_ONCHAIN_HASH_INSTRUCTION_CYCLES_PER_BYTE;
    (chunkCount * perMessageCost) + (bytes * perByteCost);
  };

  func appendOperationCost(bytes : Nat) : Nat {
    uploadWriteCost(bytes, 1);
  };

  func commitMetadataCycles(chunkCount : Nat) : Nat {
    chunkCount * STORAGE_ONCHAIN_COMMIT_METADATA_CYCLES_PER_CHUNK;
  };

  func commitOperationCost(chunkCount : Nat) : Nat {
    IC_INGRESS_MESSAGE_RECEPTION_CYCLES +
    IC_UPDATE_MESSAGE_EXECUTION_CYCLES +
    commitMetadataCycles(chunkCount);
  };

  func vetKeyDeriveKeyBaseCycles() : Nat {
    switch (storage.vetKdKeyId.name) {
      case ("test_key_1") STORAGE_VETKD_DERIVE_TEST_KEY_CYCLES;
      case (_) STORAGE_VETKD_DERIVE_PRODUCTION_KEY_CYCLES;
    };
  };

  func vetKeyDeriveKeyAttachedCycles() : Nat {
    vetKeyDeriveKeyBaseCycles() + STORAGE_VETKD_DERIVE_KEY_MARGIN_CYCLES;
  };

  func vetKeyDerivationCost(sessionCount : Nat) : Nat {
    sessionCount * vetKeyDeriveKeyAttachedCycles();
  };

  func onChainUploadFundingRequirement(totalSize : Nat, operationAdditionalBytes : Nat, operationCost : Nat) : UploadFundingRequirement {
    let activeSessions = es.activeUploadSessions();
    var activeReservationBytes = 0;
    var activeUploadedBytes = 0;
    var activeUploadedChunkCount = 0;
    var activeRemainingUploadBytes = 0;
    for (session in activeSessions.vals()) {
      activeReservationBytes += session.declaredBytes;
      activeUploadedBytes += session.uploadedBytes;
      activeUploadedChunkCount += session.uploadedChunkCount;
      activeRemainingUploadBytes += session.remainingBytes;
    };
    let extraReservationBytes = if (totalSize > activeReservationBytes) {
      Nat.sub(totalSize, activeReservationBytes);
    } else {
      0;
    };
    let requestedReservationBytes = activeReservationBytes + extraReservationBytes;
    let remainingUploadBytes = activeRemainingUploadBytes + extraReservationBytes;
    let memoryInfo = es.memoryInfo();
    let committedAllocatedBytes = if (memoryInfo.allocated > activeUploadedBytes) {
      Nat.sub(memoryInfo.allocated, activeUploadedBytes);
    } else {
      0;
    };
    let projectedAllocatedBytes = committedAllocatedBytes + requestedReservationBytes;
    let projectedCapacityBytes = projectedCapacityAfterAdditionalBytes(memoryInfo, remainingUploadBytes);
    let operationCapacityBytes = projectedCapacityAfterAdditionalBytes(memoryInfo, operationAdditionalBytes);
    let currentFreezingReserve = currentFreezingReserveCycles(memoryInfo);
    let postWriteFreezingReserve = postWriteFreezingReserveCycles(memoryInfo, projectedCapacityBytes);
    let operationFreezingReserve = postWriteFreezingReserveCycles(memoryInfo, operationCapacityBytes);
    let remainingUploadChunkCount = uploadChunkCount(remainingUploadBytes);
    let remainingUploadHashInstructionCycles = hashInstructionCycles(remainingUploadBytes);
    let remainingUploadCost = uploadWriteCost(remainingUploadBytes, remainingUploadChunkCount);
    let activeCommitMetadataCycles = commitMetadataCycles(activeUploadedChunkCount);
    let activeCommitCost = commitOperationCost(activeUploadedChunkCount);
    let activeVetKeyDerivationCost = vetKeyDerivationCost(activeSessions.size());
    let minimumSafeBalance =
      postWriteFreezingReserve +
      remainingUploadCost +
      activeVetKeyDerivationCost +
      activeCommitCost +
      STORAGE_ONCHAIN_UPLOAD_OPERATION_MARGIN_CYCLES;
    {
      memory = {
        projectedAllocatedBytes;
        projectedCapacityBytes;
        projectedCapacityDeltaBytes = if (projectedCapacityBytes > memoryInfo.capacity) {
          Nat.sub(projectedCapacityBytes, memoryInfo.capacity);
        } else {
          0;
        };
      };
      activity = {
        sessionCount = activeSessions.size();
        reservationBytes = activeReservationBytes;
        uploadedBytes = activeUploadedBytes;
        uploadedChunkCount = activeUploadedChunkCount;
        remainingBytes = remainingUploadBytes;
        remainingChunkCount = remainingUploadChunkCount;
      };
      cost = {
        operation = operationCost;
        remainingWrite = remainingUploadCost;
        remainingHashInstructions = remainingUploadHashInstructionCycles;
        vetKeyDerivation = activeVetKeyDerivationCost;
        commit = activeCommitCost;
        commitMetadata = activeCommitMetadataCycles;
      };
      safety = {
        currentFreezingReserve;
        postWriteFreezingReserve;
        minimumSafeBalance;
        targetBalance = minimumSafeBalance + STORAGE_ONCHAIN_UPLOAD_TARGET_FLOOR_CYCLES;
        operationFloorBalance = operationFreezingReserve + operationCost + STORAGE_ONCHAIN_UPLOAD_OPERATION_MARGIN_CYCLES;
      };
    };
  };

  func requestOnChainUploadFundingIfNeeded<system>(totalSize : Nat) : () {
    switch (es.getStorageBackendType()) {
      case (#BlobStorage) return;
      case (#OnChain) {};
    };

    let requirement = onChainUploadFundingRequirement(totalSize, 0, 0);
    let projectedAllocatedBytes = requirement.memory.projectedAllocatedBytes;
    let currentBalance = Cycles.balance();
    let requiredBalance = requirement.safety.targetBalance;
    if (currentBalance >= requiredBalance) return;
    if (projectedAllocatedBytes > uploadFundingRequestedBytes) {
      uploadFundingRequestedBytes := projectedAllocatedBytes;
    };
    if (requiredBalance > uploadFundingRequestedTargetBalance) {
      uploadFundingRequestedTargetBalance := requiredBalance;
    };
    if (not hasManagedStorageFunding()) {
      lastUploadFundingError := ?"Manual top-up required for OnChain upload";
      return;
    };
    if (uploadFundingInFlight) return;

    let now : Time.Time = Time.now();
    switch (lastUploadFundingRequestAt) {
      case (?lastRequestedAt) {
        if (now - lastRequestedAt < STORAGE_ONCHAIN_UPLOAD_FUNDING_COOLDOWN) return;
      };
      case null {};
    };

    let ?bid = storage.backendId else return;
    let backend : actor {
      ensureStorageCyclesForUpload : (EnsureStorageCyclesForUploadRequest) -> async Result.Result<{ cyclesAdded : ?Nat; requiredBalance : Nat }, Text>;
    } = actor (Principal.toText(bid));
    lastUploadFundingRequestAt := ?now;
    uploadFundingInFlight := true;

    ignore Timer.setTimer<system>(
      #seconds 0,
      func() : async () {
        try {
          let latestRequirement = onChainUploadFundingRequirement(0, 0, 0);
          let requestedTargetBalance = if (uploadFundingRequestedTargetBalance > latestRequirement.safety.targetBalance) {
            uploadFundingRequestedTargetBalance;
          } else {
            latestRequirement.safety.targetBalance;
          };
          let request : EnsureStorageCyclesForUploadRequest = {
            currentBalance = Cycles.balance();
            requiredBalance = requestedTargetBalance;
            postWriteFreezingReserve = latestRequirement.safety.postWriteFreezingReserve;
            projectedCapacityBytes = latestRequirement.memory.projectedCapacityBytes;
            remainingUploadBytes = latestRequirement.activity.remainingBytes;
            activeUploadedBytes = latestRequirement.activity.uploadedBytes;
          };
          let result = await backend.ensureStorageCyclesForUpload(request);
          switch (result) {
            case (#ok _) {
              lastUploadFundingCompletedAt := ?Time.now();
              lastUploadFundingError := null;
            };
            case (#err message) {
              lastUploadFundingError := ?message;
            };
          };
        } catch (e) {
          lastUploadFundingError := ?Error.message(e);
        };
        uploadFundingInFlight := false;

        let latestRequirement = onChainUploadFundingRequirement(0, 0, 0);
        let requestedTargetBalance = if (uploadFundingRequestedTargetBalance > latestRequirement.safety.targetBalance) {
          uploadFundingRequestedTargetBalance;
        } else {
          latestRequirement.safety.targetBalance;
        };
        if (Cycles.balance() < requestedTargetBalance) {
          requestOnChainUploadFundingIfNeeded<system>(0);
        } else {
          uploadFundingRequestedBytes := latestRequirement.memory.projectedAllocatedBytes;
          uploadFundingRequestedTargetBalance := latestRequirement.safety.targetBalance;
        };
      },
    );
  };

  func hasManagedStorageFunding() : Bool {
    switch (storage.subscriptionCache) {
      case (?cache) switch (cache.status) {
        case (#active({ plan })) switch (plan) {
          case (#Pro) true;
          case _ false;
        };
        case _ false;
      };
      case null false;
    };
  };

  func uploadFundingWaitMessage(operation : Text, requirement : UploadFundingRequirement, currentBalance : Nat) : Text {
    switch (lastUploadFundingError) {
      case (?message) {
        if (message != STORAGE_FUNDING_IN_PROGRESS_ERROR and not uploadFundingInFlight) {
          return "Insufficient storage canister cycles: auto top-up failed: " # message;
        };
      };
      case null {};
    };
    "Upload funding is pending: " #
    operation #
    " would leave storage below the freezing threshold. Minimum safe balance is " #
    Nat.toText(requirement.safety.minimumSafeBalance) #
    " cycles, current balance is " #
    Nat.toText(currentBalance) #
    " cycles, projected post-write freezing reserve is " #
    Nat.toText(requirement.safety.postWriteFreezingReserve) #
    " cycles.";
  };

  func manualOnChainFundingMessage(operation : Text, requirement : UploadFundingRequirement, currentBalance : Nat) : Text {
    "Manual OnChain funding required: " #
    operation #
    " requires safe balance " #
    Nat.toText(requirement.safety.minimumSafeBalance) #
    " cycles before continuing OnChain upload work. Current balance is " #
    Nat.toText(currentBalance) #
    " cycles, recommended top-up target is " #
    Nat.toText(requirement.safety.targetBalance) #
    " cycles.";
  };

  func ensureOnChainUploadOperationCyclesOrRequest<system>(operation : Text, operationAdditionalBytes : Nat, operationCost : Nat) : ?Text {
    switch (es.getStorageBackendType()) {
      case (#BlobStorage) return null;
      case (#OnChain) {};
    };
    requestOnChainUploadFundingIfNeeded<system>(0);
    let requirement = onChainUploadFundingRequirement(0, operationAdditionalBytes, operationCost);
    let currentBalance = Cycles.balance();
    if (currentBalance >= requirement.safety.minimumSafeBalance and currentBalance >= requirement.safety.operationFloorBalance) return null;
    if (not hasManagedStorageFunding()) {
      return ?manualOnChainFundingMessage(operation, requirement, currentBalance);
    };
    ?uploadFundingWaitMessage(operation, requirement, currentBalance);
  };

  func ensureOnChainUploadProjectionOrRequest<system>(operation : Text, totalSize : Nat) : ?Text {
    switch (es.getStorageBackendType()) {
      case (#BlobStorage) return null;
      case (#OnChain) {};
    };
    requestOnChainUploadFundingIfNeeded<system>(totalSize);
    let requirement = onChainUploadFundingRequirement(totalSize, 0, 0);
    let currentBalance = Cycles.balance();
    if (hasManagedStorageFunding()) {
      // Pro storage may start while background funding catches up; chunk and
      // finish calls still enforce per-operation cycle safety.
      return null;
    };
    if (currentBalance >= requirement.safety.minimumSafeBalance) return null;
    return ?manualOnChainFundingMessage(operation, requirement, currentBalance);
  };

  include IdentityVerificationMixin({
    onVerifiedAttributes = func(_caller : Principal, _attrs : IdentityVerification.VerifiedIdentityAttributes) : Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
      #ok;
    };
    claimVerifiedEmailAccess = func(caller : Principal, attrs : IdentityVerification.VerifiedIdentityAttributes) : async Result.Result<(), IdentityVerification.IdentityAttributesSyncError> {
      let result = await StorageIdentityHandler.claimVerifiedEmailAccess(
        {
          emailCommitment = func(email : Text) : Blob = EncryptedStorage.emailCommitment(storage, email);
          claimByEmailCommitments = func(principal : Principal, commitments : [Blob]) : Result.Result<[T.PrincipalAccessGrant], Text> {
            es.claimPendingAccessByVerifiedAttributes(principal, { emailCommitments = commitments });
          };
          afterClaim = drainStorageAccessChangedQueue;
        },
        caller,
        attrs,
      );
      switch (result) {
        case (#ok) {
          ignore es.recordOwnerActivity(caller, { origin = #storage });
          await drainStorageAccessChangedQueue();
          #ok;
        };
        case (#err(error)) #err(error);
      };
    };
  });
  include IdentityAttributes({
    onVerified = storeVerifiedIdentityAttributes;
  });

  transient let installerAssetPermissions : ?HttpAssets.SetPermissions =
    if (installer == owner) {
      null;
    } else {
      ?{
        prepare = [];
        commit = [installer];
        manage_permissions = [];
      };
    };
  transient var assetStore = HttpAssets.Assets(assetStableData, installerAssetPermissions);
  transient var assetCanister = AssetCanister.AssetCanister(assetStore);

  // Initialize info.json asset with canister ID
  func initInfoJson<system>() : () {
    let storageBackendType = switch (es.getStorageBackendType()) {
      case (#BlobStorage) "BlobStorage";
      case (#OnChain) "OnChain";
    };
    let rabbitholeBackendCanisterId = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-backend")) {
      case (?value) Json.str(value);
      case null Json.nullable();
    };
    let rabbitholeFrontendCanisterId = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:rabbithole-frontend")) {
      case (?value) Json.str(value);
      case null Json.nullable();
    };
    let internetIdentityFrontendCanisterId = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:internet_identity_frontend")) {
      case (?value) Json.str(value);
      case null Json.nullable();
    };
    let infoJson = Json.obj([
      ("canisterId", Json.str(Principal.toText(canisterId))),
      ("rabbitholeBackendCanisterId", rabbitholeBackendCanisterId),
      ("rabbitholeFrontendCanisterId", rabbitholeFrontendCanisterId),
      ("internetIdentityFrontendCanisterId", internetIdentityFrontendCanisterId),
      ("storageBackendType", Json.str(storageBackendType)),
    ]);
    let jsonText = Json.stringify(infoJson, null);
    let jsonBlob = Text.encodeUtf8(jsonText);
    let storeArgs : HttpAssets.StoreArgs = {
      key = "/info.json";
      content = jsonBlob;
      sha256 = ?Sha256.fromBlob(#sha256, jsonBlob);
      content_type = "application/json";
      content_encoding = "identity";
      is_aliased = null;
    };
    assetCanister.store(owner, storeArgs);
  };

  initInfoJson<system>();

  // Create the HTTP App with middleware
  transient let app = Liminal.App({
    middleware = [
      CORSMiddleware.default(),
      AssetsMiddleware.new({
        store = assetStore;
      }),
      EncryptedStorageMiddleware.new({
        store = storage;
      }),
    ];
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

  // Expose standard HTTP interface
  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(request);
  };

  public query func http_request_streaming_callback(token : T.StreamingToken) : async T.StreamingCallbackResponse {
    switch (assetStore.http_request_streaming_callback(token)) {
      case (#err _) switch (es.httpRequestStreamingCallback(token)) {
        case (#ok(response)) response;
        case (#err message) throw Error.reject(message);
      };
      case (#ok(response)) response;
    };
  };

  es.setStreamingCallback(http_request_streaming_callback);

  public query ({ caller }) func listStorage(entry : ?T.Entry) : async T.ListResponse {
    switch (es.list(caller, entry)) {
      case (#ok response) response;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func create(args : T.CreateArguments) : async T.StorageResult<T.NodeDetails> {
    switch (es.create(caller, args)) {
      case (#ok value) { reportLowCyclesIfNeeded<system>(); #ok value };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func update(args : T.UpdateArguments) : async T.StorageResult<()> {
    switch (args) {
      case (#File fileArgs) {
        if (fileArgs.metadata.chunkIds.size() > 0) {
          switch (ensureOnChainUploadOperationCyclesOrRequest<system>("finish upload session", 0, commitOperationCost(fileArgs.metadata.chunkIds.size()))) {
            case (?message) return #err(storageError(message));
            case null {};
          };
        };
      };
      case (#Directory _) {};
    };
    requestOnChainUploadFundingIfNeeded<system>(es.activeUploadReservationBytes());
    switch (await* es.update(caller, args)) {
      case (#ok _) {
        reportLowCyclesIfNeeded<system>();
        requestOnChainUploadFundingIfNeeded<system>(0);
        #ok;
      };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func updateDirectoryPolicy(args : T.UpdateDirectoryPolicyArguments) : async T.StorageResult<T.NodeDetails> {
    switch (es.updateDirectoryPolicy(caller, args)) {
      case (#ok value) { reportLowCyclesIfNeeded<system>(); #ok value };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func delete(args : T.DeleteArguments) : async () {
    switch (es.delete(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func beginUploadSession(args : T.BeginUploadSessionArguments) : async T.StorageResult<T.BeginUploadSessionResponse> {
    switch (await* es.beginUploadSession(caller, args)) {
      case (#err message) #err(storageError(message));
      case (#ok response) {
        switch (ensureOnChainUploadProjectionOrRequest<system>("start upload session", args.totalSize)) {
          case (?message) {
            ignore es.rollbackBatch(caller, response.batchId);
            return #err(storageError(message));
          };
          case null {};
        };
        #ok response;
      };
    };
  };

  public shared query ({ caller }) func getUploadSession(args : { batchId : T.BatchId }) : async T.StorageResult<T.UploadSessionStatus> {
    switch (es.getUploadSession(caller, args.batchId)) {
      case (#ok status) #ok status;
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func appendUploadChunk(args : T.AppendUploadChunkArguments) : async T.StorageResult<T.AppendUploadChunkResponse> {
    switch (ensureOnChainUploadOperationCyclesOrRequest<system>("append upload chunk", args.content.size(), appendOperationCost(args.content.size()))) {
      case (?message) return #err(storageError(message));
      case null {};
    };
    switch (es.appendUploadChunk(caller, args)) {
      case (#ok response) {
        reportLowCyclesIfNeeded<system>();
        requestOnChainUploadFundingIfNeeded<system>(0);
        #ok response;
      };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func finishUploadSession(args : T.FinishUploadSessionArguments) : async T.StorageResult<()> {
    let operationCost = switch (es.getUploadSession(caller, args.batchId)) {
      case (#ok status) commitOperationCost(status.chunkIds.size());
      case (#err message) return #err(storageError(message));
    };
    switch (ensureOnChainUploadOperationCyclesOrRequest<system>("finish upload session", 0, operationCost)) {
      case (?message) return #err(storageError(message));
      case null {};
    };
    switch (await* es.finishUploadSession(caller, args)) {
      case (#ok measurement) {
        lastUploadCommitMeasurement := ?measurement;
        reportLowCyclesIfNeeded<system>();
        requestOnChainUploadFundingIfNeeded<system>(0);
        #ok;
      };
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func abortUploadSession(args : { batchId : T.BatchId }) : async T.StorageResult<()> {
    switch (es.abortUploadSession(caller, args.batchId)) {
      case (#ok) #ok;
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func move(args : T.MoveArguments) : async () {
    switch (es.move(caller, args)) {
      case (#ok) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func rename(args : T.RenameArguments) : async () {
    switch (es.rename(caller, args)) {
      case (#ok) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clearStorage() : async () {
    switch (es.clear(caller)) {
      case (#ok) { reportLowCyclesIfNeeded<system>() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func hasStoragePermission(args : T.HasPermissionArguments) : async Bool {
    es.hasPermission(caller, args);
  };

  public query ({ caller }) func listOwnerEquivalentPrincipals() : async [T.OwnerEquivalentPrincipal] {
    switch (es.listOwnerEquivalentPrincipals(caller)) {
      case (#ok(items)) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getRecoveryStatus() : async T.RecoveryStatus {
    switch (es.getRecoveryStatus(caller)) {
      case (#ok(status)) status;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func registerRecoveryController(principal : Principal) : async T.RegisterRecoveryControllerResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (Principal.isAnonymous(principal)) {
      throw Error.reject("anonymous principal not allowed");
    };
    if (not (await isCurrentController(principal))) {
      throw Error.reject("principal is not a controller");
    };
    switch (es.registerRecoveryController(caller, principal)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func clearRecoveryController() : async Principal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.clearRecoveryController(caller)) {
      case (#ok(principal)) {
        await drainStorageAccessChangedQueue();
        principal;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func addRecoveryOwner(principal : Principal, options : T.AddRecoveryOwnerOptions) : async T.OwnerEquivalentPrincipal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.addRecoveryOwner(caller, principal, options)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func takeRecoveryOwnership() : async T.OwnerEquivalentPrincipal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (not (await isCurrentController(caller))) {
      throw Error.reject("caller is not a controller");
    };
    switch (es.takeRecoveryOwnership(caller)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func activateRecoveryOwnership(principal : Principal) : async T.OwnerEquivalentPrincipal {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (Principal.isAnonymous(principal)) {
      throw Error.reject("anonymous principal not allowed");
    };
    if (not (await isCurrentController(principal))) {
      throw Error.reject("principal is not a controller");
    };
    switch (es.activateRecoveryOwnership(caller, principal)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func removeRecoveryOwner(principal : Principal) : async () {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    if (await isCurrentController(principal)) {
      throw Error.reject("principal is still a controller; remove controller first");
    };
    switch (es.removeRecoveryOwner(caller, principal)) {
      case (#ok) { await drainStorageAccessChangedQueue() };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createPendingAccessGrant(args : T.CreatePendingAccessGrantArguments) : async T.PendingAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createPendingAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createAccessBatch(args : T.CreateAccessBatchArguments) : async T.CreateAccessBatchResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createAccessBatch(caller, args)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func revokeAccessBatch(args : T.RevokeAccessBatchArguments) : async T.RevokeAccessBatchResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.revokeAccessBatch(caller, args)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func claimPendingAccessGrant(args : T.ClaimPendingAccessGrantArguments) : async T.PrincipalAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.claimPendingAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func claimPendingAccessByBackendAttestation(args : T.ClaimPendingAccessByBackendAttestationArguments) : async [T.PrincipalAccessGrant] {
    switch (es.claimPendingAccessByBackendAttestation(caller, args)) {
      case (#ok(grants)) {
        await drainStorageAccessChangedQueue();
        grants;
      };
      case (#err(message)) {
        throw Error.reject(message);
      };
    };
  };

  public shared ({ caller }) func cancelPendingAccessGrant(args : T.CancelPendingAccessGrantArguments) : async T.PendingAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.cancelPendingAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listPendingAccessGrants() : async [T.PendingAccessGrant] {
    switch (es.listPendingAccessGrants(caller)) {
      case (#ok(items)) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listAccessGrants(args : T.ListAccessGrantsArguments) : async T.AccessGrantList {
    switch (es.listAccessGrants(caller, args)) {
      case (#ok(result)) result;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createDurableAccessGrant(args : T.CreateDurableAccessGrantArguments) : async T.PrincipalAccessGrant {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createDurableAccessGrant(caller, args)) {
      case (#ok(grant)) {
        await drainStorageAccessChangedQueue();
        grant;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func recordOwnerActivity(args : T.RecordOwnerActivityArguments) : async T.OwnerActivityRecord {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.recordOwnerActivity(caller, args)) {
      case (#ok(record)) {
        await drainStorageAccessChangedQueue();
        record;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getOwnerActivityState() : async T.OwnerActivityState {
    switch (es.getOwnerActivityState(caller)) {
      case (#ok(state)) state;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func createDurableAccessPolicy(args : T.CreateDurableAccessPolicyArguments) : async T.DurableAccessPolicy {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createDurableAccessPolicy(caller, args)) {
      case (#ok(policy)) {
        await drainStorageAccessChangedQueue();
        policy;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func processDurableAccessPolicies() : async [T.DurablePolicyProcessResult] {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.processDurableAccessPolicies(caller)) {
      case (#ok(results)) {
        await drainStorageAccessChangedQueue();
        results;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func releaseDurableAccessPolicy(args : T.ReleaseDurableAccessPolicyArguments) : async T.DurablePolicyProcessResult {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.releaseDurableAccessPolicy(caller, args)) {
      case (#ok(result)) {
        await drainStorageAccessChangedQueue();
        result;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func cancelDurableAccessPolicy(args : T.CancelDurableAccessPolicyArguments) : async T.DurableAccessPolicy {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.cancelDurableAccessPolicy(caller, args)) {
      case (#ok(policy)) {
        await drainStorageAccessChangedQueue();
        policy;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listDurableAccessPolicies() : async [T.DurableAccessPolicy] {
    switch (es.listDurableAccessPolicies(caller)) {
      case (#ok(policies)) policies;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func requestAccess(args : T.CreateAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.createAccessRequest(caller, args)) {
      case (#ok(request)) {
        await drainStorageAccessChangedQueue();
        request;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func cancelAccessRequest(args : T.CancelAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (es.cancelAccessRequest(caller, args)) {
      case (#ok(request)) {
        await drainStorageAccessChangedQueue();
        request;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getMyAccessRequest() : async ?T.AccessRequest {
    switch (es.getMyAccessRequest(caller)) {
      case (#ok(request)) request;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func resolveAccessRequest(args : T.ResolveAccessRequestArguments) : async T.AccessRequest {
    if (Principal.isAnonymous(caller)) {
      throw Error.reject("anonymous caller not allowed");
    };
    switch (args.decision) {
      case (#approved(_)) {
        switch (await* SubscriptionGate.ensureSubscription(storage, false)) {
          case (#ok(_)) {};
          case (#err(message)) throw Error.reject(message);
        };
      };
      case (#rejected) {};
    };
    switch (es.resolveAccessRequest(caller, args)) {
      case (#ok(request)) {
        await drainStorageAccessChangedQueue();
        request;
      };
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listAccessRequests() : async [T.AccessRequest] {
    switch (es.listAccessRequests(caller)) {
      case (#ok(requests)) requests;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listStorageEvents(afterId : ?Nat, limit : Nat) : async [T.StoredStorageEvent] {
    switch (es.listStorageEvents(caller, afterId, limit)) {
      case (#ok(events)) events;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listLatestStorageEvents(limit : Nat) : async [T.StoredStorageEvent] {
    switch (es.listLatestStorageEvents(caller, limit)) {
      case (#ok(events)) events;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public query ({ caller }) func getStorageEventsUnreadCount() : async Nat {
    switch (es.getStorageEventsUnreadCount(caller)) {
      case (#ok(count)) count;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func markStorageEventsRead(upToEventId : Nat) : async () {
    switch (es.markStorageEventsRead(caller, upToEventId)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func markAllVisibleStorageEventsRead() : async () {
    switch (es.markAllVisibleStorageEventsRead(caller)) {
      case (#ok) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared query ({ caller }) func getStorageChunk(args : T.GetChunkArguments) : async T.ChunkContent {
    switch (es.getChunk(caller, args)) {
      case (#ok chunk) chunk;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared func getVetkeyVerificationKey() : async T.VetKeyVerificationKey {
    // Inlined: avoid module-level async self-call
    await ManagementCanister.vetKdPublicKey(?storage.canisterId, storage.domainSeparatorBytes, storage.vetKdKeyId);
  };

  public shared ({ caller }) func getEncryptedVetkey(keyId : T.KeyId, transportKey : T.TransportKey) : async T.VetKey {
    // Subscription gate: refresh cache if stale, then check decrypt permission
    switch (await* SubscriptionGate.ensureSubscription(storage, false)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok _) {};
    };
    switch (SubscriptionGate.canDecrypt(storage, caller, owner, keyId)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok) {};
    };

    // Inlined: avoid module-level async self-call from EncryptedStorage.getEncryptedVetkey
    switch (es.validateVetkeyAccess(caller, keyId)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok(input)) {
        let response = await (with cycles = vetKeyDeriveKeyAttachedCycles()) IC.ic.vetkd_derive_key({
          context = storage.domainSeparatorBytes;
          input;
          key_id = storage.vetKdKeyId;
          transport_public_key = transportKey;
        });
        response.encrypted_key;
      };
    };
  };

  public query ({ caller }) func showTree(entry : ?T.Entry) : async Text {
    switch (es.showTree(caller, entry)) {
      case (#ok chunk) chunk;
      case (#err message) throw Error.reject(message);
    };
  };

  public query ({ caller }) func fsTree() : async [T.TreeNode] {
    switch (es.fsTree(caller)) {
      case (#ok tree) tree;
      case (#err message) throw Error.reject(message);
    };
  };

  public query ({ caller }) func listStorageVersions(args : T.ListVersionsArguments) : async [T.FileVersionDetails] {
    switch (es.listVersions(caller, args)) {
      case (#ok items) items;
      case (#err(message)) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func restoreStorageVersion(args : T.RestoreVersionArguments) : async () {
    switch (es.restoreVersion(caller, args)) {
      case (#ok _) {};
      case (#err(message)) throw Error.reject(message);
    };
  };

  /* -------------------------------------------------------------------------- */
  /*                      Caffeine Blob Storage Protocol                        */
  /* -------------------------------------------------------------------------- */

  // Mixin provides: _immutableObjectStorageCreateCertificate,
  // _immutableObjectStorageBlobsAreLive, _immutableObjectStorageBlobsToDelete,
  // _immutableObjectStorageConfirmBlobDeletion, _immutableObjectStorageUpdateGatewayPrincipals,
  // _immutableObjectStorageRefillCashier
  include MixinObjectStorage();

  public shared ({ caller }) func preflightCaffeineUpload(args : T.PreflightCaffeineUploadArgs) : async T.StorageResult<()> {
    switch (await* es.preflightCaffeineUpload(caller, args)) {
      case (#ok _) #ok;
      case (#err message) #err(storageError(message));
    };
  };

  public shared ({ caller }) func commitCaffeineUpload(args : T.CommitCaffeineUploadArgs) : async T.StorageResult<()> {
    switch (await* es.commitCaffeineUpload(caller, args)) {
      case (#ok _) { reportLowCyclesIfNeeded<system>(); #ok };
      case (#err message) #err(storageError(message));
    };
  };

  public query func getStorageBackendType() : async T.StorageBackend {
    es.getStorageBackendType();
  };

  /* -------------------------------------------------------------------------- */
  /*                           Asset canister methods                           */
  /* -------------------------------------------------------------------------- */

  assetStore.set_streaming_callback(http_request_streaming_callback);

  include HttpAssetsMixin(assetCanister);

  /* -------------------------------------------------------------------------- */
  /*                             Thumbnails methods                             */
  /* -------------------------------------------------------------------------- */

  public shared ({ caller }) func prepareThumbnailUpload(args : T.PrepareThumbnailUploadArguments) : async T.PrepareThumbnailUploadResult {
    assert not Principal.isAnonymous(caller);
    switch (es.prepareThumbnailUpload(caller, args)) {
      case (#ok result) result;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func commitThumbnailUpload(args : T.CommitThumbnailUploadArguments) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.commitThumbnailUpload(caller, args)) {
      case (#ok node) node;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func rewrapThumbnail(args : { entry : T.Entry; thumbnailRef : T.ThumbnailRef }) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.setThumbnail(caller, {
      entry = args.entry;
      thumbnailRef = ?args.thumbnailRef;
    })) {
      case (#ok node) node;
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func saveThumbnail(args : { entry : T.Entry; thumbnail : { content : Blob; contentType : Text; encryption : T.ThumbnailEncryptionRef } }) : async T.NodeDetails {
    assert not Principal.isAnonymous(caller);
    switch (es.prepareThumbnailUpload(caller, {
      entry = args.entry;
      contentType = args.thumbnail.contentType;
      size = args.thumbnail.content.size();
    })) {
      case (#ok prepared) switch (prepared.storageBackend) {
        case (#OnChain) {};
        case (#BlobStorage) throw Error.reject("Use Blob Storage thumbnail upload for this entry");
      };
      case (#err message) throw Error.reject(message);
    };
    switch (es.get(caller, { entry = args.entry })) {
      case (#ok node) {
        let (#File(_)) = node.metadata else throw Error.reject("Directory does not support thumbnails");
        let filename = switch (Text.decodeUtf8(node.keyId.1)) {
          case (?key) key;
          case null node.name;
        };
        let storeArgs : HttpAssets.StoreArgs = {
          key = "/" # Text.join(Iter.fromArray(["static", "thumbnails", Principal.toText(node.keyId.0), filename]), "/");
          content = args.thumbnail.content;
          sha256 = ?Sha256.fromBlob(#sha256, args.thumbnail.content);
          content_type = args.thumbnail.contentType;
          content_encoding = "identity";
          is_aliased = null;
        };
        assetCanister.store(owner, storeArgs);
        let setThumbnailArgs : T.SetThumbnailArguments = {
          entry = args.entry;
          thumbnailRef = ?#OnChain({
            key = storeArgs.key;
            sha256 = storeArgs.sha256;
            contentType = storeArgs.content_type;
            size = args.thumbnail.content.size();
            encryption = args.thumbnail.encryption;
          });
        };
        switch (es.setThumbnail(caller, setThumbnailArgs)) {
          case (#ok node) node;
          case (#err message) throw Error.reject(message);
        };
      };
      case (#err message) throw Error.reject(message);
    };
  };

  public shared ({ caller }) func refreshSubscription() : async () {
    assert Principal.equal(caller, owner) or Principal.equal(caller, canisterId) or Principal.isController(caller);
    switch (await* SubscriptionGate.ensureSubscription(storage, true)) {
      case (#err(message)) throw Error.reject(message);
      case (#ok _) resetUploadFundingRetryState();
    };
  };

  public shared ({ caller }) func invalidateSubscriptionCache() : async () {
    let ?backendId = storage.backendId else throw Error.reject("backendId not set");
    if (not Principal.equal(caller, backendId)) {
      throw Error.reject("backend caller required");
    };
    storage.subscriptionCache := null;
    resetUploadFundingRetryState();
  };

  public query func getCycleBalance() : async Nat {
    Cycles.balance();
  };

  public query func getStatus() : async T.StorageStatus {
    es.getStatus(Cycles.balance());
  };

  func buildStorageCardMetrics() : StorageCardMetrics {
    let status = es.getStatus(Cycles.balance());
    {
      subscriptionStatus = status.subscriptionStatus;
      storedBytesUsed = status.storedBytesUsed;
      backendId = status.backendId;
      storageBackendType = status.storageBackendType;
      memoryInfo = es.memoryInfo();
      runtimeMemoryBytes = cachedRuntimeMemoryBytes;
      runtimeStableMemoryBytes = cachedRuntimeStableMemoryBytes;
    };
  };

  func buildCanisterCyclesCardMetrics() : CanisterCyclesCardMetrics {
    let requirement = onChainUploadFundingRequirement(0, 0, 0);
    let memoryInfo = es.memoryInfo();
    {
      balance = Cycles.balance();
      freezingThresholdSeconds = freezingThresholdSeconds();
      memory = requirement.memory;
      activity = requirement.activity;
      cost = requirement.cost;
      safety = requirement.safety;
      funding = {
        requestedBytes = uploadFundingRequestedBytes;
        requestedTargetBalance = uploadFundingRequestedTargetBalance;
        inFlight = uploadFundingInFlight;
        lastRequestedAt = lastUploadFundingRequestAt;
        lastCompletedAt = lastUploadFundingCompletedAt;
        lastError = lastUploadFundingError;
      };
      lastCommit = switch (lastUploadCommitMeasurement) {
        case (?m) ?{
          bytes = m.bytes;
          chunkCount = m.chunkCount;
          hashRoundCount = m.hashRoundCount;
          hashInstructionCycles = m.hashInstructions;
        };
        case null null;
      };
      runtimeMemory = {
        memoryInfo;
        runtimeMemoryBytes = cachedRuntimeMemoryBytes;
        runtimeStableMemoryBytes = cachedRuntimeStableMemoryBytes;
      };
    };
  };

  public shared query ({ caller }) func getStorageCardMetrics() : async T.StorageResult<StorageCardMetrics> {
    switch (ownerMetricsAccessError(caller)) {
      case (?err) #err(err);
      case null #ok(buildStorageCardMetrics());
    };
  };

  public shared ({ caller }) func refreshStorageCardMetrics() : async T.StorageResult<StorageCardMetrics> {
    switch (ownerMetricsAccessError(caller)) {
      case (?err) return #err(err);
      case null {};
    };
    ignore await refreshRuntimeStatus();
    switch (await* SubscriptionGate.ensureSubscription(storage, true)) {
      case (#ok _) resetUploadFundingRetryState();
      case (#err _) {};
    };
    #ok(buildStorageCardMetrics());
  };

  public shared query ({ caller }) func getCanisterCyclesCardMetrics() : async T.StorageResult<CanisterCyclesCardMetrics> {
    switch (ownerMetricsAccessError(caller)) {
      case (?err) #err(err);
      case null #ok(buildCanisterCyclesCardMetrics());
    };
  };

  public shared ({ caller }) func refreshCanisterCyclesCardMetrics() : async T.StorageResult<CanisterCyclesCardMetrics> {
    switch (ownerMetricsAccessError(caller)) {
      case (?err) return #err(err);
      case null {};
    };
    ignore await refreshRuntimeStatus();
    #ok(buildCanisterCyclesCardMetrics());
  };
};
