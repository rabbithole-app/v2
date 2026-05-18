import { IdbStorage, KEY_STORAGE_KEY } from '@icp-sdk/auth/client';
import { Identity } from '@icp-sdk/core/agent';
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
  type JsonnableDelegationChain,
  type JsonnableEd25519KeyIdentity,
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
  try {
    const authClient = await createAuthClient();
    const identity = await authClient.getIdentity();
    if (!isNullish(identity) && !identity.getPrincipal().isAnonymous()) {
      return identity;
    }
  } catch {
    // Continue to the storage delegation fallback instead of silently uploading
    // as anonymous when AuthClient session hydration fails in the worker.
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

  const storedIdentity = await db.get<unknown>(KEY_STORAGE_KEY);

  const localIdentity = parseStoredEd25519Identity(storedIdentity);
  if (!localIdentity) return null;

  return DelegationIdentity.fromDelegation(localIdentity, delegationChain);
};

function isJsonnableEd25519Identity(
  value: unknown,
): value is JsonnableEd25519KeyIdentity {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === 'string')
  );
}

function parseStoredEd25519Identity(
  storedIdentity: unknown,
): Ed25519KeyIdentity | null {
  if (!storedIdentity) return null;

  try {
    const parsed =
      typeof storedIdentity === 'string'
        ? JSON.parse(storedIdentity)
        : storedIdentity;

    return isJsonnableEd25519Identity(parsed)
      ? Ed25519KeyIdentity.fromParsedJson(parsed)
      : null;
  } catch {
    return null;
  }
}
