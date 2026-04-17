module {
  public type ThresholdKeyName = Text;

  public type TokenId = {
    #ICP;
    #ckUSDC;
    #ckUSDT;
    #ckETH;
    #BaseETH;
    #BaseUSDC;
    #BaseUSDT;
    #SOL;
    #SolUSDC;
    #SolUSDT;
  };

  public type AssetLocator = {
    #Native;
    #Contract : Text;
    #Mint : Text;
  };

  public type SupportedAsset = {
    tokenId : TokenId;
    symbol : Text;
    decimals : Nat8;
    locator : AssetLocator;
  };

  public type EvmChainConfig = {
    networkId : Text;
    chainId : Nat;
    evmRpcCanisterId : Text;
    rpcUrls : [Text];
    assets : [SupportedAsset];
  };

  public type SolanaChainConfig = {
    networkId : Text;
    solRpcCanisterId : Text;
    rpcUrl : ?Text;
    assets : [SupportedAsset];
  };

  public type ChainConfig = {
    #Evm : EvmChainConfig;
    #Solana : SolanaChainConfig;
  };
};
