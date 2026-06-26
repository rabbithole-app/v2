import {
  AuthClient,
  AuthClientCreateOptions,
  KEY_STORAGE_DELEGATION,
  KEY_STORAGE_KEY,
} from '@icp-sdk/auth/client';
import {
  DelegationChain,
  Ed25519KeyIdentity,
  isDelegationValid,
  JsonnableDelegationChain,
  JsonnableEd25519KeyIdentity,
} from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { bytesToHex } from '@noble/hashes/utils';
import { load } from '@tauri-apps/plugin-store';

import { TauriStorage } from './storage';

const STORE_PATH = 'store.json';

export async function createAuthClient(): Promise<AuthClient> {
  const options: AuthClientCreateOptions = {
    // Idle checks aren't needed
    idleOptions: {
      disableDefaultIdleCallback: true,
      disableIdle: true,
    },
    keyType: 'Ed25519',
    storage: new TauriStorage(),
  };

  return new AuthClient(options);
}

export async function clearDelegationChain() {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  await store.delete(KEY_STORAGE_DELEGATION);
  await store.save();
}

export async function loadDelegationChain(targets: Principal[] = []) {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  const delegationChainJson = await store.get<
    JsonnableDelegationChain | string
  >(
    KEY_STORAGE_DELEGATION,
  );
  const parsedDelegationChain =
    typeof delegationChainJson === 'string'
      ? JSON.parse(delegationChainJson)
      : delegationChainJson;
  let delegationChain = parsedDelegationChain
    ? DelegationChain.fromJSON(parsedDelegationChain)
    : null;

  if (delegationChain) {
    if (!isDelegationChainValid(delegationChain, targets)) {
      await clearDelegationChain();
      delegationChain = null;
    }
  }

  return delegationChain;
}

export function isDelegationChainValid(
  delegationChain: DelegationChain,
  targets: Principal[] = [],
) {
  if (hasDelegationCycle(delegationChain)) {
    return false;
  }

  if (targets.length === 0) {
    return isDelegationValid(delegationChain);
  }

  return targets.every(
    (target) =>
      isDelegationValid(delegationChain, { scope: target }) &&
      isDelegationTargetedTo(delegationChain, target),
  );
}

function hasDelegationCycle(delegationChain: DelegationChain) {
  const seen = new Set<string>();
  const keys = [
    delegationChain.publicKey,
    ...delegationChain.delegations.map(({ delegation }) => delegation.pubkey),
  ];

  for (const key of keys) {
    const hex = bytesToHex(key);
    if (seen.has(hex)) {
      return true;
    }
    seen.add(hex);
  }

  return false;
}

function isDelegationTargetedTo(
  delegationChain: DelegationChain,
  target: Principal,
) {
  return delegationChain.delegations.some(({ delegation }) =>
    delegation.targets?.some((scope) => scope.toText() === target.toText()),
  );
}

export async function loadIdentity() {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  const identityJson = await store.get<
    JsonnableEd25519KeyIdentity | string
  >(KEY_STORAGE_KEY);

  if (!identityJson) {
    return null;
  }

  const parsed =
    typeof identityJson === 'string' ? JSON.parse(identityJson) : identityJson;

  return Ed25519KeyIdentity.fromParsedJson(parsed);
}

export async function loadOrCreateIdentity(): Promise<Ed25519KeyIdentity> {
  const existing = await loadIdentity();
  if (existing) return existing;

  const identity = Ed25519KeyIdentity.generate();
  await saveIdentity(identity);
  return identity;
}

export async function saveDelegationChain(delegationChain: DelegationChain) {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  const value = JSON.stringify(delegationChain.toJSON());
  await store.set(KEY_STORAGE_DELEGATION, value);
  await store.save();
}

export async function saveIdentity(identity: Ed25519KeyIdentity) {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  await store.set(KEY_STORAGE_KEY, JSON.stringify(identity.toJSON()));
  await store.save();
}
