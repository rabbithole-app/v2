module {
  public type TokenId = {
    #ICP;
    #ckUSDC;
    #ckUSDT;
    #BaseETH;
    #BaseUSDC;
    #BaseUSDT;
    #SOL;
    #SolUSDC;
    #SolUSDT;
  };

  public type UserSettings = {
    spendingPriority : [TokenId];
    autoRenew : Bool;
  };

  public let DEFAULT : UserSettings = {
    spendingPriority = [#ckUSDC, #ckUSDT, #ICP, #BaseUSDC, #BaseUSDT, #BaseETH, #SolUSDC, #SolUSDT, #SOL];
    autoRenew = false;
  };

  public func validateSpendingPriority(priority : [TokenId]) : Bool {
    if (priority.size() == 0 or priority.size() > 9) return false;

    // Check for duplicates
    var i = 0;
    while (i < priority.size()) {
      var j = i + 1;
      while (j < priority.size()) {
        if (priority[i] == priority[j]) return false;
        j += 1;
      };
      i += 1;
    };

    true;
  };
};
