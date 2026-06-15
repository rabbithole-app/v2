import { expect, test } from '@playwright/test';

import { seedAuthentication } from './helpers/auth';

test.describe('Authenticated routing', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthentication(page);
  });

  test('/login redirects to /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL(/\/dashboard/);
    expect(page.url()).toContain('/dashboard');
    expect(page.url()).not.toContain('/login');
  });

  test('/login?redirectUrl preserves redirect target', async ({ page }) => {
    await page.goto('/login?redirectUrl=%2Fdashboard%2Fprofile');
    await page.waitForURL(/\/dashboard\/profile/);
    expect(page.url()).toContain('/dashboard/profile');
  });

  test('/dashboard renders sidebar layout', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('rbth-core-sidebar-layout')).toBeVisible({
      timeout: 15000,
    });
  });

  test('/dashboard/profile renders profile page', async ({ page }) => {
    await page.goto('/dashboard/profile');
    await page.waitForURL(/\/dashboard\/profile/);
    await expect(page.locator('rbth-core-sidebar-layout')).toBeVisible({
      timeout: 15000,
    });
  });

  test('landing navbar shows "My Files" linking to /dashboard', async ({
    page,
  }) => {
    await page.goto('/');
    const ctaButton = page.locator('rbth-auth-navbar a', {
      hasText: 'My Files',
    });
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toHaveAttribute('href', /\/dashboard/);
  });

  test('landing hero shows "My Files" linking to /dashboard', async ({
    page,
  }) => {
    await page.goto('/');
    const heroBtn = page.locator('app-landing-hero a', {
      hasText: 'My Files',
    });
    await expect(heroBtn).toBeVisible();
    await expect(heroBtn).toHaveAttribute('href', /\/dashboard/);
  });

  test('named outlet (dialog:create-storage) opens create dialog', async ({
    page,
  }) => {
    await page.goto('/dashboard/(dialog:create-storage)');
    // The dialog should appear
    await expect(
      page.locator('rbth-feat-storages-create-storage-dialog'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('redirectUrl with named outlet opens dialog after login redirect', async ({
    page,
  }) => {
    const redirectUrl = encodeURIComponent(
      '/dashboard/(dialog:create-storage)',
    );
    await page.goto(`/login?redirectUrl=${redirectUrl}`);
    await page.waitForURL(/\/dashboard/);
    await expect(
      page.locator('rbth-feat-storages-create-storage-dialog'),
    ).toBeVisible({ timeout: 15000 });
  });
});
