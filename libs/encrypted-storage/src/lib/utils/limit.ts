/**
 * Minimal promise executor with concurrency limit implementation
 * @param concurrency Maximum number of promises executed concurrently
 */
export const limit = (concurrency: number) => {
  const queue: Array<{
    fn: () => Promise<unknown>;
    reject: (reason: unknown) => void;
    resolve: (value: PromiseLike<unknown> | unknown) => void;
    signal?: AbortSignal;
  }> = [];
  let active = 0;

  const next = () => {
    if (active < concurrency && queue.length > 0) {
      active++;
      const { fn, resolve, reject, signal } = queue.shift() ?? {};

      // Check if operation was aborted while in queue
      if (signal?.aborted) {
        reject?.(new Error('Operation aborted while in queue'));
        active--;
        next();
        return;
      }

      // Create abort handler
      const abortHandler = () => {
        reject?.(new Error('Operation aborted during execution'));
      };

      // Add abort listener if signal is provided
      signal?.addEventListener('abort', abortHandler);

      fn?.()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          signal?.removeEventListener('abort', abortHandler);
          active--;
          next();
        });
    }
  };

  return <T>(fn: () => Promise<T>, signal?: AbortSignal) =>
    new Promise<unknown>((resolve, reject) => {
      // Check if already aborted
      if (signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }
      queue.push({ fn, resolve, reject, signal });
      next();
    }) as Promise<T>;
};

export type LimitFn = ReturnType<typeof limit>;
