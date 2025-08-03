import { inject, InjectionToken, ValueProvider } from '@angular/core';

import type { ButtonVariants } from './hlm-button';

export interface BrnButtonConfig {
  size: ButtonVariants['size'];
  variant: ButtonVariants['variant'];
}

const defaultConfig: BrnButtonConfig = {
  variant: 'default',
  size: 'default',
};

const BrnButtonConfigToken = new InjectionToken<BrnButtonConfig>(
  'BrnButtonConfig',
);

export function injectBrnButtonConfig(): BrnButtonConfig {
  return inject(BrnButtonConfigToken, { optional: true }) ?? defaultConfig;
}

export function provideBrnButtonConfig(
  config: Partial<BrnButtonConfig>,
): ValueProvider {
  return {
    provide: BrnButtonConfigToken,
    useValue: { ...defaultConfig, ...config },
  };
}
