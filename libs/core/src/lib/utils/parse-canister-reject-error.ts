import { isNonNull } from 'remeda';

export function parseCanisterRejectError(err: unknown) {
  if (err instanceof Error) {
    const res = err.message.match(/(?:Body|Reject text): (.+)/);
    return isNonNull(res) ? res[1] : err.message;
  }

  return null;
}
