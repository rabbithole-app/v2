import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { catchError, filter, from, map, of, switchMap } from 'rxjs';

import { AUTH_SERVICE } from '@rabbithole/auth';

import { injectMainActor } from '../injectors/main-actor';

export const adminGuard: CanActivateFn = (_route, state) => {
  const actor = injectMainActor();
  const authService = inject(AUTH_SERVICE);
  const router = inject(Router);

  return authService.ready$.pipe(
    filter(Boolean),
    switchMap(() => {
      if (!authService.isAuthenticated()) {
        return of(
          new RedirectCommand(
            router.createUrlTree(['/login'], {
              queryParams: { redirectUrl: state.url },
            }),
          ),
        );
      }

      const principal = authService.identity().getPrincipal();
      return from(actor().isAdmin(principal)).pipe(
        map((isAdmin) => isAdmin || new RedirectCommand(router.parseUrl('/dashboard'))),
        catchError(() => of(new RedirectCommand(router.parseUrl('/dashboard')))),
      );
    }),
  );
};
