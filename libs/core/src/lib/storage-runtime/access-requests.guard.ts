import { inject, Injector, runInInjectionContext } from '@angular/core';
import {
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';

import { provideEncryptedStorage } from '../injectors/encrypted-storage';
import {
  injectEncryptedStorageCanisterIdFromRouteContext,
  provideEncryptedStorageCanisterId,
} from '../tokens/encrypted-storage-canister';
import { AccessRequestsCapabilityService } from './access-requests-capability.service';

export const accessRequestsCanActivate: CanActivateFn = async (route, state) => {
  const injector = inject(Injector);
  const router = inject(Router);

  try {
    const canisterId = injectEncryptedStorageCanisterIdFromRouteContext(route);

    return await runInInjectionContext(
      Injector.create({
        providers: [
          provideEncryptedStorageCanisterId(canisterId),
          provideEncryptedStorage(),
          AccessRequestsCapabilityService,
        ],
        parent: injector,
      }),
      async () => {
        const capability = inject(AccessRequestsCapabilityService);
        return (await capability.check()) || router.parseUrl(fallbackUrl(state));
      },
    );
  } catch {
    return router.parseUrl(fallbackUrl(state));
  }
};

function fallbackUrl(state: RouterStateSnapshot): string {
  return state.url.includes('/access-requests')
    ? state.url.replace(/\/access-requests(?:\/.*)?$/, '/drive')
    : '/drive';
}
