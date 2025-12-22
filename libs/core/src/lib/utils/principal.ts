import { AccountIdentifier } from '@icp-sdk/canisters/ledger/icp';
import { Principal } from '@icp-sdk/core/principal';

export const isPrincipal = (principal: string): boolean => {
  try {
    Principal.fromText(principal);
    return true;
  } catch (_) {
    return false;
  }
};

export const isAccountIdentifier = (accountId: string): boolean => {
  try {
    AccountIdentifier.fromHex(accountId);
    return true;
  } catch (_) {
    return false;
  }
};
