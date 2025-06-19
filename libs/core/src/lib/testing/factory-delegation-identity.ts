import { DelegationIdentity, Ed25519KeyIdentity } from '@dfinity/identity';

import { factoryDelegationChain } from './factory-delegation-chain';

export async function factoryDelegationIdentity(): Promise<DelegationIdentity> {
  return DelegationIdentity.fromDelegation(
    Ed25519KeyIdentity.generate(),
    await factoryDelegationChain()
  );
}
