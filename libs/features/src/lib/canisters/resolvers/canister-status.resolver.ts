import { inject, Injector } from '@angular/core';
import { ActivatedRouteSnapshot, RedirectCommand, ResolveFn, Router } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { catchError, of } from 'rxjs';

import {
  CanisterDataInfo,
  ENCRYPTED_STORAGE_CANISTER_ID,
  resourceToObservable,
} from '@rabbithole/core';

import { ICManagementService } from '../services';

function findParam(route: ActivatedRouteSnapshot, key: string): string | null {
  let current: ActivatedRouteSnapshot | null = route;
  while (current) {
    const value = current.paramMap.get(key);
    if (value) return value;
    current = current.parent;
  }
  return null;
}

export const canisterStatusResolver: ResolveFn<
  CanisterDataInfo | RedirectCommand
> = (route) => {
  const router = inject(Router);
  const canisterId = findParam(route, 'id');
  if (!canisterId) {
    console.error(new Error('Canister ID parameter is required'));
    return new RedirectCommand(router.parseUrl('/dashboard'));
  }

  const injector = inject(Injector);
  const childInjector = Injector.create({
    providers: [
      {
        provide: ENCRYPTED_STORAGE_CANISTER_ID,
        useValue: Principal.fromText(canisterId),
      },
      ICManagementService,
    ],
    parent: injector,
  });
  const icManagementService = childInjector.get(ICManagementService);

  return resourceToObservable(icManagementService.canisterStatus).pipe(
    catchError((error) => {
      console.error('Failed to load canister status:', error);
      return of(new RedirectCommand(router.parseUrl('/dashboard')));
    }),
  );
};
