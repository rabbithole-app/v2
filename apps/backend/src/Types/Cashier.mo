// This is a generated Motoko binding.
// Please use `import service "ic:canister_id"` instead to call canisters on the IC if possible.

module {
  public type AccountBalanceGetError = {
    #AccountNotFound;
    #InternalError : Text;
  };
  public type AccountBalanceGetResponse = {
    account_cycle_balances : AccountCycleBalances;
    account : Principal;
  };
  public type AccountBalanceGetResult = {
    #Ok : AccountBalanceGetResponse;
    #Err : AccountBalanceGetError;
  };
  public type AccountCycleBalances = {
    total : Int;
    cycles_prepaid : Int;
    cycles_promo : Int;
    debt_target : DebtTarget;
    cycles_ledger : Int;
  };
  public type AccountDelegateListReceivedResponse = {
    accounts : [(Principal, Delegation)];
  };
  public type AccountDelegateListReceivedResult = {
    #Ok : AccountDelegateListReceivedResponse;
    #Err : DelegationError;
  };
  public type AccountDelegateListResponse = { delegations : [Delegation] };
  public type AccountDelegateListResult = {
    #Ok : AccountDelegateListResponse;
    #Err : DelegationError;
  };
  public type AccountDelegateRemoveRequest = {
    delegate : Principal;
    account : ?Principal;
  };
  public type AccountDelegateSetRequest = {
    permissions : [DelegationPermission];
    delegate : Principal;
    valid_until : ?Nat64;
    account : ?Principal;
  };
  public type AccountGetRequest = { account : Principal };
  public type AccountInfoGetResult = {
    #Ok : UserAccount;
    #Err : CashierInternalError;
  };
  public type AccountSettings = {
    overdraft_limit : Nat;
    target_balance : ?Int;
  };
  public type AccountSettingsGetResult = {
    #Ok : AccountSettings;
    #Err : CashierInternalError;
  };
  public type AccountSettingsUpdateError = {
    #AccountNotFound;
    #InvalidTargetBalance : Text;
    #NotAuthorized : Principal;
    #InvalidOverdraftLimit : Text;
  };
  public type AccountSettingsUpdateRequest = {
    overdraft_limit : ?Nat;
    target_balance : ??Int;
    account : Principal;
  };
  public type AccountSettingsUpdateResponse = {
    settings : AccountSettings;
    account : Principal;
  };
  public type AccountSettingsUpdateResult = {
    #Ok : AccountSettingsUpdateResponse;
    #Err : AccountSettingsUpdateError;
  };
  public type AccountTopUpError = {
    #NotAuthorized : Principal;
    #AccountBalanceOverflow;
    #InternalError : Text;
    #TopUpWithoutCycles;
  };
  public type AccountTopUpRequest = {
    target_balance : ?Nat;
    account : ?Principal;
  };
  public type AccountTopUpResponse = {
    balance : AccountCycleBalances;
    message : Text;
  };
  public type AccountTopUpResult = {
    #Ok : AccountTopUpResponse;
    #Err : AccountTopUpError;
  };
  public type AccountsListPagedRequest = {
    continuation_token : ?Principal;
    max_results : ?Nat32;
  };
  public type AccountsListPagedResponse = {
    accounts : [UserAccount];
    next_continuation_token : ?Principal;
  };
  public type AccountsListPagedResult = {
    #Ok : AccountsListPagedResponse;
    #Err : CashierInternalError;
  };
  public type AccountsLowBalanceListResult = {
    #Ok : [UserAccount];
    #Err : CashierInternalError;
  };
  public type AdminGatewayMetaListResult = {
    #Ok : [GatewayMetadata];
    #Err : AdminPrincipalListError;
  };
  public type AdminPrincipalAddError = {
    #NotAuthorized : Principal;
    #InternalError : Text;
  };
  public type AdminPrincipalAddRequest = { admin_principal : Principal };
  public type AdminPrincipalAddResponse = {
    message : Text;
    admin_principal : Principal;
  };
  public type AdminPrincipalAddResult = {
    #Ok : AdminPrincipalAddResponse;
    #Err : AdminPrincipalAddError;
  };
  public type AdminPrincipalListError = {
    #NotAuthorized : Principal;
    #InternalError : Text;
  };
  public type AdminPrincipalListResponse = {
    message : Text;
    admin_principals : [Principal];
  };
  public type AdminPrincipalListResult = {
    #Ok : AdminPrincipalListResponse;
    #Err : AdminPrincipalAddError;
  };
  public type AuditEventType = {
    #Spend;
    #RelationshipAdd;
    #RelationshipUpdate;
    #LedgerDeposit;
    #TopUp;
    #RelationshipRemove;
    #UnitCharge;
  };
  public type AuditLogContinuationToken = {
    account : ?Principal;
    sequence : Nat64;
  };
  public type AuditLogDownloadRequest = {
    continuation_token : ?AuditLogContinuationToken;
    max_entries : ?Nat64;
    account : ?Principal;
    event_type : ?AuditEventType;
  };
  public type AuditLogDownloadResponse = {
    continuation_token : ?AuditLogContinuationToken;
    csv_content : Text;
    num_returned_entries : Nat64;
    has_more : Bool;
  };
  public type AuditLogDownloadResult = {
    #Ok : AuditLogDownloadResponse;
    #Err : AuditLogError;
  };
  public type AuditLogError = {
    #NotAuthorized : Principal;
    #InvalidRequest : Text;
    #InternalError : Text;
  };
  public type BalanceHistogram = { sum : Int; buckets : [Nat64] };
  public type BalanceHistogramError = { #NotAuthorized : Principal };
  public type BalanceHistogramResult = {
    #Ok : BalanceHistogram;
    #Err : BalanceHistogramError;
  };
  public type BudgetCheckRequest = {
    owner : Principal;
    units : [(Text, Rational)];
  };
  public type BudgetCheckResponse = {
    available_budget : Int;
    approved : Bool;
    estimated_cost : Rational;
  };
  public type BudgetCheckResult = {
    #Ok : BudgetCheckResponse;
    #Err : PricingError;
  };
  public type CashierArgs = {
    overdraft_limit : ?Nat;
    gateway_principals : ?[Principal];
  };
  public type CashierInternalError = {
    #AccountNotFound;
    #OperationFailed : Text;
    #InsufficientBalance : { needed : Nat; available : Int };
    #InsufficientCycles : {
      description : Text;
      available : Int;
      required : Int;
    };
    #NotAuthorized : Principal;
    #InvalidArgument : Text;
    #AccountBalanceOverflow;
    #TopUpWithoutCycles;
  };
  public type ChargeUnitsResponse = {
    remaining_operations : ?Rational;
    charged_cost : Rational;
  };
  public type ChargeUnitsResult = {
    #Ok : ChargeUnitsResponse;
    #Err : PricingError;
  };
  public type CyclesLedgerDepositSubaccountRequest = { sender : Principal };
  public type CyclesLedgerDepositSubaccountResponse = { subaccount : Blob };
  public type DebtTarget = { #Prepaid; #Ledger };
  public type Delegation = {
    permissions : [DelegationPermission];
    delegate : Principal;
    created_at : Nat64;
    valid_until : ?Nat64;
  };
  public type DelegationError = {
    #DelegationNotFound : Principal;
    #NotAuthorized : Principal;
    #InvalidRequest : Text;
    #InternalError : Text;
  };
  public type DelegationOperationResult = { #Ok; #Err : DelegationError };
  public type DelegationPermission = { #ReadOnly; #FullAccess };
  public type Factor = { #G; #K; #M; #T; #U; #Gi; #Ki; #Mi; #Ti };
  public type GatewayBudget = { available_credit : Int };
  public type GatewayDiscoverRequest = {
    tags : ?[Text];
    gateway_type : ?GatewayType;
  };
  public type GatewayDiscoverResponse = { gateways : [GatewayInfo] };
  public type GatewayId = { principal : Principal; name : ?Text };
  public type GatewayInfo = {
    principal : Principal;
    tags : [Text];
    gateway_type : GatewayType;
  };
  public type GatewayMetadata = {
    last_seen_ns : ?Nat64;
    gateway_id : GatewayId;
    active_since_last_garbage_collection : Bool;
  };
  public type GatewayTagsError = {
    #InvalidInput : Text;
    #NotAuthorized : Principal;
    #GatewayNotFound : Principal;
    #InternalError : Text;
  };
  public type GatewayTagsGetResult = { #Ok : [Text]; #Err : GatewayTagsError };
  public type GatewayTagsSetRequest = {
    gateway_principal : Principal;
    tags : [Text];
  };
  public type GatewayType = { #Email; #Storage };
  public type GaugeHistograms = {
    chunk_size_bytes : Histogram;
    chunk_count : Histogram;
    blob_count : Histogram;
    blob_size_bytes : Histogram;
  };
  public type GetBudgetError = { #GatewayNotFound : GatewayId; #OwnerNotFound };
  public type GetBudgetRequestV1 = {
    gateway_id : ?GatewayId;
    owner_id : Principal;
  };
  public type GetBudgetResponseV1 = {
    usage : UsageCounters;
    budget : GatewayBudget;
  };
  public type GetBudgetResult = {
    #Ok : GetBudgetResponseV1;
    #Err : GetBudgetError;
  };
  public type Histogram = {
    name : Text;
    labels : [Text];
    sums : [Nat];
    bounds : [Nat64];
    counts : [Nat64];
  };
  public type LevelPrices = { bytes_stored : PricePerBillingUnit };
  public type NotificationConfig = {
    webhook_url : ?Text;
    last_notified_low_at : ?Nat64;
    low_balance_threshold_cycles : ?Int;
    critical_balance_threshold_cycles : ?Int;
    webhook_format : WebhookFormat;
    last_notified_critical_at : ?Nat64;
  };
  public type NotificationConfigError = {
    #AccountNotFound;
    #NotAuthorized : Principal;
    #InvalidRequest : Text;
    #InternalError : Text;
  };
  public type NotificationConfigListResponse = {
    configs : [(Principal, NotificationConfig)];
    next_cursor : ?Principal;
  };
  public type NotificationConfigListResult = {
    #Ok : NotificationConfigListResponse;
    #Err : NotificationConfigError;
  };
  public type NotificationConfigMarkNotifiedRequest = {
    critical_accounts : [Principal];
    resolved_accounts : [Principal];
    low_accounts : [Principal];
  };
  public type NotificationConfigMarkNotifiedResponse = { updated : Nat32 };
  public type NotificationConfigMarkNotifiedResult = {
    #Ok : NotificationConfigMarkNotifiedResponse;
    #Err : NotificationConfigError;
  };
  public type NotificationConfigResult = {
    #Ok : NotificationConfig;
    #Err : NotificationConfigError;
  };
  public type NotificationConfigSetRequest = {
    webhook_url : ?Text;
    clear : ?Bool;
    low_balance_threshold_cycles : ?Int;
    account : ?Principal;
    critical_balance_threshold_cycles : ?Int;
    webhook_format : ?WebhookFormat;
  };
  public type NotifyCyclesLedgerDepositError = {
    #SweepFailed : { message : Text };
    #NothingToDeposit;
    #InternalError : { message : Text };
    #DepositTooSmall : { fee : Nat; balance : Nat };
  };
  public type NotifyCyclesLedgerDepositRequest = { account : ?Principal };
  public type NotifyCyclesLedgerDepositResponse = {
    balance : AccountCycleBalances;
    ledger_block_index : Nat;
    credited : Nat;
  };
  public type NotifyCyclesLedgerDepositResult = {
    #Ok : NotifyCyclesLedgerDepositResponse;
    #Err : NotifyCyclesLedgerDepositError;
  };
  public type PayRelSyncSnapshotEntry = {
    key : Principal;
    value : PaymentRelationship;
    entry_id : Nat64;
  };
  public type PayRelSyncSnapshotResponse = {
    entries : [PayRelSyncSnapshotEntry];
    current_seq : Nat64;
  };
  public type PayRelSyncValueEntry = {
    value : PaymentRelationship;
    entry_id : Nat64;
  };
  public type PayRelSyncValuesResponse = { values : [PayRelSyncValueEntry] };
  public type PaymentAccountCanisterAddRequest = {
    spending_limit_per_day : Int;
    paid_canister : Principal;
    expiration_timestamp : ?Nat64;
    payment_account : ?Principal;
  };
  public type PaymentAccountCanisterGetRequest = { canister : Principal };
  public type PaymentAccountCanisterGetResponse = {
    relationship : ?PaymentRelationship;
  };
  public type PaymentAccountCanisterGetResult = {
    #Ok : PaymentAccountCanisterGetResponse;
    #Err : PaymentAccountError;
  };
  public type PaymentAccountCanisterListRequest = {
    continuation_token : ?Principal;
    max_results : ?Nat32;
    payment_account : ?Principal;
  };
  public type PaymentAccountCanisterListResponse = {
    next_continuation_token : ?Principal;
    relationships : [PaymentRelationship];
  };
  public type PaymentAccountCanisterListResult = {
    #Ok : PaymentAccountCanisterListResponse;
    #Err : PaymentAccountError;
  };
  public type PaymentAccountCanisterRemoveRequest = {
    paid_canister : Principal;
    payment_account : ?Principal;
  };
  public type PaymentAccountCanisterUpdateRequest = {
    spending_limit_per_day : ?Int;
    paid_canister : Principal;
    expiration_timestamp : ??Nat64;
    payment_account : ?Principal;
  };
  public type PaymentAccountError = {
    #RelationshipNotFound : Principal;
    #NotAuthorized : Principal;
    #InvalidRequest : Text;
    #InternalError : Text;
  };
  public type PaymentAccountListResponse = { payment_accounts : [Principal] };
  public type PaymentAccountListResult = {
    #Ok : PaymentAccountListResponse;
    #Err : PaymentAccountError;
  };
  public type PaymentAccountOperationResult = {
    #Ok;
    #Err : PaymentAccountError;
  };
  public type PaymentRelationship = {
    added_timestamp : Nat64;
    spending_limit_per_day : Int;
    paid_canister : Principal;
    bandwidth_baseline_downloaded : Nat;
    expiration_timestamp : ?Nat64;
    current_period_spent : Int;
    current_period_start : Nat64;
    bandwidth_baseline_ts_ns : Nat64;
    payment_account : Principal;
    bandwidth_baseline_uploaded : Nat;
  };
  public type PricePerBillingUnit = { per : Factor; cost : Int };
  public type Pricelist = { gauges : LevelPrices; counters : UsagePrices };
  public type PricelistGetResponse = { units : [(Text, PricingUnit)] };
  public type PricelistGetResult = {
    #Ok : PricelistGetResponse;
    #Err : PricingError;
  };
  public type PricelistRemoveRequest = { key : Text };
  public type PricelistRemoveResult = { #Ok; #Err : PricingError };
  public type PricelistSetRequest = { key : Text; unit : PricingUnit };
  public type PricelistSetResult = { #Ok : Text; #Err : PricingError };
  public type PricingConversion = {
    #Unit : { rate : Rational; target : Text };
    #Terminal;
  };
  public type PricingError = {
    #UnitNotFound : Text;
    #AccountNotFound;
    #InvalidQuantity : Text;
    #UnitInUse : Text;
    #TerminalUnit : Text;
    #BrokenChain : Text;
    #NotAuthorized;
    #InvalidRate : Text;
    #ChainTooDeep;
    #InvalidUnitName : Text;
    #InternalError : Text;
    #UnitMismatch : { left : Text; right : Text };
  };
  public type PricingUnit = {
    description : Text;
    conversion : PricingConversion;
  };
  public type Rational = { numerator : Int; denominator : Int };
  public type ServiceGatewayAddRequest = {
    gateway_principal : Principal;
    gateway_type : GatewayType;
  };
  public type ServiceGatewayAddResponse = {
    gateway_principal : Principal;
    message : Text;
  };
  public type ServiceGatewayAddResult = {
    #Ok : ServiceGatewayAddResponse;
    #Err : AdminPrincipalAddError;
  };
  public type ServiceGatewayListRequest = { gateway_type : ?GatewayType };
  public type ServiceGatewayRemoveRequest = { gateway_principal : Principal };
  public type SimulateConsumptionResult = { #Ok; #Err : Text };
  public type StorageGatewayAddRequest = { gateway_principal : Principal };
  public type StorageSetCanisterApiVersionError = {
    #NotAuthorized : Principal;
    #InvalidVersion : Nat8;
  };
  public type StorageSetCanisterApiVersionRequest = {
    versions : [(Principal, Nat8)];
  };
  public type StorageSetCanisterApiVersionResult = {
    #Ok;
    #Err : StorageSetCanisterApiVersionError;
  };
  public type StorageSetGaugesError = {
    #NotAuthorized : Principal;
    #InternalError : Text;
  };
  public type StorageSetGaugesRequest = { gauges : [(Principal, UsageGauges)] };
  public type StorageSetGaugesResult = { #Ok; #Err : StorageSetGaugesError };
  public type StorageSetUsageBatchRequest = {
    gateway_id : GatewayId;
    counters : [StorageSetUsageRequest];
  };
  public type StorageSetUsageBatchResponse = {
    budgets : [(Principal, GatewayBudget)];
  };
  public type StorageSetUsageBatchResult = {
    #Ok : StorageSetUsageBatchResponse;
    #Err : StorageSetUsageError;
  };
  public type StorageSetUsageError = {
    #NotAuthorized : Principal;
    #InternalError : Text;
  };
  public type StorageSetUsageRequest = {
    owner : Principal;
    usage : UsageCounters;
  };
  public type SyncChange = {
    #Delete : { key : Principal; entry_id : Nat64 };
    #Upsert : { key : Principal; entry_id : Nat64 };
  };
  public type SyncChangesRequest = { since_seq : Nat64; limit : Nat64 };
  public type SyncChangesResponse = {
    next_seq : Nat64;
    changes : [SyncChange];
  };
  public type SyncSnapshotRequest = { limit : Nat64; after_key : ?Principal };
  public type SyncValuesRequest = { entry_ids : [Nat64] };
  public type SyntheticAuditLogRequest = { seed : ?Nat64; weeks : ?Nat32 };
  public type SyntheticAuditLogResponse = {
    bob : Principal;
    eve : Principal;
    alice : Principal;
    carol : Principal;
    dave : Principal;
    weeks : Nat32;
    entries_generated : Nat32;
  };
  public type SyntheticAuditLogResult = {
    #Ok : SyntheticAuditLogResponse;
    #Err : Text;
  };
  public type UsageCounters = {
    bytes_downloaded : Nat;
    bytes_uploaded : Nat;
    write_requests : Nat64;
    read_requests : Nat64;
  };
  public type UsageGauges = {
    chunk_size_bytes : Nat64;
    chunk_count : Nat64;
    blob_count : Nat64;
    blob_size_bytes : Nat64;
  };
  public type UsageLedgerGetRequest = { owner : Principal };
  public type UsageLedgerGetResponse = { entries : [(Text, UsageLedgerValue)] };
  public type UsageLedgerGetResult = {
    #Ok : UsageLedgerGetResponse;
    #Err : PricingError;
  };
  public type UsageLedgerValue = {
    quantity : Rational;
    cached_cost : Rational;
  };
  public type UsagePrices = {
    read_request_price : PricePerBillingUnit;
    bytes_downloaded_price : PricePerBillingUnit;
    bytes_uploaded_price : PricePerBillingUnit;
    write_request_price : PricePerBillingUnit;
  };
  public type UserAccount = {
    account_owner_id : Principal;
    overdraft_limit : Nat;
    top_up_without_attached_cycles_sum : Nat;
    account_cycle_balance : AccountCycleBalances;
    last_top_up_ts_ns : Nat64;
    relationship_removed_at_ns : ?Nat64;
    past_counters : ?UsageCounters;
    creation_ts_ns : Nat64;
    top_up_sum : Nat;
    canister_api_version : ?Nat8;
    target_balance : ?Int;
    cycle_balance : Int;
    gateways : ?[(GatewayId, UserGateway)];
    storage_usage : UsageGauges;
    relationship_last_payment_account : ?Principal;
    last_charge_ts_ns : Nat64;
    last_top_up_without_attached_cycles_ts_ns : Nat64;
  };
  public type UserGateway = {
    last_update_ns : Nat64;
    usage_counters : ?UsageCounters;
  };
  public type WebhookFormat = { #Slack; #Generic; #PagerDuty };
  public type Whoami = {
    id : Text;
    account_cycle_balance : ?AccountCycleBalances;
    am_gateway : Bool;
    am_admin : Bool;
    cashier_principal : Principal;
    am_anonymous : Bool;
    caller_principal : Principal;
  };
  public type Self = actor {
    account_balance_get_v1 : shared query AccountGetRequest -> async AccountBalanceGetResult;
    account_delegate_list_received_v1 : shared query ?Principal -> async AccountDelegateListReceivedResult;
    account_delegate_list_v1 : shared query ?Principal -> async AccountDelegateListResult;
    account_delegate_remove_v1 : shared AccountDelegateRemoveRequest -> async DelegationOperationResult;
    account_delegate_set_v1 : shared AccountDelegateSetRequest -> async DelegationOperationResult;
    account_info_get_v1 : shared query AccountGetRequest -> async AccountInfoGetResult;
    account_settings_get_v1 : shared query AccountGetRequest -> async AccountSettingsGetResult;
    account_settings_update_v1 : shared AccountSettingsUpdateRequest -> async AccountSettingsUpdateResult;
    account_top_up_v1 : shared ?AccountTopUpRequest -> async AccountTopUpResult;
    accounts_list_v1 : shared query ?AccountsListPagedRequest -> async AccountsListPagedResult;
    accounts_low_balance_list_v1 : shared query () -> async AccountsLowBalanceListResult;
    admin_gateway_meta_list_v1 : shared query () -> async AdminGatewayMetaListResult;
    admin_principal_add_v1 : shared AdminPrincipalAddRequest -> async AdminPrincipalAddResult;
    admin_principal_list_v1 : shared query () -> async AdminPrincipalListResult;
    admin_principal_remove_v1 : shared AdminPrincipalAddRequest -> async AdminPrincipalAddResult;
    balance_histogram_v1 : shared query () -> async BalanceHistogramResult;
    budget_check_v1 : shared query BudgetCheckRequest -> async BudgetCheckResult;
    budget_get_v1 : shared query GetBudgetRequestV1 -> async GetBudgetResult;
    cached_balance_histogram_v1 : shared query () -> async BalanceHistogramResult;
    charge_units_v1 : shared BudgetCheckRequest -> async ChargeUnitsResult;
    cycles_ledger_deposit_notify_v1 : shared NotifyCyclesLedgerDepositRequest -> async NotifyCyclesLedgerDepositResult;
    cycles_ledger_deposit_subaccount_v1 : shared query CyclesLedgerDepositSubaccountRequest -> async CyclesLedgerDepositSubaccountResponse;
    gateway_discover_v1 : shared query GatewayDiscoverRequest -> async GatewayDiscoverResponse;
    gateway_tags_get_v1 : shared query Principal -> async GatewayTagsGetResult;
    gateway_tags_set_v1 : shared GatewayTagsSetRequest -> async GatewayTagsGetResult;
    gauge_histograms_compute_v1 : shared query () -> async GaugeHistograms;
    gauge_histograms_set_v1 : shared () -> async GaugeHistograms;
    gauge_histograms_v1 : shared query () -> async ?GaugeHistograms;
    notification_config_get_v1 : shared query AccountGetRequest -> async NotificationConfigResult;
    notification_config_mark_notified_v1 : shared NotificationConfigMarkNotifiedRequest -> async NotificationConfigMarkNotifiedResult;
    notification_config_set_v1 : shared NotificationConfigSetRequest -> async NotificationConfigResult;
    notification_configs_list_v1 : shared query (
        ?Principal,
        ?Nat32,
      ) -> async NotificationConfigListResult;
    payment_account_audit_log_get_v1 : shared query AuditLogDownloadRequest -> async AuditLogDownloadResult;
    payment_account_canister_add_v1 : shared PaymentAccountCanisterAddRequest -> async PaymentAccountOperationResult;
    payment_account_canister_get_v1 : shared query PaymentAccountCanisterGetRequest -> async PaymentAccountCanisterGetResult;
    payment_account_canister_list_v1 : shared query ?PaymentAccountCanisterListRequest -> async PaymentAccountCanisterListResult;
    payment_account_canister_remove_v1 : shared PaymentAccountCanisterRemoveRequest -> async PaymentAccountOperationResult;
    payment_account_canister_update_v1 : shared PaymentAccountCanisterUpdateRequest -> async PaymentAccountOperationResult;
    payment_account_list_accessible_v1 : shared query () -> async PaymentAccountListResult;
    payment_relationships_sync_changes_v1 : shared query SyncChangesRequest -> async ?SyncChangesResponse;
    payment_relationships_sync_seq_v1 : shared query () -> async Nat64;
    payment_relationships_sync_snapshot_v1 : shared query SyncSnapshotRequest -> async PayRelSyncSnapshotResponse;
    payment_relationships_sync_values_v1 : shared query SyncValuesRequest -> async PayRelSyncValuesResponse;
    pricelist_get_v1 : shared query () -> async PricelistGetResult;
    pricelist_remove_v1 : shared PricelistRemoveRequest -> async PricelistRemoveResult;
    pricelist_set_v1 : shared PricelistSetRequest -> async PricelistSetResult;
    pricelist_v1 : shared query () -> async Pricelist;
    service_gateway_add_v1 : shared ServiceGatewayAddRequest -> async ServiceGatewayAddResult;
    service_gateway_list_v1 : shared query ServiceGatewayListRequest -> async [
        Principal
      ];
    service_gateway_remove_v1 : shared ServiceGatewayRemoveRequest -> async ServiceGatewayAddResult;
    storage_canister_api_version_get_v1 : shared query PaymentAccountCanisterGetRequest -> async ?Nat8;
    storage_canister_api_version_set_v1 : shared StorageSetCanisterApiVersionRequest -> async StorageSetCanisterApiVersionResult;
    storage_gateway_add_v1 : shared StorageGatewayAddRequest -> async ServiceGatewayAddResult;
    storage_gateway_list_v1 : shared query () -> async [Principal];
    storage_gateway_principal_list_v1 : shared query () -> async [Principal];
    storage_gateway_remove_v1 : shared StorageGatewayAddRequest -> async ServiceGatewayAddResult;
    storage_gauges_set_v1 : shared StorageSetGaugesRequest -> async StorageSetGaugesResult;
    storage_usage_set_batch_v1 : shared StorageSetUsageBatchRequest -> async StorageSetUsageBatchResult;
    usage_ledger_get_v1 : shared query UsageLedgerGetRequest -> async UsageLedgerGetResult;
    whoami : shared query () -> async Whoami;
    zz_generate_synthetic_audit_log_v1 : shared SyntheticAuditLogRequest -> async SyntheticAuditLogResult;
    zz_simulate_consumption_v1 : shared (
        Principal,
        Nat,
      ) -> async SimulateConsumptionResult;
    zz_top_up_promo_cycles_v1 : shared (
        Principal,
        Nat,
      ) -> async AccountTopUpResult;
    zz_trigger_auto_topup_v1 : shared () -> async Text;
  }
}
