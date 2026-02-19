import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { filter, map } from 'rxjs';

import { Profile } from '@rabbithole/declarations';

import { ProfileService } from '../services';

export const profileResolver: ResolveFn<Profile | null> = () => {
  const profileService = inject(ProfileService);

  return profileService.ready$.pipe(
    filter((v) => v),
    map(() => profileService.profile() ?? null),
  );
};
