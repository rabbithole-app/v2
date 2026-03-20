import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { AUTH_SERVICE } from '@rabbithole/auth';

export const dashboardGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const authService = inject(AUTH_SERVICE);
  return authService.ready$.pipe(
    filter((v) => v),
    map(() => {
      const isAuthenticated = authService.isAuthenticated();
      if (!isAuthenticated) {
        const loginUrl = router.parseUrl('/login');
        loginUrl.queryParams['redirectUrl'] = state.url;
        return new RedirectCommand(loginUrl);
      }

      return true;
    }),
  );
};
