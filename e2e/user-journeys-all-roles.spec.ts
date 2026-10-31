import { test, expect } from '@playwright/test';

function buildAuthSession(userId: string, email: string) {
  return JSON.stringify({
    access_token: 'fake-jwt-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-token',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      user_metadata: {},
      app_metadata: { provider: 'email' },
      created_at: new Date().toISOString(),
    },
  });
}

test.describe('Parcours Complets Utilisateurs & Isolation des Rôles', () => {

  // ─────────────────────────────────────────────────────────────
  // 1. PARCOURS VISITEUR (non connecté)
  // ─────────────────────────────────────────────────────────────
  test('Visiteur : exploration marketplace mobile et filtres sans authentification', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/marketplace');
    await expect(page).toHaveURL(/.*marketplace/);

    await page.goto('/filtres');
    await expect(page).toHaveURL(/.*filtres/);

    await page.goto('/aide');
    await expect(page).toHaveURL(/.*aide/);

    await page.goto('/cgu');
    await expect(page).toHaveURL(/.*cgu/);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. PARCOURS LOCATAIRE (connecté rôle locataire)
  // ─────────────────────────────────────────────────────────────
  test('Locataire : accès au dashboard et parcours locataire', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript((session) => {
      localStorage.setItem('sb-jogvvjiuumrswwamanqk-auth-token', session);
    }, buildAuthSession('tenant-uuid-1', 'locataire@imoflex.bj'));

    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({ json: { id: 'tenant-uuid-1', email: 'locataire@imoflex.bj', role: 'authenticated' } });
    });
    await page.route('**/rest/v1/users*', async route => {
      await route.fulfill({ json: { id: 'tenant-uuid-1', role: 'locataire', full_name: 'Amadou Diallo' } });
    });
    await page.route('**/rest/v1/leases*', async route => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/rest/v1/rent_periods*', async route => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/rest/v1/notifications*', async route => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/rest/v1/support_conversations*', async route => {
      await route.fulfill({ json: [] });
    });

    // 1. Dashboard locataire
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Page rejoindre logement
    await page.goto('/rejoindre');
    await expect(page).toHaveURL(/.*rejoindre/);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. PARCOURS PROPRIÉTAIRE (connecté rôle propriétaire)
  // ─────────────────────────────────────────────────────────────
  test('Propriétaire : accès au tableau de bord pro, wallet, et publication', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript((session) => {
      localStorage.setItem('sb-jogvvjiuumrswwamanqk-auth-token', session);
    }, buildAuthSession('owner-uuid-1', 'proprietaire@imoflex.bj'));

    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({ json: { id: 'owner-uuid-1', email: 'proprietaire@imoflex.bj', role: 'authenticated' } });
    });
    await page.route('**/rest/v1/users*', async route => {
      await route.fulfill({ json: { id: 'owner-uuid-1', role: 'proprietaire', full_name: 'Koffi Mensah' } });
    });
    await page.route('**/rest/v1/wallets*', async route => {
      await route.fulfill({ json: { id: 'w-1', owner_id: 'owner-uuid-1', available_balance: 250000, total_earned: 500000 } });
    });
    await page.route('**/rest/v1/properties*', async route => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/rest/v1/notifications*', async route => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/rest/v1/support_conversations*', async route => {
      await route.fulfill({ json: [] });
    });

    // 1. Dashboard pro
    await page.goto('/pro/dashboard');
    await expect(page).toHaveURL(/.*pro\/dashboard/);

    // 2. Publication d'annonce
    await page.goto('/pro/publier');
    await expect(page).toHaveURL(/.*pro\/publier/);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. PARCOURS AGENCE (connecté rôle agence)
  // ─────────────────────────────────────────────────────────────
  test('Agence : tableau de bord et gestion des mandats', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript((session) => {
      localStorage.setItem('sb-jogvvjiuumrswwamanqk-auth-token', session);
    }, buildAuthSession('agency-uuid-1', 'contact@agence-benin.com'));

    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({ json: { id: 'agency-uuid-1', email: 'contact@agence-benin.com', role: 'authenticated' } });
    });
    await page.route('**/rest/v1/users*', async route => {
      await route.fulfill({ json: { id: 'agency-uuid-1', role: 'agence', full_name: 'Agence Immobilière du Golfe' } });
    });
    await page.route('**/rest/v1/agences_profiles*', async route => {
      await route.fulfill({ json: { id: 'agency-uuid-1', nom_agence: 'Agence Immobilière du Golfe', is_verified: true } });
    });
    await page.route('**/rest/v1/agence_mandats*', async route => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/rest/v1/notifications*', async route => {
      await route.fulfill({ json: [] });
    });

    // Accès dashboard agence web
    await page.goto('/web/agence/dashboard');
    await expect(page).toHaveURL(/.*web\/agence\/dashboard/);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. PARCOURS ADMINISTRATEUR & CONTRÔLE D'ACCÈS
  // ─────────────────────────────────────────────────────────────
  test('Admin : contrôle d accès strict et rejet des non-administrateurs', async ({ page }) => {
    test.setTimeout(60000);
    // 1. Tenter d'accéder à /admin sans être connecté
    await page.goto('/admin');
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('/admin/dashboard');

    // 2. Tenter d'accéder à /admin avec un profil locataire
    await page.addInitScript((session) => {
      localStorage.setItem('sb-jogvvjiuumrswwamanqk-auth-token', session);
    }, buildAuthSession('tenant-uuid-1', 'locataire@imoflex.bj'));

    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({ json: { id: 'tenant-uuid-1', email: 'locataire@imoflex.bj', role: 'authenticated' } });
    });
    await page.route('**/rest/v1/users*', async route => {
      await route.fulfill({ json: { id: 'tenant-uuid-1', role: 'locataire' } });
    });

    await page.goto('/admin');
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('/admin/dashboard');
  });

});
