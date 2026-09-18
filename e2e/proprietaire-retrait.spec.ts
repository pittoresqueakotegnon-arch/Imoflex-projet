import { test, expect } from '@playwright/test';

test.describe('Parcours Propriétaire', () => {
  test.beforeEach(async ({ page }) => {
    // Injecter la session Supabase auth
    await page.addInitScript(() => {
      const authSession = {
        access_token: 'fake-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: {
          id: 'test-proprio-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'proprio@test.com',
          user_metadata: {},
          app_metadata: { provider: 'email' },
          created_at: new Date().toISOString(),
        },
      };
      localStorage.setItem('sb-jogvvjiuumrswwamanqk-auth-token', JSON.stringify(authSession));
    });

    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        json: {
          id: 'test-proprio-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'proprio@test.com',
        },
      });
    });

    // Profil propriétaire
    await page.route('**/rest/v1/users*', async route => {
      await route.fulfill({
        json: {
          id: 'test-proprio-id',
          phone: '+22997000002',
          role: 'proprietaire',
        },
      });
    });

    // Wallet et propriétés
    await page.route('**/rest/v1/wallets*', async route => {
      await route.fulfill({
        json: {
          id: 'wallet-1',
          balance: 150000,
          pending_balance: 0,
        },
      });
    });

    await page.route('**/rest/v1/properties*', async route => {
      await route.fulfill({ json: [] });
    });
  });

  test('Le propriétaire connecté accède à son tableau de bord', async ({ page }) => {
    await page.goto('/pro/dashboard');
    await expect(page).toHaveURL(/.*pro\/dashboard/);
  });
});
