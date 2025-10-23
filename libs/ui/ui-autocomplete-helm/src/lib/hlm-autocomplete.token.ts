import { inject, InjectionToken, type ValueProvider } from '@angular/core';

export interface HlmAutocompleteConfig<T> {
  transformOptionToString: TransformValueToString<T>;
  transformValueToSearch: TransformValueToString<T>;
}

export type TransformValueToString<T> = (option: T) => string;

function getDefaultConfig<T>(): HlmAutocompleteConfig<T> {
  return {
    transformValueToSearch: (option: T) =>
      typeof option === 'string' ? option : String(option),
    transformOptionToString: (option: T) =>
      typeof option === 'string' ? option : String(option),
  };
}

const HlmAutocompleteConfigToken = new InjectionToken<
  HlmAutocompleteConfig<unknown>
>('HlmAutocompleteConfig');

export function injectHlmAutocompleteConfig<T>(): HlmAutocompleteConfig<T> {
  return (
    inject(HlmAutocompleteConfigToken, { optional: true }) ?? getDefaultConfig()
  );
}

export function provideHlmAutocompleteConfig<T>(
  config: Partial<HlmAutocompleteConfig<T>>,
): ValueProvider {
  return {
    provide: HlmAutocompleteConfigToken,
    useValue: { ...getDefaultConfig(), ...config },
  };
}
