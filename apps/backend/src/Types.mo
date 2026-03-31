module {
  public type GithubOptions = {
    apiUrl : Text;
    owner : Text;
    repo : Text;
    token : ?Text;
  };

  public type EvmConfig = {
    chainId : Nat;
    ecdsaKeyName : Text;
    evmRpcCanisterId : Text;
    usdcContract : Text;
    usdtContract : Text;
    rpcUrls : [Text];
  };

  public type SolConfig = {
    schnorrKeyName : Text;
    solRpcCanisterId : Text;
    usdcMint : Text;
    usdtMint : Text;
    rpcUrl : ?Text;
  };

  public type InitArgs = {
    github : ?GithubOptions;
    icpaySecretKey : ?Blob;
    evmConfig : ?EvmConfig;
    solConfig : ?SolConfig;
  };
};
