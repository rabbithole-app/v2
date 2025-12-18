import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { catchError, of } from 'rxjs';

import { CanistersService } from '../services';
import { resourceToObservable } from '@rabbithole/core';

export const canisterListResolver: ResolveFn<Principal[]> = () => {
  const canistersService = inject(CanistersService);
  return resourceToObservable(canistersService.list).pipe(
    catchError(() => of([])),
  );
};
