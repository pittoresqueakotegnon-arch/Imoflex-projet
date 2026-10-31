import { test, expect } from '@playwright/test';

test.describe('Vérification des routes web et séparation web / mobile', () => {
  test.beforeEach(async () => {
    test.setTimeout(120000);
  });

  test('Page d’accueil / (PublicLayout) se charge correctement', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ImoFlex/i);
    await expect(page.getByText('Comment ça marche').first()).toBeVisible({ timeout: 20000 });
  });

  test('Page des annonces /annonces et /web/annonces se chargent avec la grille et filtres', async ({ page }) => {
    await page.goto('/annonces');
    await expect(page).toHaveTitle(/ImoFlex/i);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder('Rechercher…')).toBeVisible({ timeout: 20000 });

    await page.goto('/web/annonces');
    await expect(page).toHaveTitle(/ImoFlex/i);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder('Rechercher…')).toBeVisible({ timeout: 20000 });
  });

  test('Page de connexion web /web/login et inscription /web/register', async ({ page }) => {
    await page.goto('/web/login');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder('votre@email.com')).toBeVisible({ timeout: 20000 });

    await page.goto('/web/register');
    await expect(page.getByRole('heading', { name: /Comment souhaitez-vous utiliser ImoFlex/i })).toBeVisible({ timeout: 20000 });
  });

  test('Pages légales et informatives /web/cgu, /web/politique-confidentialite, /web/aide, /web/contact', async ({ page }) => {
    await page.goto('/web/cgu');
    await expect(page.getByText(/Conditions Générales d'Utilisation/i).first()).toBeVisible({ timeout: 20000 });

    await page.goto('/web/politique-confidentialite');
    await expect(page.getByText(/Politique de Confidentialité/i).first()).toBeVisible({ timeout: 20000 });

    await page.goto('/web/aide');
    await expect(page.getByText(/Centre d'aide/i).first()).toBeVisible({ timeout: 20000 });

    await page.goto('/web/contact');
    await expect(page.getByText(/Contactez ImoFlex/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('Page 404 dédiée affiche un message clair sans redirection aveugle', async ({ page }) => {
    await page.goto('/web/route-totalement-inexistante-404');
    await expect(page.getByText(/Page introuvable/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: /Retour à l'accueil/i })).toBeVisible({ timeout: 20000 });
  });

  test('Rechargement direct (F5 / deep link) sur route SPA', async ({ page }) => {
    await page.goto('/web/aide');
    await page.reload();
    await expect(page.getByText(/Centre d'aide/i).first()).toBeVisible({ timeout: 20000 });
  });
});
