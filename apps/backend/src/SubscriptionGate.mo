import Cycles "mo:core/Cycles";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import IC "mo:ic";

import T "mo:encrypted-storage/Types";
import Access "mo:encrypted-storage/Access/lib";
import EncryptedStorage "mo:encrypted-storage";
import Const "mo:encrypted-storage/Const";
import Upload "mo:encrypted-storage/Upload/lib";

module SubscriptionGate {

  type BackendActor = actor {
    checkSubscription : (wasmHash : Blob) -> async T.SubscriptionStatus;
  };

  /* ----------------------------- Subscription ------------------------------ */

  /// Async subscription check — refreshes cache if stale unless forced.
  /// Call from actor-level methods via `await*`.
  public func ensureSubscription(self : T.StableStore, forceRefresh : Bool) : async* Result.Result<T.SubscriptionStatus, Text> {
    // 1. Check cache freshness
    if (not forceRefresh) {
      switch (self.subscriptionCache) {
        case (?cache) {
          let age : Int = Time.now() - cache.checkedAt;
          if (age >= 0 and age < Const.SUBSCRIPTION_CACHE_TTL) {
            return #ok(cache.status);
          };
        };
        case null {};
      };
    };

    // 2. Require backendId
    let ?backendPrincipal = self.backendId else return #err("backendId not set — cannot check subscription");

    // 3. Get module hash (cached or fetch via canister_info)
    let moduleHash = switch (self.cachedModuleHash) {
      case (?hash) hash;
      case null {
        let info = await IC.ic.canister_info({
          canister_id = self.canisterId;
          num_requested_changes = ?0;
        });
        let ?hash = info.module_hash else return #err("No module hash — canister has no installed code");
        self.cachedModuleHash := ?hash;
        hash;
      };
    };

    // 4. Also cache idle_cycles_burned_per_day (best-effort piggyback).
    // Upload admission must not fail just because the management canister
    // rejects runtime-status introspection.
    if (self.cachedIdleBurnPerDay == null) {
      try {
        let status = await IC.ic.canister_status({ canister_id = self.canisterId });
        self.cachedIdleBurnPerDay := ?status.idle_cycles_burned_per_day;
      } catch (_) {};
    };

    // 5. Inter-canister call to backend
    let backend : BackendActor = actor (Principal.toText(backendPrincipal));
    var result = await backend.checkSubscription(moduleHash);

    // 6. Handle #invalidWasm — module hash may have changed after upgrade
    switch (result) {
      case (#invalidWasm) {
        // Clear cached hash, retry once with fresh hash
        self.cachedModuleHash := null;
        let info = await IC.ic.canister_info({
          canister_id = self.canisterId;
          num_requested_changes = ?0;
        });
        let ?newHash = info.module_hash else return #err("No module hash after retry");
        self.cachedModuleHash := ?newHash;
        result := await backend.checkSubscription(newHash);
      };
      case _ {};
    };

    // 7. Update cache
    self.subscriptionCache := ?{
      status = result;
      checkedAt = Time.now();
    };

    #ok(result);
  };

  /* ----------------------------- Sync Gates ------------------------------- */

  func remainingNat(limit : Nat, used : Nat) : Nat {
    if (limit <= used) return 0;
    Nat.sub(limit, used);
  };

  let MB_BYTES : Nat = 1_048_576;
  let GB_BYTES : Nat = 1_073_741_824;

  func formatStorageBytes(bytes : Nat) : Text {
    if (bytes >= GB_BYTES and bytes % GB_BYTES == 0) {
      Nat.toText(bytes / GB_BYTES) # " GB"
    } else if (bytes >= MB_BYTES) {
      Nat.toText(bytes / MB_BYTES) # " MB"
    } else if (bytes > 0) {
      "less than 1 MB"
    } else {
      "0 MB"
    };
  };

  let ACTIVE_PRO_REQUIRED : Text = "Active Pro subscription required";

