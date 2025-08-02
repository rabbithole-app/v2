import { Actor, ActorSubclass, HttpAgent, Identity } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

export function createActor<T>({
  identity,
  canisterId,
  idlFactory,
  host,
}: {
  canisterId: Principal | string;
  host?: string;
  identity: Identity;
  idlFactory: IDL.InterfaceFactory;
}): Observable<ActorSubclass<T>> {
  return from(
    HttpAgent.create({
      identity,
      shouldFetchRootKey: !environment.production,
      host,
    }),
  ).pipe(
    map((agent) =>
      Actor.createActor<T>(idlFactory, {
        agent,
        canisterId,
      }),
    ),
  );
}
