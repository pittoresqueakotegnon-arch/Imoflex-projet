import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

const outputDirectory = path.resolve('play-store-screenshots');

test.use({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
});

async function capture(page: Page, name: string) {
  await fs.mkdir(outputDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(outputDirectory, `${name}.png`),
  });
}

test.describe.serial('Captures Play Store', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('imoflex_onboarding_done', 'true'));
  });

  test('produit cinq écrans publics en format mobile', async ({ page }) => {
    test.setTimeout(180_000);
        await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/ImoFlex/i);
    await capture(page, '01-marketplace');

        await page.goto('/annonce/5842d144-8334-42d2-bd52-ab17bffbd18b', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Maison premium/ })).toBeVisible();
    await capture(page, '02-detail-annonce');

        await page.goto('/filtres', { waitUntil: 'domcontentloaded' });
    await capture(page, '03-filtres');

        await page.goto('/aide', { waitUntil: 'domcontentloaded' });
    await capture(page, '04-aide');

        await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await capture(page, '05-inscription');
  });
});
