import { inject, InjectionToken, type ValueProvider } from '@angular/core';

import type { ItemVariants } from './hlm-item';
import type { ItemMediaVariants } from './hlm-item-media';

export interface HlmItemConfig {
	size: ItemVariants['size'];
	variant: ItemVariants['variant'];
}

const defaultConfig: HlmItemConfig = {
	variant: 'default',
	size: 'default',
};

const HlmItemConfigToken = new InjectionToken<HlmItemConfig>('HlmItemConfig');

export interface HlmItemMediaConfig {
	variant: ItemMediaVariants['variant'];
}

export function injectHlmItemConfig(): HlmItemConfig {
	return inject(HlmItemConfigToken, { optional: true }) ?? defaultConfig;
}

export function provideHlmItemConfig(config: Partial<HlmItemConfig>): ValueProvider {
	return { provide: HlmItemConfigToken, useValue: { ...defaultConfig, ...config } };
}

const defaultMediaConfig: HlmItemMediaConfig = {
	variant: 'default',
};

const HlmItemMediaConfigToken = new InjectionToken<HlmItemMediaConfig>('HlmItemMediaConfig');

export function injectHlmItemMediaConfig(): HlmItemMediaConfig {
	return inject(HlmItemMediaConfigToken, { optional: true }) ?? defaultMediaConfig;
}

export function provideHlmItemMediaConfig(config: Partial<HlmItemMediaConfig>): ValueProvider {
	return { provide: HlmItemMediaConfigToken, useValue: { ...defaultMediaConfig, ...config } };
}
