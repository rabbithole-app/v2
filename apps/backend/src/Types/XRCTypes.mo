// Generated from https://raw.githubusercontent.com/dfinity/exchange-rate-canister/main/src/xrc/xrc.did

module {
  public type AssetClass = {
    #Cryptocurrency;
    #FiatCurrency;
  };

  public type Asset = {
    symbol : Text;
    class_ : AssetClass;
  };

  public type GetExchangeRateRequest = {
    base_asset : Asset;
    quote_asset : Asset;
    timestamp : ?Nat64;
  };

  public type ExchangeRateMetadata = {
    decimals : Nat32;
    base_asset_num_received_rates : Nat64;
    base_asset_num_queried_sources : Nat64;
    quote_asset_num_received_rates : Nat64;
    quote_asset_num_queried_sources : Nat64;
    standard_deviation : Nat64;
    forex_timestamp : ?Nat64;
  };

  public type ExchangeRate = {
    base_asset : Asset;
    quote_asset : Asset;
    timestamp : Nat64;
    rate : Nat64;
    metadata : ExchangeRateMetadata;
  };

  public type ExchangeRateError = {
    #AnonymousPrincipalNotAllowed;
    #Pending;
    #CryptoBaseAssetNotFound;
    #CryptoQuoteAssetNotFound;
    #StablecoinRateNotFound;
    #StablecoinRateTooFewRates;
    #StablecoinRateZeroRate;
    #ForexInvalidTimestamp;
    #ForexBaseAssetNotFound;
    #ForexQuoteAssetNotFound;
    #ForexAssetsNotFound;
    #RateLimited;
    #NotEnoughCycles;
    #FailedToAcceptCycles;
    #InconsistentRatesReceived;
    #Other : { code : Nat32; description : Text };
  };

  public type GetExchangeRateResult = {
    #Ok : ExchangeRate;
    #Err : ExchangeRateError;
  };

  public type Self = actor {
    get_exchange_rate : shared (GetExchangeRateRequest) -> async GetExchangeRateResult;
  };
};
