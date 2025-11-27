import { inject, InjectionToken, type ValueProvider } from '@angular/core';

export interface HlmAutocompleteConfig<T, V = T> {
	debounceTime: number;
	requireSelection: boolean;
	showClearBtn: boolean;
	transformOptionToString: TransformValueToString<T>;
	transformOptionToValue: ((option: T) => V) | undefined;
	transformValueToSearch: TransformValueToString<T>;
}

export type TransformValueToString<T> = (option: T) => string;

function getDefaultConfig<T, V = T>(): HlmAutocompleteConfig<T, V> {
	return {
		transformValueToSearch: (option: T) => (typeof option === 'string' ? option : String(option)),
		transformOptionToString: (option: T) => (typeof option === 'string' ? option : String(option)),
		transformOptionToValue: undefined,
		requireSelection: false,
		showClearBtn: false,
		debounceTime: 150,
	};
}

const HlmAutocompleteConfigToken = new InjectionToken<HlmAutocompleteConfig<unknown, unknown>>('HlmAutocompleteConfig');

export function injectHlmAutocompleteConfig<T, V = T>(): HlmAutocompleteConfig<T, V> {
	return (
		(inject(HlmAutocompleteConfigToken, { optional: true }) as HlmAutocompleteConfig<T, V> | null) ?? getDefaultConfig()
	);
}

export function provideHlmAutocompleteConfig<T, V = T>(config: Partial<HlmAutocompleteConfig<T, V>>): ValueProvider {
	return { provide: HlmAutocompleteConfigToken, useValue: { ...getDefaultConfig(), ...config } };
}
