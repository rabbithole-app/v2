import { DelegationChain, isDelegationValid } from '@icp-sdk/core/identity';
import { merge, Observable, timer } from 'rxjs';
import { filter, first, map, switchMap } from 'rxjs/operators';

export const timeInNanosToDate = (time: bigint) =>
  new Date(Number(time / 1_000_000n));

export function waitDelegationExpired() {
  return (source$: Observable<DelegationChain | null>) =>
    source$.pipe(
      filter((v) => v !== null),
      switchMap<DelegationChain, Observable<void>>((delegationChain) => {
        const expirations = delegationChain.delegations.map(({ delegation }) =>
          timer(Number(delegation.expiration / 1_000_000n) - Date.now()),
        );
        return merge(...expirations).pipe(
          first(() => !isDelegationValid(delegationChain)),
          map(() => void 0),
        );
      }),
    );
}
