import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface Asset { 'class' : AssetClass, 'symbol' : string }
export type AssetClass = { 'Cryptocurrency' : null } |
  { 'FiatCurrency' : null };
export interface ExchangeRate {
  'metadata' : ExchangeRateMetadata,
  'rate' : bigint,
  'timestamp' : bigint,
  'quote_asset' : Asset,
  'base_asset' : Asset,
}
export type ExchangeRateError = {
    /**
     * Returned when the canister receives a call from the anonymous principal.
     */
    'AnonymousPrincipalNotAllowed' : null
  } |
  {
    /**
     * Returned when the quote asset rates are not found from the exchanges HTTP outcalls.
     */
    'CryptoQuoteAssetNotFound' : null
  } |
  {
    /**
     * Returned when the canister fails to accept enough cycles.
     */
    'FailedToAcceptCycles' : null
  } |
  {
    /**
     * Returned when the forex base asset is found.
     */
    'ForexBaseAssetNotFound' : null
  } |
  {
    /**
     * Returned when the base asset rates are not found from the exchanges HTTP outcalls.
     */
    'CryptoBaseAssetNotFound' : null
  } |
  {
    /**
     * Returned when there are not enough stablecoin rates to determine the forex/USDT rate.
     */
    'StablecoinRateTooFewRates' : null
  } |
  {
    /**
     * Returned when neither forex asset is found.
     */
    'ForexAssetsNotFound' : null
  } |
  {
    /**
     * / Returned if too many collected rates deviate substantially.
     */
    'InconsistentRatesReceived' : null
  } |
  {
    /**
     * Returned when the caller is not the CMC and there are too many active requests.
     */
    'RateLimited' : null
  } |
  {
    /**
     * Returned when the stablecoin rate is zero.
     */
    'StablecoinRateZeroRate' : null
  } |
  {
    /**
     * Until candid bug is fixed, new errors after launch will be placed here.
     */
    'Other' : {
      /**
       * The identifier for the error that occurred.
       */
      'code' : number,
      /**
       * A description of the error that occurred.
       */
      'description' : string,
    }
  } |
  {
    /**
     * Returned when a rate for the provided forex asset could not be found at the provided timestamp.
     */
    'ForexInvalidTimestamp' : null
  } |
  {
    /**
     * Returned when the caller does not send enough cycles to make a request.
     */
    'NotEnoughCycles' : null
  } |
  {
    /**
     * Returned when the forex quote asset is found.
     */
    'ForexQuoteAssetNotFound' : null
  } |
  {
    /**
     * Returned when the stablecoin rates are not found from the exchanges HTTP outcalls needed for computing a crypto/fiat pair.
     */
    'StablecoinRateNotFound' : null
  } |
  {
    /**
     * / Returned when the canister is in process of retrieving a rate from an exchange.
     */
    'Pending' : null
  };
export interface ExchangeRateMetadata {
  'decimals' : number,
  'forex_timestamp' : [] | [bigint],
  'quote_asset_num_received_rates' : bigint,
  'base_asset_num_received_rates' : bigint,
  'base_asset_num_queried_sources' : bigint,
  'standard_deviation' : bigint,
  'quote_asset_num_queried_sources' : bigint,
}
/**
 * The parameters for the `get_exchange_rate` API call.
 */
export interface GetExchangeRateRequest {
  /**
   * An optional timestamp to get the rate for a specific time period.
   */
  'timestamp' : [] | [bigint],
  'quote_asset' : Asset,
  'base_asset' : Asset,
}
export type GetExchangeRateResult = {
    /**
     * Successfully retrieved the exchange rate from the cache or API calls.
     */
    'Ok' : ExchangeRate
  } |
  {
    /**
     * Failed to retrieve the exchange rate due to invalid API calls, invalid timestamp, etc.
     */
    'Err' : ExchangeRateError
  };
export interface InitPayload { 'response' : Response }
export type Response = { 'Error' : ExchangeRateError } |
  {
    'ExchangeRate' : {
      'metadata' : [] | [ExchangeRateMetadata],
      'rate' : bigint,
      'quote_asset' : [] | [Asset],
      'base_asset' : [] | [Asset],
    }
  };
export interface _SERVICE {
  'get_exchange_rate' : ActorMethod<
    [GetExchangeRateRequest],
    GetExchangeRateResult
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
