import TreasuryConfigTypes "mo:treasury/ConfigTypes";

module {
  public type ThresholdKeyName = TreasuryConfigTypes.ThresholdKeyName;

  public type GithubOptions = {
    apiUrl : Text;
    owner : Text;
    repo : Text;
    token : ?Text;
  };

  public type AssetLocator = TreasuryConfigTypes.AssetLocator;
  public type SupportedAsset = TreasuryConfigTypes.SupportedAsset;
  public type EvmChainConfig = TreasuryConfigTypes.EvmChainConfig;
  public type SolanaChainConfig = TreasuryConfigTypes.SolanaChainConfig;
  public type ChainConfig = TreasuryConfigTypes.ChainConfig;

  public type InitArgs = {
    github : ?GithubOptions;
    icpaySecretKey : ?Blob;
    thresholdKeyName : ThresholdKeyName;
    chains : [ChainConfig];
    /// Caffeine cashier canister ID for blob storage protocol
    cashierCanisterId : Principal;
  };
};
