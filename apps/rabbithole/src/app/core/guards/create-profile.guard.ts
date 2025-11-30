import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RedirectCommand,
  Router,
} from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { ProfileService } from '@rabbithole/core';

export const createProfileGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const profileService = inject(ProfileService);

  return profileService.ready$.pipe(
    filter((v) => v),
    map(() => {
      const profile = profileService.profile();
      if (profile) {
        return new RedirectCommand(router.parseUrl('/'), { replaceUrl: true });
      }

      return true;
    })
  );
};
