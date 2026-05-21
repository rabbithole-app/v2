export type StorageResult<T> =
  | T
  | { err: { code?: unknown; message?: string } }
  | { ok: T };

export function toOptionalVariant<T extends string>(
  value: T | undefined,
): [] | [Record<T, null>] {
  return value ? [{ [value]: null } as Record<T, null>] : [];
}

export function unwrapStorageResult<T>(result: StorageResult<T>): T {
  if (result && typeof result === 'object' && 'err' in result) {
    const { code, message } = result.err;
    const label = storageErrorCodeLabel(code);
    const fallback = message ?? 'Storage operation failed';

    throw new Error(label ? `[${label}] ${fallback}` : fallback);
  }

  if (result && typeof result === 'object' && 'ok' in result) {
    return result.ok;
  }

  return result as T;
}

function storageErrorCodeLabel(code: unknown): string | null {
  if (!code || typeof code !== 'object') return null;
  const [label] = Object.keys(code);

  return label ?? null;
}
