import { IDL } from "@icp-sdk/core/candid";

// XRC mock Candid interface — matches xrc_mock.did from dfinity/exchange-rate-canister

const AssetClass = IDL.Variant({
  Cryptocurrency: IDL.Null,
  FiatCurrency: IDL.Null,
});

const Asset = IDL.Record({
  symbol: IDL.Text,
  class: AssetClass,
});

const ExchangeRateMetadata = IDL.Record({
  decimals: IDL.Nat32,
  base_asset_num_received_rates: IDL.Nat64,
  base_asset_num_queried_sources: IDL.Nat64,
  quote_asset_num_received_rates: IDL.Nat64,
  quote_asset_num_queried_sources: IDL.Nat64,
  standard_deviation: IDL.Nat64,
  forex_timestamp: IDL.Opt(IDL.Nat64),
});

const ExchangeRate = IDL.Record({
  base_asset: Asset,
  quote_asset: Asset,
  timestamp: IDL.Nat64,
  rate: IDL.Nat64,
  metadata: ExchangeRateMetadata,
});

const ExchangeRateError = IDL.Variant({
  AnonymousPrincipalNotAllowed: IDL.Null,
  Pending: IDL.Null,
  CryptoBaseAssetNotFound: IDL.Null,
  CryptoQuoteAssetNotFound: IDL.Null,
  StablecoinRateNotFound: IDL.Null,
  StablecoinRateTooFewRates: IDL.Null,
  StablecoinRateZeroRate: IDL.Null,
  ForexInvalidTimestamp: IDL.Null,
  ForexBaseAssetNotFound: IDL.Null,
  ForexQuoteAssetNotFound: IDL.Null,
  ForexAssetsNotFound: IDL.Null,
  RateLimited: IDL.Null,
  NotEnoughCycles: IDL.Null,
  FailedToAcceptCycles: IDL.Null,
  InconsistentRatesReceived: IDL.Null,
  Other: IDL.Record({ code: IDL.Nat32, description: IDL.Text }),
});

const GetExchangeRateRequest = IDL.Record({
  base_asset: Asset,
  quote_asset: Asset,
  timestamp: IDL.Opt(IDL.Nat64),
});

const GetExchangeRateResult = IDL.Variant({
  Ok: ExchangeRate,
  Err: ExchangeRateError,
});

// Response type for init payload
const Response = IDL.Variant({
  ExchangeRate: IDL.Record({
    base_asset: IDL.Opt(Asset),
    quote_asset: IDL.Opt(Asset),
    metadata: IDL.Opt(ExchangeRateMetadata),
    rate: IDL.Nat64,
  }),
  Error: ExchangeRateError,
});

const InitPayload = IDL.Record({
  response: Response,
});

export const xrcMockIdlFactory: IDL.InterfaceFactory = ({ IDL: _IDL }) => {
  return IDL.Service({
    get_exchange_rate: IDL.Func(
      [GetExchangeRateRequest],
      [GetExchangeRateResult],
      [],
    ),
  });
};

export const xrcMockInitArgs = ({ IDL: _IDL }: { IDL: typeof IDL }) => {
  return [InitPayload];
};

/** Encode init args with a default ExchangeRate response */
export function encodeXrcMockInitArg(rate: bigint, decimals: number = 9): Uint8Array {
  return IDL.encode([InitPayload], [
    {
      response: {
        ExchangeRate: {
          base_asset: [],
          quote_asset: [],
          metadata: [
            {
              decimals,
              base_asset_num_received_rates: 5n,
              base_asset_num_queried_sources: 5n,
              quote_asset_num_received_rates: 5n,
              quote_asset_num_queried_sources: 5n,
              standard_deviation: 0n,
              forex_timestamp: [],
            },
          ],
          rate,
        },
      },
    },
  ]);
}
