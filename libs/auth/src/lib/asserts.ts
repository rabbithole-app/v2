import { AnonymousIdentity, SignIdentity } from '@icp-sdk/core/agent';
import { AuthClient } from '@icp-sdk/auth/client';
import {
  DelegationChain,
  Ed25519PublicKey,
  isDelegationValid,
} from '@icp-sdk/core/identity';

export function assertClient(
  client: AuthClient | null,
): asserts client is AuthClient {
  if (!client) throw Error('The AuthClient instance is not initialized');
}

export function assertDelegationChain(
  delegationChain: DelegationChain | null,
): asserts delegationChain is DelegationChain {
  if (!delegationChain) throw Error('delegation not set');
  if (!isDelegationValid(delegationChain))
    throw Error('delegation is not valid');
}

export function assertDelegationIdentity(
  identity: AnonymousIdentity | SignIdentity,
): asserts identity is SignIdentity {
  if (identity.getPrincipal().isAnonymous())
    throw Error('The sign identity is not provided');
}

export function assertPublicKey(
  publicKey: Ed25519PublicKey | null,
): asserts publicKey is Ed25519PublicKey {
  if (!publicKey) throw Error('publicKey not set');
}
