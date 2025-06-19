import { Observable, OperatorFunction } from 'rxjs';
import { filter } from 'rxjs/operators';

import { Message } from '../types';

export function filterByAction<
  T extends Message<Record<string, unknown>>,
  A extends T['action'],
>(action: A): OperatorFunction<T, Extract<T, { action: A }>> {
  return (source: Observable<T>) =>
    source.pipe(
      filter(
        (data): data is Extract<T, { action: A }> => data.action === action,
      ),
    );
}
