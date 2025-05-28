/**
 * Minimal promise executor with concurrency limit implementation
 * @param concurrency Maximum number of promises executed concurrently
 */
export const limit = (concurrency: number) => {
  const queue: Array<{
    fn: () => Promise<unknown>;
    reject: (reason: unknown) => void;
    resolve: (value: PromiseLike<unknown> | unknown) => void;
  }> = [];
  let active = 0;
  const next = () => {
    if (active < concurrency && queue.length > 0) {
      active++;
      const { fn, resolve, reject } = queue.shift() ?? {};
      fn?.()
        .then(resolve)
        .catch(reject)
        .then(() => {
          active--;
          next();
        });
    }
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<unknown>((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    }) as Promise<T>;
};

export type LimitFn = ReturnType<typeof limit>;
