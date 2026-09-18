import { test, expect } from '@playwright/test';

test.describe('Parcours Locataire', () => {
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
          id: 'test-locataire-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'locataire@test.com',
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
          id: 'test-locataire-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'locataire@test.com',
        },
      });
    });

    // Profil locataire
    await page.route('**/rest/v1/users*', async route => {
      await route.fulfill({
        json: {
          id: 'test-locataire-id',
          phone: '+22997000001',
          role: 'locataire',
        },
      });
    });

    // Requêtes annexes
    await page.route('**/rest/v1/leases*', async route => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/rest/v1/rent_periods*', async route => {
      await route.fulfill({ json: [] });
    });
  });

  test('Le locataire connecté accède à son tableau de bord', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*dashboard/);
  });
});
