import Json "mo:json";
import Time "mo:base/Time";

module {
  /// Blockchain network.
  public type Network = {
    #EVM;           // Ethereum, Base, etc.
    #Sol;           // Solana
    #IC;            // Internet Computer
    #unknown : Text;
  };

  /// Currency variant: native blockchain token or a specific token contract/canister.
  public type Currency = {
    #native;        // ETH, SOL, or ICP (detected by known ledger addresses)
    #token : Text;  // ERC-20 contract, Solana program, or ICRC-1 canister ID
  };

  /// Payment method info extracted from ledgerCanisterId and metadata.
  public type PaymentMethod = {
    network : Network;
    ledgerAddress : Text;  // raw ledgerCanisterId value
    currency : Currency;
  };

  /// Payment data from the webhook payload (data.object for payment.* events).
  public type Payment = {
    // -- Required fields (always present) --
    id : Text;
    status : Text;
    /// Amount in smallest token unit (wei for ETH, lamports for SOL, e8s for ICP).
    /// Merchant's share after ICPay fees.
    amount : Nat;
    accountId : Text;
    ledgerCanisterId : Text;
    /// Parsed payment method with currency detection.
    paymentMethod : PaymentMethod;
    /// Raw metadata JSON (nested: icpay{icpay_network, icpay_ledger_id}, icpayPaymentLink, custom metadata)
    metadata : Json.Json;

    // -- Optional fields (may be null depending on event) --
    paymentIntentId : ?Text;
    transactionId : ?Text;
    transactionSplitId : ?Text;
    /// On-chain transaction ID (e.g. "0x0000...05bb")
    canisterTxId : ?Text;
    ledgerTxId : ?Text;
    /// ICPay internal canister ID. May arrive as number or string in JSON.
    accountCanisterId : ?Text;
    basePaymentAccountId : ?Text;
    invoiceId : ?Text;
    /// Full requested amount in smallest token unit (before ICPay fees).
    requestedAmount : ?Nat;
    /// Actual paid amount in smallest token unit.
    paidAmount : ?Nat;
    createdAt : ?Time.Time;
    updatedAt : ?Time.Time;
  };

  /// Payment intent data from the webhook payload (data.object for payment_intent.* events).
  public type PaymentIntent = {
    id : Text;
    status : Text;
    amount : Nat;
    accountId : ?Text;
    ledgerCanisterId : ?Text;
    /// Parsed payment method with currency detection.
    paymentMethod : ?PaymentMethod;
    expectedSenderPrincipal : ?Text;
    intentCode : ?Nat;
    description : ?Text;
    metadata : Json.Json;
    createdAt : ?Time.Time;
  };

  /// Webhook event data — variant where each case carries its typed payload.
  public type WebhookEventData = {
    #paymentCreated : Payment;
    #paymentUpdated : Payment;
    #paymentCompleted : Payment;
    #paymentFailed : Payment;
    #paymentCancelled : Payment;
    #paymentRefunded : Payment;
    #paymentIntentCreated : PaymentIntent;
    #unknown : Text;
  };

  /// Parsed webhook event with typed variant data and raw JSON access.
  public type WebhookEvent = {
    data : WebhookEventData;
    timestamp : Text;
    /// Previous field values (present in payment.updated events).
    previousAttributes : ?Json.Json;
    raw : Json.Json;
  };
};
