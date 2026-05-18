import { Observable } from 'rxjs';
import { map, mergeMap, startWith } from 'rxjs/operators';

export function repeatItemWhen<T>(
  repeatCallback: (v: T) => Observable<unknown>,
) {
  return (source: Observable<T>) =>
    source.pipe(
      mergeMap((item) =>
        repeatCallback(item).pipe(
          map(() => item),
          startWith(item),
        ),
      ),
    );
}
