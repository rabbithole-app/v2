import Blob "mo:core/Blob";
import Debug "mo:base/Debug";
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
  assertAdmin : (Principal) -> (),
  notifyUser : (Principal, Notifications.TypedEvent) -> (),
  getAmbassadorChain : (Principal) -> Users.AmbassadorChain,
  activateSubscriptionInternal : (Principal, Subscriptions.Plan, ?Int) -> Result.Result<(), Subscriptions.ActivateError>,
  treasuryDistributePayment : (TreasuryTypes.DistributePaymentArgs) -> async* TreasuryTypes.DistributePaymentResult,
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
        drainScheduled := false;
        await processPaymentQueue();
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
        case _ { continue drain }; // Unknown purpose, skip
      };
      let ?purpose = Payments.parsePurpose(purposeText) else continue drain;

      // Extract userId from metadata
      let userIdText = switch (Json.get(payment.metadata, "userId")) {
        case (?#string(u)) u;
        case _ { continue drain };
      };
      let userId = Principal.fromText(userIdText);

      let tokenId = Payments.resolveTokenId(payment.paymentMethod);
      let tokenIdText = debug_show tokenId;

      switch (purpose) {
        case (#deposit) {
          // Funds already on user wallet via ICPay relay. Just notify.
          notifyUser(userId, #depositReceived({ amount = payment.amount; tokenId = tokenIdText }));
        };
        case (#license) {
          // ICPay delivered funds to backend main account.
          // Distribute (splits) from main account.
          let chain = getAmbassadorChain(userId);
          ignore await* treasuryDistributePayment({
            paymentId = payment.id;
            payer = userId;
            tokenId;
            amount = payment.amount;
            ambassadorL1 = chain.l1;
            ambassadorL2 = chain.l2;
            metadata = ?"license";
          });
          ignore activateSubscriptionInternal(userId, #License, null);
          notifyUser(userId, #paymentReceived({ purpose = "license"; amount = payment.amount; tokenId = tokenIdText }));
        };
        case (#pro_monthly) {
          let chain = getAmbassadorChain(userId);
          ignore await* treasuryDistributePayment({
            paymentId = payment.id;
            payer = userId;
            tokenId;
            amount = payment.amount;
            ambassadorL1 = chain.l1;
            ambassadorL2 = chain.l2;
            metadata = ?"pro_monthly";
          });
          let thirtyDays = 30 * 24 * 60 * 60 * 1_000_000_000;
          ignore activateSubscriptionInternal(userId, #Pro, ?(Time.now() + thirtyDays));
          notifyUser(userId, #paymentReceived({ purpose = "pro_monthly"; amount = payment.amount; tokenId = tokenIdText }));
        };
      };
    };
  };

  /// Admin: manually flush the payment queue.
  public shared ({ caller }) func flushPaymentQueue() : async () {
    assertAdmin(caller);
    await processPaymentQueue();
  };
};
