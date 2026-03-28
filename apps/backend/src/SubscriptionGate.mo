import Cycles "mo:core/Cycles";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

import IC "mo:ic";

import T "mo:encrypted-storage/Types";
import Const "mo:encrypted-storage/Const";

module SubscriptionGate {

  type BackendActor = actor {
    checkSubscription : (wasmHash : Blob) -> async T.SubscriptionStatus;
    reportTrialBytes : (bytes : Nat) -> async ();
  };

  /* ----------------------------- Subscription ------------------------------ */

  /// Async subscription check — refreshes cache if stale.
  /// Call from actor-level methods via `await*`.
  public func ensureSubscription(self : T.StableStore) : async* Result.Result<T.SubscriptionStatus, Text> {
    // 1. Check cache freshness
    switch (self.subscriptionCache) {
      case (?cache) {
        let age : Int = Time.now() - cache.checkedAt;
        if (age >= 0 and age < Const.SUBSCRIPTION_CACHE_TTL) {
          return #ok(cache.status);
        };
      };
      case null {};
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

    // 4. Also cache idle_cycles_burned_per_day (piggyback)
    if (self.cachedIdleBurnPerDay == null) {
      let status = await IC.ic.canister_status({ canister_id = self.canisterId });
      self.cachedIdleBurnPerDay := ?status.idle_cycles_burned_per_day;
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

    // 8. Batch-report unreported trial bytes
    if (self.unreportedTrialBytes > 0) {
      let bytes = self.unreportedTrialBytes;
      self.unreportedTrialBytes := 0;
      try {
        await backend.reportTrialBytes(bytes);
      } catch (_) {
        // Restore if report fails — will retry next time
        self.unreportedTrialBytes += bytes;
      };
    };

    #ok(result);
  };

  /* ----------------------------- Sync Gates ------------------------------- */

  /// Check if cached subscription allows encryption operations (upload, grantPermission).
  /// Sync — uses cache only, no inter-canister call.
  public func canUseEncryption(self : T.StableStore) : Result.Result<(), Text> {
    switch (self.subscriptionCache) {
      case (?{ status = #active(_) }) #ok;
      case (?{ status = #trial({ remainingBytes }) }) {
        if (self.encryptedBytesUsed < remainingBytes) #ok
        else #err("Trial storage limit exceeded");
      };
      case (?{ status = #expired }) #err("Subscription expired — encryption disabled");
      case (?{ status = #free }) #err("Encryption requires an active subscription");
      case (?{ status = #invalidWasm }) #err("Invalid WASM — contact support");
      case (?{ status = #unknownCanister }) #err("Unknown canister — contact support");
      case null #err("Subscription status unknown — call refreshSubscription first");
    };
  };

  /// Check if caller can decrypt (getEncryptedVetkey).
  /// Owner can ALWAYS decrypt (even when expired) — sovereignty guarantee.
  /// Shared users can only decrypt when active/trial.
  public func canDecrypt(self : T.StableStore, caller : Principal, owner : Principal) : Result.Result<(), Text> {
    if (caller == owner) {
      // Owner can ALWAYS decrypt their own files — sovereignty guarantee
      switch (self.subscriptionCache) {
        case (?{ status = #active(_) or #trial(_) or #expired or #free }) #ok;
        case (?{ status = #invalidWasm }) #err("Invalid WASM — contact support");
        case (?{ status = #unknownCanister }) #err("Unknown canister — contact support");
        case null #err("Subscription status unknown — call refreshSubscription first");
      };
    } else {
      // Shared user: only active/trial
      canUseEncryption(self);
    };
  };

  /// Check if an encrypted upload of given size is allowed.
  /// Used in createBatch (pre-check) and update (verification).
  public func canUploadEncrypted(self : T.StableStore, additionalBytes : Nat) : Result.Result<(), Text> {
    switch (self.subscriptionCache) {
      case (?{ status = #active(_) }) #ok;
      case (?{ status = #trial({ remainingBytes }) }) {
        if (self.encryptedBytesUsed + additionalBytes <= remainingBytes) #ok
        else {
          let remaining = if (remainingBytes > self.encryptedBytesUsed) {
            remainingBytes - self.encryptedBytesUsed;
          } else { 0 };
          #err("File size exceeds remaining trial storage (" # debug_show (remaining / 1_000_000) # " MB remaining)");
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
