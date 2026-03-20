import { expect, test } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect h1 to contain the app name.
  expect((await page.locator('h1').innerText()).toLowerCase()).toContain('rabbithole');
});
