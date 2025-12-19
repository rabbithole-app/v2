import { Principal } from '@icp-sdk/core/principal';

export const isPrincipal = (principal: string): boolean => {
  try {
    Principal.fromText(principal);
    return true;
  } catch (_) {
    return false;
  }
};
