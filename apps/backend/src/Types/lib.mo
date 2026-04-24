import TreasuryConfigTypes "mo:treasury/ConfigTypes";

module {
  public type ThresholdKeyName = TreasuryConfigTypes.ThresholdKeyName;

  public type AssetLocator = TreasuryConfigTypes.AssetLocator;
  public type SupportedAsset = TreasuryConfigTypes.SupportedAsset;
  public type EvmChainConfig = TreasuryConfigTypes.EvmChainConfig;
  public type SolanaChainConfig = TreasuryConfigTypes.SolanaChainConfig;
  public type ChainConfig = TreasuryConfigTypes.ChainConfig;

  public type InitArgs = {
    icpaySecretKey : ?Blob;
    chains : [ChainConfig];
  };
};
