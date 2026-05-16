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

export const principalFromConfig = (
  principal: string | null | undefined,
  key: string,
): Principal => {
  if (!principal) {
    const message = `Missing canister id config "${key}".`;
    console.error(message, { key, value: principal });
    throw new Error(message);
  }

  try {
    return Principal.fromText(principal);
  } catch (error) {
    console.error(`Invalid canister id config "${key}".`, {
      error,
      key,
      value: principal,
    });
    throw error;
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
