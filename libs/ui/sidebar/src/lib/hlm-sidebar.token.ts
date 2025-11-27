import { inject, InjectionToken, type ValueProvider } from '@angular/core';

export interface HlmSidebarConfig {
	mobileBreakpoint: string;
	sidebarCookieMaxAge: number;
	sidebarCookieName: string;
	sidebarKeyboardShortcut: string;
	sidebarWidth: string;
	sidebarWidthIcon: string;
	sidebarWidthMobile: string;
}

const defaultConfig: HlmSidebarConfig = {
	sidebarWidth: '16rem',
	sidebarWidthMobile: '18rem',
	sidebarWidthIcon: '3rem',
	sidebarCookieName: 'sidebar_state',
	sidebarCookieMaxAge: 60 * 60 * 24 * 7, // 7 days in seconds
	sidebarKeyboardShortcut: 'b',
	mobileBreakpoint: '768px',
};

const HlmSidebarConfigToken = new InjectionToken<HlmSidebarConfig>('HlmSidebarConfig');

export function injectHlmSidebarConfig(): HlmSidebarConfig {
	return inject(HlmSidebarConfigToken, { optional: true }) ?? defaultConfig;
}

export function provideHlmSidebarConfig(config: Partial<HlmSidebarConfig>): ValueProvider {
	return { provide: HlmSidebarConfigToken, useValue: { ...defaultConfig, ...config } };
}
