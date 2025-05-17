import { DerEncodedPublicKey } from '@dfinity/agent';
import {
  Delegation,
  DelegationChain,
  Ed25519KeyIdentity,
} from '@dfinity/identity';

export async function factoryDelegationChain(): Promise<DelegationChain> {
  const id = Ed25519KeyIdentity.generate();
  const delegation = new Delegation(
    new Uint8Array(id.getPublicKey().toDer()),
    BigInt(new Date().getTime() + 3_600_000),
    undefined
  );
  const delegationBuffer = Buffer.from(JSON.stringify(delegation));
  const signature = await id.sign(delegationBuffer);
  const signedDelegation = {
    delegation,
    signature,
  };
  return DelegationChain.fromDelegations(
    [signedDelegation],
    new Uint8Array(id.getPublicKey().toDer()).buffer as DerEncodedPublicKey
  );
}
