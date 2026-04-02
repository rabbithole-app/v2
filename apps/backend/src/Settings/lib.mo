module {
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

  public type UserSettings = {
    spendingPriority : [TokenId];
    autoRenew : Bool;
    autoTopUp : Bool;
    topUpAmountCycles : Nat; // target cycles per top-up (default 1TC)
  };

  public let DEFAULT : UserSettings = {
    spendingPriority = [#ckUSDC, #ckUSDT, #ckETH, #ICP, #BaseUSDC, #BaseUSDT, #BaseETH, #SolUSDC, #SolUSDT, #SOL];
    autoRenew = false;
    autoTopUp = false;
    topUpAmountCycles = 1_000_000_000_000; // 1TC
  };

  public func validateSpendingPriority(priority : [TokenId]) : Bool {
    if (priority.size() == 0 or priority.size() > 10) return false;

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
