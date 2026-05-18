import { filter } from 'rxjs/operators';
import { TestScheduler } from 'rxjs/testing';
import { describe, expect, it } from 'vitest';

import { repeatItemWhen } from './repeat-item-when';

describe('repeatItemWhen', () => {
  it('emits the source item again on every matching repeat notification', () => {
    const scheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });

    scheduler.run(({ hot, expectObservable }) => {
      const item = { id: 'file-a' };
      const source = hot('a--------', { a: item });
      const repeat = hot('--r-r-x-r', { r: 'file-a', x: 'file-b' });

      const result = source.pipe(
        repeatItemWhen((upload) =>
          repeat.pipe(filter((id) => id === upload.id)),
        ),
      );

      expectObservable(result).toBe('a-r-r---r', {
        a: item,
        r: item,
      });
    });
  });
});
