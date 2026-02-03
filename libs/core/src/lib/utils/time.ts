const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export const timeInNanosToDate = (time: bigint) =>
  new Date(Number(time / NANOSECONDS_PER_MILLISECOND));

export const dateToTimeInNanos = (date: Date) =>
  BigInt(date.getTime()) * NANOSECONDS_PER_MILLISECOND;
