import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Result "mo:core/Result";
import Int "mo:core/Int";
import Time "mo:base/Time";

import HMAC "mo:hmac";
import BaseX "mo:base-x-encoder";
import Json "mo:json";
import DateTime "mo:datetime/DateTime";
import App "mo:liminal/App";
import HttpContext "mo:liminal/HttpContext";

import Types "Types";

module ICPayWebhooks {
  public type Payment = Types.Payment;
  public type PaymentIntent = Types.PaymentIntent;
  public type PaymentMethod = Types.PaymentMethod;
  public type Network = Types.Network;
  public type Currency = Types.Currency;
  public type WebhookEventData = Types.WebhookEventData;
  public type WebhookEvent = Types.WebhookEvent;

  public type Config = {
    secretKey : [Nat8];
    onEvent : (WebhookEvent) -> ();
    /// Timestamp tolerance in seconds (0 = disabled, 300 = recommended).
    toleranceSec : Nat;
    /// Check if event ID was already processed (idempotency).
    isProcessed : (Text) -> Bool;
    /// Mark event ID as processed after successful handling.
    markProcessed : (Text) -> ();
  };

  /// Create a new ICPay webhooks middleware for Liminal.
  public func new(config : Config) : App.Middleware {
    {
      name = "ICPayWebhooks";
      handleQuery = func(_context : HttpContext.HttpContext, next : App.Next) : App.QueryResult {
        next();
      };
      handleUpdate = func(context : HttpContext.HttpContext, _next : App.NextAsync) : async* App.HttpResponse {
        let body = context.getRawBody();

        let sigHeader = switch (context.getHeader("x-icpay-signature")) {
          case (?sig) sig;
          case null return context.buildResponse(#unauthorized, #error(#message("Missing x-icpay-signature header")));
        };

        let (timestamp, v1Sig) = switch (parseSignatureHeader(sigHeader)) {
          case (?parsed) parsed;
          case null return context.buildResponse(#unauthorized, #error(#message("Malformed x-icpay-signature header")));
        };

        let bodyText = switch (Text.decodeUtf8(body)) {
          case (?t) t;
          case null return context.buildResponse(#badRequest, #error(#message("Body is not valid UTF-8")));
        };

        // Verify HMAC-SHA256(secret, "{timestamp}.{body}")
        let signedPayload = timestamp # "." # bodyText;
        let signedPayloadBlob = Text.encodeUtf8(signedPayload);
        let computed = HMAC.generate(config.secretKey, Blob.toArray(signedPayloadBlob).vals(), #sha256);
        let computedHex = BaseX.toHex(computed.vals(), { isUpper = false; prefix = #none });

        if (not Text.equal(computedHex, v1Sig)) {
          return context.buildResponse(#unauthorized, #error(#message("Invalid webhook signature")));
        };

        // Timestamp tolerance (replay protection)
        if (config.toleranceSec > 0) {
          switch (Nat.fromText(timestamp)) {
            case (?tsSec) {
              let currentSec = Int.abs(Time.now()) / 1_000_000_000;
              let diff = if (currentSec > tsSec) { currentSec - tsSec } else { tsSec - currentSec };
              if (diff > config.toleranceSec) {
                return context.buildResponse(#unauthorized, #error(#message("Webhook timestamp too old")));
              };
            };
            case null return context.buildResponse(#unauthorized, #error(#message("Invalid timestamp in signature")));
          };
        };

        let json = switch (Json.parse(bodyText)) {
          case (#ok(j)) j;
          case (#err(_)) return context.buildResponse(#badRequest, #error(#message("Invalid JSON body")));
        };

        // Idempotency
        let eventId = switch (Json.get(json, "id")) {
          case (?#string(id)) id;
          case _ "";
        };
        if (eventId != "" and config.isProcessed(eventId)) {
          return context.buildResponse(#ok, #json(#object_([("status", #string("ok"))])));
        };

        let event = switch (parseWebhookEvent(json, timestamp)) {
          case (#ok(ev)) ev;
          case (#err(msg)) return context.buildResponse(#badRequest, #error(#message(msg)));
        };

        config.onEvent(event);

        if (eventId != "") {
          config.markProcessed(eventId);
        };

        context.buildResponse(#ok, #json(#object_([("status", #string("ok"))])));
      };
    };
  };

  /// Parse Stripe-style signature header "t=<timestamp>,v1=<hex>"
  public func parseSignatureHeader(header : Text) : ?(Text, Text) {
    var timestamp : ?Text = null;
    var v1 : ?Text = null;

    for (part in Text.split(header, #char ',')) {
      let trimmed = Text.trimStart(part, #char ' ');
      if (Text.startsWith(trimmed, #text "t=")) {
        timestamp := ?Text.trimStart(trimmed, #text "t=");
      } else if (Text.startsWith(trimmed, #text "v1=")) {
        v1 := ?Text.trimStart(trimmed, #text "v1=");
      };
    };

    switch (timestamp, v1) {
      case (?t, ?v) ?(t, v);
      case _ null;
    };
  };

  /// Parse a JSON object into a WebhookEvent.
  public func parseWebhookEvent(json : Json.Json, timestamp : Text) : Result.Result<WebhookEvent, Text> {
    let eventTypeText = switch (Json.get(json, "type")) {
      case (?#string(t)) t;
      case _ return #err("Missing or invalid 'type' field");
    };

    let data : Types.WebhookEventData = switch (eventTypeText) {
      case "payment.created" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentCreated(p);
      };
      case "payment.updated" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentUpdated(p);
      };
      case "payment.completed" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentCompleted(p);
      };
      case "payment.failed" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentFailed(p);
      };
      case "payment.cancelled" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentCancelled(p);
      };
      case "payment.canceled" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentCancelled(p);
      };
      case "payment.refunded" {
        let ?p = parsePayment(json) else return #err("Failed to parse payment data");
        #paymentRefunded(p);
      };
      case "payment_intent.created" {
        let ?i = parsePaymentIntent(json) else return #err("Failed to parse payment intent data");
        #paymentIntentCreated(i);
      };
      case other #unknown(other);
    };

    let previousAttributes = Json.get(json, "data.previous_attributes");

    #ok({ data; timestamp; previousAttributes; raw = json });
  };

  /// Get event type text from WebhookEventData variant.
  public func eventDataToText(data : Types.WebhookEventData) : Text {
    switch (data) {
      case (#paymentCreated(_)) "payment.created";
      case (#paymentUpdated(_)) "payment.updated";
      case (#paymentCompleted(_)) "payment.completed";
      case (#paymentFailed(_)) "payment.failed";
      case (#paymentCancelled(_)) "payment.cancelled";
      case (#paymentRefunded(_)) "payment.refunded";
      case (#paymentIntentCreated(_)) "payment_intent.created";
      case (#unknown(t)) t;
    };
  };

  // -- Private helpers --

  func parsePayment(json : Json.Json) : ?Payment {
    let ?paymentJson = Json.get(json, "data.object") else return null;

    let id = switch (Json.get(paymentJson, "id")) {
      case (?#string(v)) v;
      case _ return null;
    };
    let status = switch (Json.get(paymentJson, "status")) {
      case (?#string(v)) v;
      case _ return null;
    };
    let ?amount = parseNat(paymentJson, "amount") else return null;
    let accountId = switch (Json.get(paymentJson, "accountId")) {
      case (?#string(v)) v;
      case _ return null;
    };
    let ledgerCanisterId = switch (Json.get(paymentJson, "ledgerCanisterId")) {
      case (?#string(v)) v;
      case _ return null;
    };
    let metadata = switch (Json.get(paymentJson, "metadata")) {
      case (?m) m;
      case null #object_([]);
    };

    ?{
      id;
      status;
      amount;
      accountId;
      ledgerCanisterId;
      paymentMethod = buildPaymentMethod(ledgerCanisterId);
      metadata;
      paymentIntentId = getOptionalString(paymentJson, "paymentIntentId");
      transactionId = getOptionalString(paymentJson, "transactionId");
      transactionSplitId = getOptionalString(paymentJson, "transactionSplitId");
      canisterTxId = getOptionalString(paymentJson, "canisterTxId");
      ledgerTxId = getOptionalString(paymentJson, "ledgerTxId");
      accountCanisterId = getOptionalStringOrNum(paymentJson, "accountCanisterId");
      basePaymentAccountId = getOptionalString(paymentJson, "basePaymentAccountId");
      invoiceId = getOptionalString(paymentJson, "invoiceId");
      requestedAmount = parseNat(paymentJson, "requestedAmount");
      paidAmount = parseNat(paymentJson, "paidAmount");
      createdAt = parseIsoTimestamp(paymentJson, "createdAt");
      updatedAt = parseIsoTimestamp(paymentJson, "updatedAt");
    };
  };

  func parsePaymentIntent(json : Json.Json) : ?PaymentIntent {
    let ?intentJson = Json.get(json, "data.object") else return null;

    let id = switch (Json.get(intentJson, "id")) {
      case (?#string(v)) v;
      case _ return null;
    };
    let status = switch (Json.get(intentJson, "status")) {
      case (?#string(v)) v;
      case _ "";
    };
    let ?amount = parseNat(intentJson, "amount") else return null;
    let metadata = switch (Json.get(intentJson, "metadata")) {
      case (?m) m;
      case null #object_([]);
    };

    let ledgerCanisterId = getOptionalString(intentJson, "ledgerCanisterId");

    ?{
      id;
      status;
      amount;
      accountId = getOptionalString(intentJson, "accountId");
      ledgerCanisterId;
      paymentMethod = switch (ledgerCanisterId) {
        case (?addr) ?buildPaymentMethod(addr);
        case null null;
      };
      expectedSenderPrincipal = getOptionalString(intentJson, "expectedSenderPrincipal");
      intentCode = parseNat(intentJson, "intentCode");
      description = getOptionalString(intentJson, "description");
      metadata;
      createdAt = parseIsoTimestamp(intentJson, "createdAt");
    };
  };

  func parseIsoTimestamp(json : Json.Json, path : Text) : ?Int {
    let ?text = getOptionalString(json, path) else return null;
    let stripped = stripMilliseconds(text);
    let ?dt = DateTime.fromText(stripped, "YYYY-MM-DDTHH:mm:ssZ") else return null;
    ?dt.toTime();
  };

  func stripMilliseconds(text : Text) : Text {
    let parts = Iter.toArray(Text.split(text, #char '.'));
    if (parts.size() != 2) return text;
    if (Text.endsWith(parts[1], #char 'Z')) {
      parts[0] # "Z";
    } else {
      text;
    };
  };

  func isNativeToken(address : Text) : Bool {
    address == "0x0000000000000000000000000000000000000000"
    or address == "So11111111111111111111111111111111111111112"
    or address == "ryjl3-tyaaa-aaaaa-aaaba-cai"
  };

  /// Detect blockchain network from ledger address format.
  /// EVM addresses start with 0x, IC principals contain hyphens, Solana is base58.
  func detectNetwork(ledgerAddress : Text) : Types.Network {
    if (Text.startsWith(ledgerAddress, #text "0x")) {
      #EVM;
    } else if (Text.contains(ledgerAddress, #char '-')) {
      #IC;
    } else switch (BaseX.fromBase58(ledgerAddress)) {
      case (#ok(_)) #Sol;
      case (#err(_)) #unknown(ledgerAddress);
    };
  };

  func buildPaymentMethod(ledgerAddress : Text) : Types.PaymentMethod {
    let network = detectNetwork(ledgerAddress);
    let currency : Types.Currency = if (isNativeToken(ledgerAddress)) {
      #native;
    } else {
      #token(ledgerAddress);
    };
    { network; ledgerAddress; currency };
  };

  func getOptionalString(json : Json.Json, path : Text) : ?Text {
    switch (Json.get(json, path)) {
      case (?#string(v)) ?v;
      case (?#null_) null;
      case _ null;
    };
  };

  func getOptionalStringOrNum(json : Json.Json, path : Text) : ?Text {
    switch (Json.get(json, path)) {
      case (?#string(v)) ?v;
      case (?#number(n)) ?Json.stringify(#number(n), null);
      case (?#null_) null;
      case _ null;
    };
  };

  func parseNat(json : Json.Json, path : Text) : ?Nat {
    switch (Json.get(json, path)) {
      case (?#string(v)) Nat.fromText(v);
      case (?#number(n)) {
        let text = Json.stringify(#number(n), null);
        Nat.fromText(text);
      };
      case _ null;
    };
  };

};