  /// Check if cached subscription allows ordinary sharing operations.
  /// Storage license limits are personal-storage entitlements, not Pro sharing.
  public func canShare(self : T.StableStore) : Result.Result<(), Text> {
    switch (self.subscriptionCache) {
      case (?{ status = #active({ plan }) }) {
        switch (plan) {
          case (#Pro) #ok;
          case _ #err(ACTIVE_PRO_REQUIRED);
        };
      };
      case (?{ status = #licensed(_) }) #err(ACTIVE_PRO_REQUIRED);
      case (?{ status = #expired }) #err("Subscription expired — " # ACTIVE_PRO_REQUIRED);
      case (?{ status = #free }) #err(ACTIVE_PRO_REQUIRED);
      case (?{ status = #invalidWasm }) #err("Invalid WASM — contact support");
      case (?{ status = #unknownCanister }) #err("Unknown canister — contact support");
      case null #err("Subscription status unknown — call refreshSubscription first");
    };
  };

  /// Check if caller can decrypt (getEncryptedVetkey).
  /// Account owner and recovery owners can ALWAYS decrypt (even when expired) — sovereignty guarantee.
  /// Ordinary shared users can only decrypt while the owner has active Pro.
  public func canDecrypt(self : T.StableStore, caller : Principal, owner : Principal, keyId : T.KeyId) : Result.Result<(), Text> {
    if (caller == owner or Access.isOwnerEquivalent(self.access, caller) or EncryptedStorage.hasActiveDurableGrantForKey(self, caller, keyId)) {
      // Owner-equivalent and durable succession principals can ALWAYS decrypt
      // permitted files. Ordinary sharing still follows the subscription gate.
      switch (self.subscriptionCache) {
        case (?{ status = #active(_) or #licensed(_) or #expired or #free }) #ok;
        case (?{ status = #invalidWasm }) #err("Invalid WASM — contact support");
        case (?{ status = #unknownCanister }) #err("Unknown canister — contact support");
        case null #err("Subscription status unknown — call refreshSubscription first");
      };
    } else {
      // Ordinary shared access is a Pro feature. A storage license keeps the
      // owner's personal encrypted storage working, but it does not keep
      // non-durable shares decryptable after Pro expires.
      canShare(self);
    };
  };

  /// Check if an encrypted upload of given size is allowed.
  /// Used in createBatch (pre-check) and update (verification).
  public func canUploadEncrypted(self : T.StableStore, additionalBytes : Nat) : Result.Result<(), Text> {
    switch (self.subscriptionCache) {
      case (?{ status = #active(_) }) #ok;
      case (?{ status = #licensed({ includedBytes; maxFileBytes }) }) {
        if (additionalBytes > maxFileBytes) {
          return #err(
            "File exceeds included storage file limit (" #
            formatStorageBytes(maxFileBytes) #
            " max)"
          );
        };
        let reservedBytes = Upload.activeDeclaredBytes(self.upload);
        let projectedBytes = self.encryptedBytesUsed + reservedBytes + additionalBytes;
        if (projectedBytes <= includedBytes) #ok
        else {
          let committedAndReserved = self.encryptedBytesUsed + reservedBytes;
          let remaining = remainingNat(includedBytes, committedAndReserved);
          #err("File size exceeds remaining included storage (" # formatStorageBytes(remaining) # " remaining)");
        };
      };
      case (?{ status = #expired }) #err("Subscription expired — encryption disabled");
      case (?{ status = #free }) #err("Encryption requires an active subscription");
      case (?{ status = #invalidWasm }) #err("Invalid WASM — contact support");
      case (?{ status = #unknownCanister }) #err("Unknown canister — contact support");
      case null #err("Subscription status unknown — call refreshSubscription first");
    };
  };

  /* ----------------------------- Cycle Monitoring ------------------------- */

  public type CycleAlert = {
    canisterId : Principal;
    balance : Nat;
    daysLeft : Nat;
    severity : T.CycleAlertLevel;
  };

  /// Event-driven cycle check — call from every mutation operation.
  /// Returns alert info when notification should be sent, null otherwise.
  /// Uses rate limiting to avoid spam.
  public func checkCyclesOnUpdate(self : T.StableStore) : ?CycleAlert {
    let balance = Cycles.balance();
    let ?burnRate = self.cachedIdleBurnPerDay else return null;
    if (burnRate == 0) return null;

    let daysLeft = balance / burnRate;
    let now = Time.now();

    let alertLevel : ?T.CycleAlertLevel = if (daysLeft < Const.CYCLES_CRITICAL_DAYS) {
      ?#critical;
    } else if (daysLeft < Const.CYCLES_WARNING_DAYS) {
      ?#warning;
    } else {
      null;
    };

    switch (alertLevel) {
      case null {
        // Healthy — reset alert state
        self.lastCycleAlertLevel := null;
        null;
      };
      case (?level) {
        let cooldown = switch (level) {
          case (#warning) Const.CYCLES_WARNING_COOLDOWN;
          case (#critical) Const.CYCLES_CRITICAL_COOLDOWN;
        };

        let shouldAlert = switch (self.lastCycleAlertLevel) {
          case (?prevLevel) {
            // Escalation (warning→critical) → alert immediately
            // Same level → respect cooldown
            prevLevel != level or (now - self.lastCycleAlertAt > cooldown);
          };
          case null true; // First alert
        };

        if (shouldAlert) {
          self.lastCycleAlertAt := now;
          self.lastCycleAlertLevel := ?level;
          ?{ canisterId = self.canisterId; balance; daysLeft; severity = level };
        } else {
          null;
        };
      };
    };
  };
};
