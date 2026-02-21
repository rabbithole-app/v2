import Map "mo:core/Map";
import Principal "mo:core/Principal";

import Account "Account";

module {
  /// Per-user wallet addresses across chains.
  public type WalletAddresses = {
    icSubaccount : Blob;
    evmAddress : ?Text;   // Phase 2
    solAddress : ?Text;   // Phase 3
  };

  public type WalletCacheStore = Map.Map<Principal, WalletAddresses>;

  public func empty() : WalletCacheStore {
    Map.empty<Principal, WalletAddresses>();
  };

  /// Get or compute wallet addresses for a principal.
  /// Phase 1: only icSubaccount (computed locally, no management canister calls).
  public func getOrCreate(cache : WalletCacheStore, principal : Principal) : (WalletCacheStore, WalletAddresses) {
    switch (Map.get(cache, Principal.compare, principal)) {
      case (?existing) (cache, existing);
      case null {
        let addresses : WalletAddresses = {
          icSubaccount = Account.principalToSubaccount(principal);
          evmAddress = null;
          solAddress = null;
        };
        let updated = Map.put(cache, Principal.compare, principal, addresses);
        (updated, addresses);
      };
    };
  };

  /// Get subaccount for a principal (convenience, always computed locally).
  public func getSubaccount(principal : Principal) : Blob {
    Account.principalToSubaccount(principal);
  };
};
