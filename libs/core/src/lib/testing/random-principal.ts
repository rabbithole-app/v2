import { Ed25519KeyIdentity } from '@dfinity/identity';

export function randomPrincipal() {
  const identity = Ed25519KeyIdentity.generate();
  return identity.getPrincipal();
}
