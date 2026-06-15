import { expect, test } from '@playwright/test';

test.describe('Unauthenticated routing', () => {
  test('/ shows landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-landing-hero h1')).toBeVisible();
    await expect(page.locator('app-landing-hero h1')).toContainText(
      'Rabbithole',
    );
  });

  test('/dashboard redirects to /login?redirectUrl=/dashboard', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login\?redirectUrl=/);
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('redirectUrl=%2Fdashboard');
  });

  test('/dashboard/:id/drive redirects to /login?redirectUrl=...', async ({
    page,
  }) => {
    const fakeId = 'aaaaa-aa';
    await page.goto(`/dashboard/${fakeId}/drive`);
    await page.waitForURL(/\/login\?redirectUrl=/);
    expect(page.url()).toContain('/login');
    expect(page.url()).toContain('redirectUrl=');
  });

  test('/login shows sign-in button', async ({ page }) => {
    await page.goto('/login');
    const signInButton = page.locator('button', {
      hasText: 'Sign in with Internet Identity',
    });
    await expect(signInButton).toBeVisible();
  });

  test('/login hides navbar CTA', async ({ page }) => {
    await page.goto('/login');
    const ctaButton = page.locator('rbth-auth-navbar a', {
      hasText: /Open App|My Files/,
    });
    await expect(ctaButton).toHaveCount(0);
  });

  test('landing navbar shows "Open App" linking to /login', async ({
    page,
  }) => {
    await page.goto('/');
    const ctaButton = page.locator('rbth-auth-navbar a', {
      hasText: 'Open App',
    });
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toHaveAttribute('href', /\/login/);
  });

  test('landing CTA shows "Create Vault" linking to /login', async ({
    page,
  }) => {
    await page.goto('/');
    const ctaButton = page.locator('app-landing-cta a', {
      hasText: 'Create Vault',
    });
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toHaveAttribute('href', /\/login/);
  });

  test('/nonexistent redirects to /login', async ({ page }) => {
    await page.goto('/some-random-page');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
  });
});
