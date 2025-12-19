import { Actor, ActorConfig, ActorSubclass } from '@icp-sdk/core/agent';

import { _SERVICE, idlFactory } from './../canisters/encrypted-storage.did';

/**
 * Create an encrypted storage canister actor
 * @param config Configuration to make calls to the Replica.
 */
export function createEncryptedStorageActor(
  config: ActorConfig,
): ActorSubclass<_SERVICE> {
  return Actor.createActor<_SERVICE>(idlFactory, config);
}
