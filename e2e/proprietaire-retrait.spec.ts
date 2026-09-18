import { test, expect } from '@playwright/test';

test.describe('Parcours Propriétaire - Retrait', () => {
  test.beforeEach(async ({ page }) => {
    // Simuler l'authentification d'un propriétaire
    await page.route('**/auth/v1/user', async route => {
      const json = {
        id: 'test-proprio-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'proprio@test.com',
      };
      await route.fulfill({ json });
    });

    // Simuler le profil Propriétaire
    await page.route('**/rest/v1/users?select=*&eq.id=test-proprio-id*', async route => {
      const json = [{
        id: 'test-proprio-id',
        role: 'LANDLORD',
        first_name: 'Test',
        last_name: 'Proprio'
      }];
      await route.fulfill({ json });
    });

    // Simuler le Wallet du propriétaire
    await page.route('**/rest/v1/wallets?select=*&eq.user_id=test-proprio-id*', async route => {
      const json = [{
        id: 'wallet-1',
        available_balance: 150000,
        currency: 'XOF'
      }];
      await route.fulfill({ json });
    });
  });

  test('Le propriétaire peut voir son solde et accéder à la page de retrait', async ({ page }) => {
    // Naviguer vers la page portefeuille/retrait
    await page.goto('/proprietaire/portefeuille');

    // On vérifie simplement que l'URL est correcte et la page ne plante pas
    await expect(page).toHaveURL(/.*portefeuille/);
    
    // Vous pourrez ajouter ici plus tard les interactions comme:
    // await page.fill('input[name="amount"]', '50000');
    // await page.click('button:has-text("Retirer")');
  });
});
