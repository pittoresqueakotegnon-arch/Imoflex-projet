import { lazy, ComponentType } from 'react';

/**
 * lazyWithRetry
 * En cas d'erreur de chargement dynamique d'un module (chunk Vite / réseau / HMR désynchronisé),
 * recharge automatiquement la page une fois pour vider le cache de rejet du navigateur.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      console.warn('[lazyWithRetry] Dynamic import failed:', err);

      const isDynamicImportError =
        err?.message?.includes('dynamically imported module') ||
        err?.message?.includes('Failed to fetch') ||
        err?.name === 'ChunkLoadError';

      if (isDynamicImportError) {
        const retryKey = `imx_chunk_retry_${window.location.pathname}`;
        const hasRetried = sessionStorage.getItem(retryKey);

        if (!hasRetried) {
          sessionStorage.setItem(retryKey, 'true');
          // Forcer un rechargement propre
          window.location.reload();
          return { default: (() => null) as unknown as T };
        }
        sessionStorage.removeItem(retryKey);
      }

      throw err;
    }
  });
}
