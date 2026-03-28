module {
  public type GithubOptions = {
    apiUrl : Text;
    owner : Text;
    repo : Text;
    token : ?Text;
  };

  public type InitArgs = {
    github : ?GithubOptions;
  };
};
