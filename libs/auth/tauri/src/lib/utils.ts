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
} from '@icp-sdk/core/identity';
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

  return await AuthClient.create(options);
}

export async function loadDelegationChain() {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  const delegationChainJson = await store.get<JsonnableDelegationChain>(
    KEY_STORAGE_DELEGATION,
  );
  let delegationChain = delegationChainJson
    ? DelegationChain.fromJSON(delegationChainJson)
    : null;

  if (delegationChain) {
    if (!isDelegationValid(delegationChain)) {
      await store.delete(KEY_STORAGE_DELEGATION);
      delegationChain = null;
    }
  }

  return delegationChain;
}

export async function loadIdentity() {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  const identityJson = await store.get<string>(KEY_STORAGE_KEY);

  return identityJson
    ? Ed25519KeyIdentity.fromParsedJson(JSON.parse(identityJson))
    : null;
}

export async function saveDelegationChain(delegationChain: DelegationChain) {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  const value = JSON.stringify(delegationChain.toJSON());
  await store.set(KEY_STORAGE_DELEGATION, value);
  await store.save();
}

export async function saveIdentity(identity: Ed25519KeyIdentity) {
  const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
  await store.set(KEY_STORAGE_KEY, identity.toJSON());
  await store.save();
}
