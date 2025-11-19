import { Resource } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { throwError } from 'rxjs';
import { filter, map, raceWith, switchMap } from 'rxjs/operators';

export const resourceToObservable = <T>(resource: Resource<T>) => {
  return toObservable(resource.status).pipe(
    filter((status) => status === 'resolved'),
    map(() => resource.value() as NonNullable<T>),
    raceWith(
      toObservable(resource.status).pipe(
        filter((status) => status === 'error'),
        switchMap(() => throwError(() => resource.error())),
      ),
    ),
  );
};
