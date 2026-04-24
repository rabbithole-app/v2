import { Actor, ActorSubclass, HttpAgent, Identity } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { IC_ROOT_KEY } from '@rabbithole/core';

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
      rootKey: IC_ROOT_KEY,
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
