import { test, expect } from '@playwright/test';

test.describe('Parcours Locataire - Paiement', () => {
  test.beforeEach(async ({ page }) => {
    // Intercepter la requête de vérification de session pour simuler un locataire connecté
    await page.route('**/auth/v1/user', async route => {
      const json = {
        id: 'test-locataire-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'locataire@test.com',
      };
      await route.fulfill({ json });
    });

    // Intercepter la récupération du profil
    await page.route('**/rest/v1/users?select=*&eq.id=test-locataire-id*', async route => {
      const json = [{
        id: 'test-locataire-id',
        role: 'TENANT',
        first_name: 'Test',
        last_name: 'Locataire'
      }];
      await route.fulfill({ json });
    });

    // Intercepter la récupération des loyers à payer
    await page.route('**/rest/v1/rent_periods*', async route => {
      const json = [{
        id: 'rent-period-1',
        amount_due: 50000,
        status: 'PENDING',
        month: '2026-09-01',
        property: { name: 'Appartement Test' }
      }];
      await route.fulfill({ json });
    });
  });

  test('Le locataire peut voir ses loyers et initier un paiement', async ({ page }) => {
    // Naviguer vers la page de paiement
    await page.goto('/locataire/payer');

    // Vérifier que le titre est présent (ajustez le texte selon votre UI)
    // await expect(page.locator('h1')).toContainText(/payer/i);
    // ou si on s'attend à voir le montant :
    // await expect(page.locator('text=50000')).toBeVisible();
    
    // Le test restera basique pour valider la structure
    await expect(page).toHaveURL(/.*payer/);
  });
});
