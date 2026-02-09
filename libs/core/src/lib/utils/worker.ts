import { IdbStorage, KEY_STORAGE_KEY } from '@icp-sdk/auth/client';
import { Identity } from '@icp-sdk/core/agent';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
  type JsonnableDelegationChain,
} from '@icp-sdk/core/identity';
import { isNullish } from 'remeda';

import { createAuthClient } from './create-auth-client';

const KEY_STORAGE_DELEGATION = 'delegationChain';

/**
 * Loads identity from IndexedDB.
 * Supports both standard AuthClient flow (rabbithole) and
 * delegation-based auth flow (storage app).
 */
export const loadIdentity = async (): Promise<Identity | null> => {
  // 1. Try standard AuthClient flow (works for rabbithole with Internet Identity)
  const authClient = await createAuthClient();
  const isAuthenticated = await authClient.isAuthenticated();

  if (isAuthenticated) {
    const identity = authClient.getIdentity();
    if (!isNullish(identity) && !identity.getPrincipal().isAnonymous()) {
      return identity;
    }
  }

  // 2. Fallback: try delegation-based auth (used by storage app)
  const db = new IdbStorage();
  const delegationChainJson =
    await db.get<JsonnableDelegationChain>(KEY_STORAGE_DELEGATION);

  if (!delegationChainJson) {
    return null;
  }

  const delegationChain = DelegationChain.fromJSON(delegationChainJson);

  if (!isDelegationValid(delegationChain)) {
    return null;
  }

  const identityJson = await db.get<string>(KEY_STORAGE_KEY);

  if (!identityJson) {
    return null;
  }

  const localIdentity = Ed25519KeyIdentity.fromParsedJson(
    JSON.parse(identityJson),
  );

  return DelegationIdentity.fromDelegation(localIdentity, delegationChain);
};
