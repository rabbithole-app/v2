import Text "mo:core/Text";

import ICPayWebhooks "mo:icpay-webhooks";
import TreasuryTypes "mo:treasury/Types";

module {
  public type PaymentPurpose = {
    #deposit;
    #license;
    #pro_monthly;
  };

  public func parsePurpose(text : Text) : ?PaymentPurpose {
    if (text == "deposit") ?#deposit
    else if (text == "license") ?#license
    else if (text == "pro_monthly") ?#pro_monthly
    else null;
  };

  /// Map ICPay PaymentMethod to treasury TokenId
  public func resolveTokenId(method : ICPayWebhooks.PaymentMethod) : TreasuryTypes.TokenId {
    switch (method.network) {
      case (#IC) {
        switch (method.currency) {
          case (#native) #ICP;
          case (#token(addr)) {
            if (Text.equal(addr, "xevnm-gaaaa-aaaar-qafnq-cai")) #ckUSDC
            else if (Text.equal(addr, "cngnf-vqaaa-aaaar-qag4q-cai")) #ckUSDT
            else if (Text.equal(addr, "ss2fx-dyaaa-aaaar-qacoq-cai")) #ckETH
            else #ICP;
          };
        };
      };
      case (#EVM) {
        switch (method.currency) {
          case (#native) #BaseETH;
          case (#token(_)) #BaseUSDC; // TODO: distinguish USDC vs USDT by contract
        };
      };
      case (#Sol) {
        switch (method.currency) {
          case (#native) #SOL;
          case (#token(_)) #SolUSDC; // TODO: distinguish by mint
        };
      };
      case _ #ICP;
    };
  };
};
