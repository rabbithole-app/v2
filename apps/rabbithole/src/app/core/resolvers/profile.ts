import { inject } from '@angular/core';
import { RedirectCommand, ResolveFn, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { ProfileService } from '../services';
import { Profile } from '@rabbithole/declarations';

export const profileResolver: ResolveFn<Profile> = (route) => {
  const profileService = inject(ProfileService);
  const router = inject(Router);

  return profileService.ready$.pipe(
    filter((v) => v),
    map(() => {
      const profile = profileService.profile();
      if (!profile) {
        return new RedirectCommand(router.parseUrl('/create-profile'), {
          replaceUrl: true,
        });
      }

      return profile;
    }),
  );
};
