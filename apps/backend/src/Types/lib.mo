import TreasuryConfigTypes "mo:treasury/ConfigTypes";

import IIVerify "IIVerify";

module {
  public type ThresholdKeyName = TreasuryConfigTypes.ThresholdKeyName;

  public type AssetLocator = TreasuryConfigTypes.AssetLocator;
  public type SupportedAsset = TreasuryConfigTypes.SupportedAsset;
  public type EvmChainConfig = TreasuryConfigTypes.EvmChainConfig;
  public type SolanaChainConfig = TreasuryConfigTypes.SolanaChainConfig;
  public type ChainConfig = TreasuryConfigTypes.ChainConfig;

  public type VerifiedIdentityAttributes = IIVerify.VerifiedIdentityAttributes;

  public type IdentityAttributesSyncError = {
    #nonceNotFound;
    #nonceMismatch;
    #untrustedSigner;
    #invalidOrigin;
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
