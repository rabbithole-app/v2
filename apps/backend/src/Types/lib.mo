import TreasuryConfigTypes "mo:treasury/ConfigTypes";

module {
  public type ThresholdKeyName = TreasuryConfigTypes.ThresholdKeyName;

  public type AssetLocator = TreasuryConfigTypes.AssetLocator;
  public type SupportedAsset = TreasuryConfigTypes.SupportedAsset;
  public type EvmChainConfig = TreasuryConfigTypes.EvmChainConfig;
  public type SolanaChainConfig = TreasuryConfigTypes.SolanaChainConfig;
  public type ChainConfig = TreasuryConfigTypes.ChainConfig;

  public type VerifiedIdentityAttributes = {
    email : ?Text;
    name : ?Text;
    verifiedEmail : ?Bool;
    provider : ?Text;
  };

  public type IdentityAttributesSyncError = {
    #attributesNotFound;
    #expired;
    #malformedPayload;
    #verifiedEmailRequired;
  };

  public type IdentityAttributesSyncResult = {
    #ok;
    #err : IdentityAttributesSyncError;
  };

  public type InitArgs = {
    icpaySecretKey : ?Blob;
    chains : [ChainConfig];
  };
};
