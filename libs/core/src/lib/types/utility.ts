import { InjectionToken } from '@angular/core';

export type ExtractInjectionToken<P> =
  P extends InjectionToken<infer T> ? T : never;

export type MutableProperties<T, K extends keyof T> = {
  -readonly [P in K]: T[P];
} & T;

export type NonNullableProps<T, K extends keyof T> = {
  [K in keyof T]: NonNullable<T[K]>;
} & Omit<T, K>;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & NonNullable<unknown>;
