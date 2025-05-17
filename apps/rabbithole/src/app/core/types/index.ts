export type MutableProperties<T, K extends keyof T> = {
  -readonly [P in K]: T[P];
} & T;
