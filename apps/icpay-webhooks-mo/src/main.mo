import Blob "mo:core/Blob";
import Text "mo:core/Text";
import Set "mo:core/Set";

import Liminal "mo:liminal";

import ICPayWebhooks "";

shared ({ caller = owner }) persistent actor class ICPayWebhooksExample(icpayWebhookSecretKey : Blob) = self {
  let webhookSecretBytes : [Nat8] = Blob.toArray(icpayWebhookSecretKey);

  // Last received event (for testing)
  var lastEventType : ?Text = null;
  var lastPaymentId : ?Text = null;

  // Idempotency: processed event IDs
  let processedEvents : Set.Set<Text> = Set.empty();

  transient var currentApp = Liminal.App({
    middleware = [
      ICPayWebhooks.new({
        secretKey = webhookSecretBytes;
        toleranceSec = 300;
        isProcessed = func(id : Text) : Bool { Set.contains(processedEvents, Text.compare, id) };
        markProcessed = func(id : Text) { Set.add(processedEvents, Text.compare, id) };
        onEvent = func(event : ICPayWebhooks.WebhookEvent) {
          lastEventType := ?ICPayWebhooks.eventDataToText(event.data);
          lastPaymentId := switch (event.data) {
            case (#paymentCreated({id}) or #paymentUpdated({id}) or #paymentCompleted({id}) or #paymentFailed({id}) or #paymentCancelled({id}) or #paymentRefunded({id}) or #paymentIntentCreated({id})) ?id;
            case (#unknown(_)) null;
          };
        };
      }),
    ];
    errorSerializer = Liminal.defaultJsonErrorSerializer;
    candidRepresentationNegotiator = Liminal.defaultCandidRepresentationNegotiator;
    logger = Liminal.buildDebugLogger(#warning);
    urlNormalization = {
      usernameIsCaseSensitive = false;
      pathIsCaseSensitive = false;
      queryKeysAreCaseSensitive = false;
      removeEmptyPathSegments = true;
      resolvePathDotSegments = true;
      preserveTrailingSlash = false;
    };
  });

  public query func http_request(request : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    currentApp.http_request(request);
  };

  public func http_request_update(request : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* currentApp.http_request_update(request);
  };

  public query func getLastEventType() : async ?Text { lastEventType };
  public query func getLastPaymentId() : async ?Text { lastPaymentId };
};
