import { test, expect } from '@playwright/test';

test.describe('Vérification des routes web et SPA navigation', () => {
  test('La page d’accueil web /web se charge correctement avec son titre et éléments', async ({ page }) => {
    await page.goto('/web');
    await expect(page).toHaveTitle(/ImoFlex/i);
    // Vérifier la présence du heading principal
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('La route profonde /web/annonces se charge directement au rechargement (SPA deep link)', async ({ page }) => {
    await page.goto('/web/annonces');
    await expect(page).toHaveTitle(/ImoFlex/i);
    // Vérifier la présence du mot Filtres sur la page
    await expect(page.getByText('Filtres').first()).toBeVisible();
  });

  test('La page de réinitialisation de mot de passe /reset-password ne crash pas en accès direct', async ({ page }) => {
    await page.goto('/reset-password');
    // Doit afficher l'état "Lien invalide ou expiré" quand ouvert sans jeton
    await expect(page.getByText(/Lien invalide ou expiré/i)).toBeVisible();
  });
});
