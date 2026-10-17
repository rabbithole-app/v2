import { describe, expect, it } from 'vitest';

import { dashboardGuard } from '@rabbithole/core/app-runtime';

import { appRoutes } from './app.routes';

describe('dashboard route startup', () => {
  it('keeps auth gating without waiting for profile data', () => {
    const dashboardRoute = appRoutes.find(({ path }) => path === 'dashboard');

    expect(dashboardRoute?.canActivate).toContain(dashboardGuard);
    expect(dashboardRoute?.resolve).toBeUndefined();
  });
});
