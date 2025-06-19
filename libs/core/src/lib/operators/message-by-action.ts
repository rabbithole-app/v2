import { Observable, OperatorFunction } from 'rxjs';
import { map } from 'rxjs/operators';

import { Message } from '../types';
import { filterByAction } from './filter-by-action';

export function messageByAction<
  T extends MessageEvent<Message<Record<string, unknown>>>,
  A extends T['data']['action'],
>(action: A): OperatorFunction<T, Extract<T['data'], { action: A }>> {
  return (source: Observable<T>) =>
    source.pipe(
      map(({ data }) => data),
      filterByAction(action),
    );
}
