import { inject, InjectionToken, ValueProvider } from '@angular/core';

export type TreeConfig = {
  indent: number;
};

const defaultConfig: TreeConfig = {
  indent: 20,
};

export const TREE_CONFIG = new InjectionToken<TreeConfig>('TREE_CONFIG');

export function injectTreeConfig(): TreeConfig {
  return inject(TREE_CONFIG, { optional: true }) ?? defaultConfig;
}

export function provideTreeConfig(config: Partial<TreeConfig>): ValueProvider {
  return {
    provide: TREE_CONFIG,
    useValue: { ...defaultConfig, ...config },
  };
}
