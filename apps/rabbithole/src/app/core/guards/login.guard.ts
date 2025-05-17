import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RedirectCommand,
  Router,
} from '@angular/router';
import { DelegationIdentity } from '@dfinity/identity';
import { filter, map } from 'rxjs/operators';

import { AUTH_SERVICE } from '@rabbithole/auth';

export const loginGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const authService = inject(AUTH_SERVICE);

  return authService.ready$.pipe(
    filter((v) => v),
    map(() => {
      const redirectUrl = router.parseUrl(
        route.queryParams['redirectUrl'] ?? '/'
      );
      const isAuthenticated = authService.isAuthenticated();
      if (
        isAuthenticated &&
        !(authService.identity() instanceof DelegationIdentity)
      ) {
        // do not add "login?redirectUrl=<path>" to the history
        return new RedirectCommand(redirectUrl, { replaceUrl: true });
      }

      return true;
    })
  );
};
