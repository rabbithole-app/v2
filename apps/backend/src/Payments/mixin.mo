import Blob "mo:core/Blob";
import Debug "mo:base/Debug";
import Error "mo:core/Error";
import Int "mo:core/Int";
import Principal "mo:core/Principal";
import Queue "mo:core/Queue";
import Result "mo:core/Result";
import Set "mo:core/Set";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";

import ICPayWebhooks "mo:icpay-webhooks";
import Json "mo:json";
import LiminalApp "mo:liminal/App";
import TreasuryTypes "mo:treasury/Types";

import Payments "lib";
import Notifications "../Notifications/lib";
import Subscriptions "../Subscriptions/lib";
import Users "../Users/lib";

mixin(
  icpaySecretKey : ?Blob,
  admin : { assertAdmin : (Principal) -> () },
  deps : {
    notifyUser : (Principal, Notifications.TypedEvent) -> ();
    getAmbassadorChain : (Principal) -> Users.AmbassadorChain;
    activateSubscription : (Principal, Subscriptions.Plan, ?Int) -> Result.Result<(), Subscriptions.ActivateError>;
    grantPaidPeriod : (Principal, Subscriptions.Plan, Time.Time) -> Result.Result<Subscriptions.PaidPeriodResult, Text>;
    distributePayment : (TreasuryTypes.DistributePaymentArgs) -> async* TreasuryTypes.DistributePaymentResult;
    createStorageForUser : <system>(Principal, Blob, ?[{ name : Text; value : Text }]) -> Result.Result<(), Text>;
    addLicense : (Principal, { tokenId : TreasuryTypes.TokenId; amount : Nat; paymentId : Text; paidAt : Int }) -> Result.Result<(), { #DuplicatePayment }>;
  },
) {
  // ---- Persistent state ----
  let processedWebhookEvents : Set.Set<Text> = Set.empty();

  // ---- Transient state ----
  transient let eventQueue : Queue.Queue<ICPayWebhooks.WebhookEvent> = Queue.empty();
  transient var drainScheduled : Bool = false;

  // ---- ICPay Middleware ----

  func getIcpayMiddleware() : ?LiminalApp.Middleware {
    let ?secret = icpaySecretKey else return null;
    ?ICPayWebhooks.new({
      secretKey = Blob.toArray(secret);
      toleranceSec = 300;
      isProcessed = func(id : Text) : Bool {
        Set.contains(processedWebhookEvents, Text.compare, id);
      };
      markProcessed = func(id : Text) {
        Set.add(processedWebhookEvents, Text.compare, id);
      };
      onEvent = onWebhookEvent;
    });
  };

  // ---- Event queue + drain ----

  func onWebhookEvent(event : ICPayWebhooks.WebhookEvent) {
    Queue.pushBack(eventQueue, event);
    // Drain is triggered by timer set up in main.mo (needs system capability)
    // See: schedulePaymentDrain<system>() called from actor top level
  };

  /// Must be called from actor top-level to get system capability.
  /// Sets up a one-shot timer to drain the payment queue.
  func schedulePaymentDrain<system>() {
    if (not drainScheduled and not Queue.isEmpty(eventQueue)) {
      drainScheduled := true;
      ignore Timer.setTimer<system>(#seconds(5), func() : async () {
        await processPaymentQueue();
        drainScheduled := false;
        // Re-check after drain (may need another round)
        schedulePaymentDrain<system>();
      });
    };
  };

  func processPaymentQueue() : async () {
    label drain loop {
      let ?event = Queue.popFront(eventQueue) else break drain;

      let payment = switch (event.data) {
        case (#paymentCompleted(p)) p;
        case _ continue drain; // Only process completed payments
      };

      // Extract purpose from metadata
      let purposeText = switch (Json.get(payment.metadata, "purpose")) {
        case (?#string(p)) p;
        case _ {
          Debug.print("Payment " # payment.id # ": missing or invalid purpose in metadata, skipping");
          continue drain;
        };
      };
      let ?purpose = Payments.parsePurpose(purposeText) else {
        Debug.print("Payment " # payment.id # ": unrecognized purpose '" # purposeText # "', skipping");
        continue drain;
      };

      // Extract userId from metadata
      let userIdText = switch (Json.get(payment.metadata, "userId")) {
        case (?#string(u)) u;
        case _ {
          Debug.print("Payment " # payment.id # ": missing userId in metadata, skipping");
          continue drain;
        };
      };
      let userId = try { Principal.fromText(userIdText) } catch (e) {
        Debug.print("Payment " # payment.id # ": invalid userId '" # userIdText # "': " # Error.message(e));
        continue drain;
      };

      let tokenId = Payments.resolveTokenId(payment.paymentMethod);
      let tokenIdText = debug_show tokenId;

      switch (purpose) {
        case (#deposit) {
          // Funds already on user wallet via ICPay relay. Just notify.
          deps.notifyUser(userId, #depositReceived({ amount = payment.amount; tokenId = tokenIdText }));
        };
        case (#license) {
          let chain = deps.getAmbassadorChain(userId);
          ignore await* deps.distributePayment({
            paymentId = payment.id;
            payer = userId;
            tokenId;
            amount = payment.amount;
            ambassadorL1 = chain.l1;
            ambassadorL2 = chain.l2;
            metadata = ?"license";
          });
          ignore deps.addLicense(userId, {
            tokenId;
            amount = payment.amount;
            paymentId = payment.id;
            paidAt = Time.now();
          });
          // Activate Trial if user has no active subscription
          switch (deps.activateSubscription(userId, #Trial, null)) {
            case (#ok() or #err(#AlreadyActive)) {};
            case _ {};
          };
          deps.notifyUser(userId, #paymentReceived({ purpose = "license"; amount = payment.amount; tokenId = tokenIdText }));

          switch (Payments.extractStorageConfig(payment.metadata)) {
            case (?config) {
              let initArg = Payments.encodeStorageInitArg(userId, ?config.storageBackendType);
              let envPairs = Payments.extractEnvPairs(payment.metadata);
              switch (deps.createStorageForUser<system>(userId, initArg, envPairs)) {
                case (#ok()) Debug.print("Auto-created storage for " # Principal.toText(userId));
                case (#err(e)) Debug.print("Storage auto-create failed for " # Principal.toText(userId) # ": " # e);
              };
            };
            case null {};
          };
        };
        case (#pro_monthly) {
          let chain = deps.getAmbassadorChain(userId);
          ignore await* deps.distributePayment({
            paymentId = payment.id;
            payer = userId;
            tokenId;
            amount = payment.amount;
            ambassadorL1 = chain.l1;
            ambassadorL2 = chain.l2;
            metadata = ?"pro_monthly";
          });
          switch (deps.grantPaidPeriod(userId, #Pro, Subscriptions.THIRTY_DAYS_NS)) {
            case (#ok(result)) {
              switch (result.action) {
                case (#Created or #Reactivated) deps.notifyUser(userId, #subscriptionActivated({ plan = #Pro }));
                case (#Renewed) deps.notifyUser(userId, #subscriptionRenewed({ plan = #Pro; expiresAt = ?result.expiresAt }));
              };
            };
            case (#err(e)) {
              Debug.print("Payment " # payment.id # ": grantPaidPeriod failed, manual intervention required: " # e);
              deps.notifyUser(userId, #paymentReceived({ purpose = "pro_monthly"; amount = payment.amount; tokenId = tokenIdText }));
            };
          };
        };
      };
    };
  };

  /// Admin: manually flush the payment queue.
  public shared ({ caller }) func flushPaymentQueue() : async () {
    admin.assertAdmin(caller);
    await processPaymentQueue();
  };
};
