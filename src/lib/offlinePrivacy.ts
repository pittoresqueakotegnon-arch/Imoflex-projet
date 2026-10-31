import { initOfflineDB, purgeUserOfflineData } from './offlineStorage';
import { purgeUserSyncActions } from './offlineSyncManager';

const PRIVATE_DRAFT_PREFIXES = [
  'imx_contract_draft_',
  'imx_inspection_draft_',
  'imoflex_listing_draft_',
];

/** Remove les caches privés de l'utilisateur et l'ancien cache REST partagé. */
export async function purgePrivateOfflineData(userId?: string | null): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (userId) {
      await Promise.allSettled([
        purgeUserOfflineData(userId),
        purgeUserSyncActions(userId),
      ]);
    }

    localStorage.removeItem('favorites');
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && PRIVATE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }

    if ('caches' in window) {
      await caches.delete('imoflex-api-data');
    }
  } catch (error) {
    console.warn('Purge des données hors ligne incomplète:', error);
  }
}

/** Supprime une seule fois à l'ouverture les entrées REST et fiches non cloisonnées historiques. */
export async function purgeLegacySharedCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const cleanup: Promise<unknown>[] = [];
    if ('caches' in window) cleanup.push(caches.delete('imoflex-api-data'));

    // L'ancienne version stockait les détails par ID seul; ces entrées ne
    // permettent pas de déterminer à quel compte elles appartiennent.
    const db = await initOfflineDB();
    if (db) {
      const tx = db.transaction('listing_details_cache', 'readwrite');
      const keys = await tx.store.getAllKeys();
      await Promise.all(keys.filter((key) => typeof key === 'string' && !key.includes(':'))
        .map((key) => tx.store.delete(key)));
      cleanup.push(tx.done);
    }
    await Promise.allSettled(cleanup);
  } catch (error) {
    console.warn('Purge de l’ancien cache API impossible:', error);
  }
}
