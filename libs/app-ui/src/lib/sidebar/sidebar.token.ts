import { inject, InjectionToken, ValueProvider } from '@angular/core';

export type SidebarConfig = {
  collapsible: 'icon' | 'none' | 'offcanvas';
  side: 'left' | 'right';
  variant: 'floating' | 'inset' | 'sidebar';
};

const defaultConfig: SidebarConfig = {
  side: 'left',
  variant: 'sidebar',
  collapsible: 'offcanvas',
};

const SIDEBAR_CONFIG_TOKEN = new InjectionToken<SidebarConfig>(
  'SIDEBAR_CONFIG_TOKEN'
);

export function injectSidebarConfig(): SidebarConfig {
  return inject(SIDEBAR_CONFIG_TOKEN, { optional: true }) ?? defaultConfig;
}

export function provideSidebarConfig(
  config: Partial<SidebarConfig>
): ValueProvider {
  return {
    provide: SIDEBAR_CONFIG_TOKEN,
    useValue: { ...defaultConfig, ...config },
  };
}
