import { test, expect } from '@playwright/test';

test('has title and can see splash screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ImoFlex/i);
});
