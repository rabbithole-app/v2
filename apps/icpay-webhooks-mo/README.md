# icpay-webhooks-mo

Motoko middleware for [Liminal](https://mops.one/liminal) that verifies [ICPay](https://icpay.org) webhook signatures and parses payloads into typed structures.

## Features

- **HMAC-SHA256 signature verification** — validates `x-icpay-signature` header
- **Replay protection** — configurable timestamp tolerance (recommended: 300s)
- **Idempotency** — skips already-processed event IDs via user-provided callbacks
- **Typed payloads** — `Payment` and `PaymentIntent` records with all ICPay fields
- **Network detection** — automatically identifies EVM, Solana (base58 validation), and IC networks from ledger address format
- **Currency detection** — distinguishes native tokens (ETH, SOL, ICP) from contract tokens
- **Raw JSON access** — `event.raw` preserves the original payload for custom field extraction

## Installation

Add to your `mops.toml`:

```toml
[dependencies]
icpay-webhooks = "0.1.0"
```

> The library also requires `liminal`, `hmac`, `json`, `base-x-encoder`, `datetime`, and `core` as transitive dependencies.

## Quick Start

```motoko
import Blob "mo:core/Blob";
import Text "mo:core/Text";
import Set "mo:core/Set";
import Liminal "mo:liminal";
import ICPayWebhooks "mo:icpay-webhooks";

shared ({ caller = owner }) persistent actor class MyCanister(webhookSecret : Blob) = self {
  let secretBytes : [Nat8] = Blob.toArray(webhookSecret);

  // Idempotency store
  let processedEvents : Set.Set<Text> = Set.empty();

  transient var app = Liminal.App({
    middleware = [
      ICPayWebhooks.new({
        secretKey = secretBytes;
        toleranceSec = 300; // 5 minutes, 0 to disable
        isProcessed = func(id : Text) : Bool {
          Set.contains(processedEvents, Text.compare, id);
        };
        markProcessed = func(id : Text) {
          Set.add(processedEvents, Text.compare, id);
        };
        onEvent = func(event : ICPayWebhooks.WebhookEvent) {
          switch (event.data) {
            case (#paymentCompleted(payment)) {
              // Handle successful payment
              let amount = payment.amount; // Nat, smallest unit (e8s, wei, lamports)
              let network = payment.paymentMethod.network; // #EVM, #Sol, #IC, or #unknown
            };
            case (#paymentFailed(_)) { /* ... */ };
            case _ {};
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

  public query func http_request(req : Liminal.RawQueryHttpRequest) : async Liminal.RawQueryHttpResponse {
    app.http_request(req);
  };

  public func http_request_update(req : Liminal.RawUpdateHttpRequest) : async Liminal.RawUpdateHttpResponse {
    await* app.http_request_update(req);
  };
};
```

## API

### `ICPayWebhooks.new(config : Config) : App.Middleware`

Creates a Liminal middleware that intercepts all update requests, verifies the webhook signature, parses the payload, and calls `onEvent`.

Query requests are passed through to the next middleware.

#### Config

| Field | Type | Description |
|---|---|---|
| `secretKey` | `[Nat8]` | Webhook secret key bytes from ICPay dashboard |
| `toleranceSec` | `Nat` | Max allowed age of webhook timestamp in seconds. `0` disables the check, `300` recommended |
| `isProcessed` | `(Text) -> Bool` | Returns `true` if event ID was already handled |
| `markProcessed` | `(Text) -> ()` | Marks event ID as handled after successful processing |
| `onEvent` | `(WebhookEvent) -> ()` | Called with the parsed event on successful verification |

### `ICPayWebhooks.eventDataToText(data : WebhookEventData) : Text`

Converts a variant back to its ICPay event type string (e.g. `#paymentCompleted(_)` -> `"payment.completed"`).

### `ICPayWebhooks.parseSignatureHeader(header : Text) : ?(Text, Text)`

Parses the `x-icpay-signature` header format `t=<timestamp>,v1=<hex>` into `?(timestamp, signature)`.

### `ICPayWebhooks.parseWebhookEvent(json : Json.Json, timestamp : Text) : Result<WebhookEvent, Text>`

Parses raw JSON into a typed `WebhookEvent`. Useful if you need to parse events outside the middleware flow.

## Types

### WebhookEventData

```motoko
type WebhookEventData = {
  #paymentCreated    : Payment;
  #paymentUpdated    : Payment;
  #paymentCompleted  : Payment;
  #paymentFailed     : Payment;
  #paymentCancelled  : Payment;
  #paymentRefunded   : Payment;
  #paymentIntentCreated : PaymentIntent;
  #unknown : Text;  // unrecognized event type (forward-compatible)
};
```

### Payment

| Field | Type | Description |
|---|---|---|
| `id` | `Text` | Payment ID |
| `status` | `Text` | Payment status (`completed`, `failed`, `mismatched`, etc.) |
| `amount` | `Nat` | Amount in smallest token unit after ICPay fees |
| `accountId` | `Text` | ICPay account ID |
| `ledgerCanisterId` | `Text` | Ledger address (EVM contract, IC canister, or Solana program) |
| `paymentMethod` | `PaymentMethod` | Parsed network, currency, and ledger address |
| `metadata` | `Json.Json` | Raw metadata object from ICPay |
| `paymentIntentId` | `?Text` | Associated payment intent |
| `transactionId` | `?Text` | ICPay transaction ID |
| `canisterTxId` | `?Text` | On-chain transaction ID |
| `ledgerTxId` | `?Text` | Ledger transaction ID |
| `requestedAmount` | `?Nat` | Full amount before ICPay fees |
| `paidAmount` | `?Nat` | Actual paid amount |
| `createdAt` | `?Time.Time` | Creation timestamp (nanoseconds) |
| `updatedAt` | `?Time.Time` | Last update timestamp (nanoseconds) |

### PaymentIntent

| Field | Type | Description |
|---|---|---|
| `id` | `Text` | Payment intent ID |
| `status` | `Text` | Intent status |
| `amount` | `Nat` | Requested amount in smallest token unit |
| `accountId` | `?Text` | ICPay account ID |
| `ledgerCanisterId` | `?Text` | Ledger address |
| `paymentMethod` | `?PaymentMethod` | Parsed payment method (if ledger known) |
| `expectedSenderPrincipal` | `?Text` | Expected sender (IC payments) |
| `intentCode` | `?Nat` | Numeric intent code |
| `description` | `?Text` | Intent description |
| `metadata` | `Json.Json` | Raw metadata object |
| `createdAt` | `?Time.Time` | Creation timestamp (nanoseconds) |

### Network Detection

The middleware automatically detects the blockchain network from the `ledgerCanisterId` field:

| Format | Network | Example |
|---|---|---|
| Starts with `0x` | `#EVM` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Contains `-` | `#IC` | `ryjl3-tyaaa-aaaaa-aaaba-cai` |
| Valid base58 | `#Sol` | `So11111111111111111111111111111111111111112` |
| Other | `#unknown(address)` | Forward-compatible with new ICPay networks |

### Currency Detection

| Address | Currency |
|---|---|
| `0x0000000000000000000000000000000000000000` | `#native` (ETH) |
| `So11111111111111111111111111111111111111112` | `#native` (SOL) |
| `ryjl3-tyaaa-aaaaa-aaaba-cai` | `#native` (ICP) |
| Any other | `#token(ledgerAddress)` |

## Verification Flow

1. Extract `x-icpay-signature` header -> 401 if missing
2. Parse `t=<timestamp>,v1=<hex>` format -> 401 if malformed
3. Compute `HMAC-SHA256(secret, "{timestamp}.{body}")` -> 401 if mismatch
4. Check timestamp tolerance -> 401 if too old
5. Parse JSON body -> 400 if invalid
6. Check idempotency -> 200 (skip) if already processed
7. Parse typed event -> 400 if required fields missing
8. Call `onEvent` callback
9. Mark event as processed
10. Return 200

## Testing

Tests use [PocketIC](https://github.com/dfinity/pic-js) with an example canister:

```bash
# Build the example canister
docker compose exec -T replica bash -lc "dfx build example"

# Run tests
docker compose exec -T replica bash -lc "cd /app && npx vitest run"
```

## License

MIT
