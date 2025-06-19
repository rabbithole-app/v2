type Result<T, E> = [null, E] | [T];

/**
 * Executes a function and returns a result object containing either the data or an error.
 * @param fn A function to execute.
 * @returns A result object with either `data` and `error: undefined`, or `data: undefined` and `error`.
 */
export function tryCatch<T, E = Error>(fn: () => T): Result<T, E>;

/**
 * Executes a promise and returns a promise that resolves to a result object containing either the data or an error.
 * @param promise A promise to execute.
 * @returns A promise that resolves to a result object with either `data` and `error: undefined`, or `data: undefined` and `error`.
 */
export function tryCatch<T, E = Error>(
  promise: Promise<T>
): Promise<Result<T, E>>;

export function tryCatch<T, E = Error>(
  input: Promise<T> | (() => T)
): Promise<Result<T, E>> | Result<T, E> {
  if (typeof input === 'function') {
    try {
      return [input()];
    } catch (error) {
      return [null, error as E];
    }
  }

  if (input instanceof Promise) {
    return input
      .then((data) => [data] as [T])
      .catch((error) => [null, error as E]);
  }

  throw new Error('Input must be a function or a promise.');
}
