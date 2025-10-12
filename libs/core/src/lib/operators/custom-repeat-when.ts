import { Observable, ReplaySubject } from 'rxjs';
import { audit, connect, mergeWith } from 'rxjs/operators';

export function customRepeatWhen<T>(
  auditCallback: (v: T) => Observable<unknown>,
) {
  return (source: Observable<T>) =>
    source.pipe(
      connect(
        (shared) => shared.pipe(mergeWith(shared.pipe(audit(auditCallback)))),
        {
          connector: () => new ReplaySubject(1),
        },
      ),
    );
}
