import { inject } from '@angular/core';
import { RedirectCommand, ResolveFn, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { Profile } from '@rabbithole/declarations';

import { ProfileService } from '../services';

export const profileResolver: ResolveFn<Profile> = () => {
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
