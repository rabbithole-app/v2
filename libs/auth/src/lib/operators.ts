import { DelegationChain, isDelegationValid } from '@icp-sdk/core/identity';
import { Observable, timer } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';

export function waitDelegationExpired() {
  return (source$: Observable<DelegationChain | null>) =>
    source$.pipe(
      filter((v) => v !== null),
      switchMap<DelegationChain, Observable<void>>((delegationChain) => {
        const expirationTimeMs = Number(
          delegationChain.delegations[0].delegation.expiration / 1000000n
        );
        return timer(expirationTimeMs - Date.now()).pipe(
          filter(() => !isDelegationValid(delegationChain)),
          map(() => void 0)
        );
      })
    );
}
