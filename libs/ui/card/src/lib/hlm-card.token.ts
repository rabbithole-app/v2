import { inject, InjectionToken, type ValueProvider } from '@angular/core';

export type HlmCardConfig = {
  size: 'default' | 'sm';
};

const defaultConfig: HlmCardConfig = {
  size: 'default',
};

const HlmCardConfigToken = new InjectionToken<HlmCardConfig>('HlmCardConfig');

export function injectHlmCardConfig(): HlmCardConfig {
  return inject(HlmCardConfigToken, { optional: true }) ?? defaultConfig;
}

export function provideHlmCardConfig(
  config: Partial<HlmCardConfig>,
): ValueProvider {
  return {
    provide: HlmCardConfigToken,
    useValue: { ...defaultConfig, ...config },
  };
}
