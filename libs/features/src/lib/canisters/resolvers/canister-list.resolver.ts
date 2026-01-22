import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { catchError, of } from 'rxjs';

import { resourceToObservable } from '@rabbithole/core';

import { CanistersService } from '../services';

export const canisterListResolver: ResolveFn<Principal[]> = () => {
  const canistersService = inject(CanistersService);
  return resourceToObservable(canistersService.list).pipe(
    catchError(() => of([])),
  );
};
