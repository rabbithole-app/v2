import { inject, InjectionToken, type ValueProvider } from '@angular/core';

import type { IconSize } from './hlm-icon';

export interface HlmIconConfig {
	size: IconSize;
}

const defaultConfig: HlmIconConfig = {
	size: 'base',
};

const HlmIconConfigToken = new InjectionToken<HlmIconConfig>('HlmIconConfig');

export function injectHlmIconConfig(): HlmIconConfig {
	return inject(HlmIconConfigToken, { optional: true }) ?? defaultConfig;
}

export function provideHlmIconConfig(config: Partial<HlmIconConfig>): ValueProvider {
	return { provide: HlmIconConfigToken, useValue: { ...defaultConfig, ...config } };
}
