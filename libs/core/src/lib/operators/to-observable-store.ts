import { Store } from '@tanstack/store';
import { Observable } from 'rxjs';

export const toObservableStore = <T>(store: Store<T>) =>
  new Observable<T>((subscriber) => {
    const unlisten = store.subscribe(({ currentVal }) =>
      subscriber.next(currentVal)
    );
    return () => unlisten();
  });
