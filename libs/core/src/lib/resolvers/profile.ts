import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { filter, map } from 'rxjs';

import { Profile } from '@rabbithole/declarations/backend';

import { BalanceService } from '../services/balance.service';
import { ProfileService } from '../services/profile.service';
import { SubscriptionService } from '../services/subscription.service';
import { StoragesService } from '../storages/services/storages.service';

export const profileResolver: ResolveFn<Profile | null> = () => {
  const profileService = inject(ProfileService);
  inject(StoragesService);
  inject(SubscriptionService);
  inject(BalanceService);

  return profileService.ready$.pipe(
    filter((v) => v),
    map(() => profileService.profile() ?? null),
  );
};
