import { Principal } from '@dfinity/principal';

export const isPrincipal = (principal: string): boolean => {
  try {
    Principal.fromText(principal);
    return true;
  } catch (_) {
    return false;
  }
};
