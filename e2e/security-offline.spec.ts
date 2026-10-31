import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('le service worker ne met pas en cache les réponses REST Supabase', async () => {
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  expect(config).not.toContain('imoflex-api-data');
  expect(config).not.toContain('rest/v1');
});

test('le reçu PDF utilise les faits de paiement serveur et ne certifie pas les signatures image', async ({ page }) => {
  await page.route('**/rest/v1/rpc/get_payment_receipt_data', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        payment_id: '11111111-2222-4333-8444-555555555555',
        amount: 25000,
        status: 'valide',
        operator: 'mtn',
        fedapay_transaction_id: 'TX-TEST-1',
        created_at: '2026-10-29T12:00:00.000Z',
        period_month: 10,
        period_year: 2026,
        amount_due: 100000,
        amount_paid: 25000,
        remaining_due: 75000,
        property_name: 'Bien depuis le serveur',
        property_location: 'Adresse depuis le serveur',
        tenant_name: 'Locataire serveur',
        tenant_phone: null,
        owner_name: 'Propriétaire serveur',
        owner_phone: null,
        owner_verification_status: 'non_verifie',
        record_sha256: 'a'.repeat(64),
      }),
    });
  });
  await page.goto('/web/login');
  const pdfText = await page.evaluate(async () => {
    const { generateQuittancePDF } = await import('/src/lib/pdf.ts');
    const document = await generateQuittancePDF({
      id: '11111111-2222-4333-8444-555555555555',
      amount: 999999,
      date: new Date('2000-01-01'),
      periodLabel: 'Période forgée',
      propertyName: 'Bien forgé',
      tenantName: 'Locataire forgé',
      ownerName: 'Propriétaire forgé',
      operator: 'fake',
      ownerSignatureImage: 'data:image/png;base64,QUJD',
      directorSignatureImage: 'data:image/png;base64,REVG',
    });
    return document.output();
  });
  expect(pdfText).toContain('Bien depuis le serveur');
  expect(pdfText).toContain('25 000 FCFA');
  expect(pdfText).toContain('75 000 FCFA');
  expect(pdfText).not.toContain('Bien forge');
  expect(pdfText).not.toContain('999999 FCFA');
  expect(pdfText).not.toContain('quittance liberatoire definitive');
  expect(pdfText).toContain('ne contient pas de signature cryptographique des parties');
});

test('les signatures et téléchargements documentaires échouent sans RPC sécurisée', async ({ page }) => {
  let legacyOperations = 0;
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'PATCH' || route.request().url().includes('/storage/v1/object/')) {
      legacyOperations += 1;
    }
    await route.continue();
  });
  await page.route('**/rest/v1/rpc/sign_lease_contract', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'PGRST202', message: 'Could not find function sign_lease_contract' }),
  }));
  await page.route('**/rest/v1/rpc/download_signed_document_pdf', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'PGRST202', message: 'Could not find function download_signed_document_pdf' }),
  }));
  await page.goto('/web/login');

  const results = await page.evaluate(async () => {
    const documents = await import('/src/lib/leaseDocumentsService.ts');
    const sign = await documents.signLeaseContract('00000000-0000-4000-8000-000000000001', 'data:image/png;base64,QQ==')
      .then(() => 'resolved', () => 'rejected');
    const download = await documents.downloadSignedDocumentPdf('lease_contract', '00000000-0000-4000-8000-000000000001')
      .then(() => 'resolved', () => 'rejected');
    return { sign, download };
  });

  expect(results).toEqual({ sign: 'rejected', download: 'rejected' });
  expect(legacyOperations).toBe(0);
});

test('la déconnexion purge les caches et actions locales de ce compte', async ({ page }) => {
  await page.goto('/web/login');

  const result = await page.evaluate(async () => {
    const userId = 'security-audit-account';
    const storage = await import('/src/lib/offlineStorage.ts');
    const sync = await import('/src/lib/offlineSyncManager.ts');
    const privacy = await import('/src/lib/offlinePrivacy.ts');

    await storage.setCachedFavorites(userId, [{ id: 'private-listing' } as never]);
    await storage.setCachedUserData(userId, { id: userId } as never, [{ id: 'private-lease' } as never]);
    await storage.setCachedListingDetail(`${userId}:private-listing`, { id: 'private-listing' } as never);
    const otherAccountListing = await storage.getCachedListingDetail('different-account:private-listing');
    await sync.queueSyncAction('SEND_CONTACT_REQUEST', {
      listing_id: 'private-listing', requester_id: userId, message: 'private message', contact_phone: '0000000000',
    });
    localStorage.setItem('favorites', JSON.stringify(['private-listing']));
    localStorage.setItem('imx_contract_draft_private-lease', JSON.stringify({ specialClauses: 'private' }));
    await caches.open('imoflex-api-data').then((cache) => cache.put(
      'https://audit-project.supabase.co/rest/v1/users?id=eq.private-user',
      new Response('private profile')
    ));

    await privacy.purgePrivateOfflineData(userId);

    return {
      favorites: await storage.getCachedFavorites(userId),
      userData: await storage.getCachedUserData(userId),
      listing: await storage.getCachedListingDetail(`${userId}:private-listing`),
      syncActions: await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('imoflex-sync-db', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const getAll = db.transaction('sync_queue', 'readonly').objectStore('sync_queue').getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            const actions = getAll.result as Array<{ payload?: Record<string, unknown> }>;
            db.close();
            resolve(actions.filter((action) => action.payload?.requester_id === userId).length);
          };
        };
      }),
      otherAccountListing,
      apiCache: await caches.has('imoflex-api-data'),
      localFavorites: localStorage.getItem('favorites'),
      privateDraft: localStorage.getItem('imx_contract_draft_private-lease'),
    };
  });

  expect(result).toEqual({
    favorites: null,
    userData: null,
    listing: null,
    otherAccountListing: null,
    syncActions: 0,
    apiCache: false,
    localFavorites: null,
    privateDraft: null,
  });
});
