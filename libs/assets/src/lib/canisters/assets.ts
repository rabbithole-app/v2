import { Actor, ActorConfig, ActorSubclass } from '@dfinity/agent';
import { idlFactory, _SERVICE } from './assets.did';

export type AssetsCanisterRecord = _SERVICE;

/**
 * Create an assets canister actor
 * @param config Configuration to make calls to the Replica.
 */
export function getAssetsCanister(
  config: ActorConfig,
): ActorSubclass<AssetsCanisterRecord> {
  return Actor.createActor<AssetsCanisterRecord>(idlFactory, config);
}
