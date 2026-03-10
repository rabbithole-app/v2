import { Actor, ActorConfig, ActorSubclass } from '@icp-sdk/core/agent';

import { EncryptedStorageActorService, encryptedStorageIdlFactory } from '@rabbithole/declarations';

/**
 * Create an encrypted storage canister actor
 * @param config Configuration to make calls to the Replica.
 */
export function createEncryptedStorageActor(
  config: ActorConfig,
): ActorSubclass<EncryptedStorageActorService> {
  return Actor.createActor<EncryptedStorageActorService>(encryptedStorageIdlFactory, config);
}
