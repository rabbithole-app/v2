import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';

export function randomPrincipal() {
  const identity = Ed25519KeyIdentity.generate();
  return identity.getPrincipal();
}
