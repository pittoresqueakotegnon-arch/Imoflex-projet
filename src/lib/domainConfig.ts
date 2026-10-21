/**
 * Configuration centralisée des domaines et URLs ImoFlex.
 * 
 * Permet de faire fonctionner l'application sur :
 * 1. Le domaine Vercel temporaire (ex: https://imoflex.vercel.app)
 * 2. Le futur domaine personnalisé (ex: https://imoflex.com ou https://imoflex.bj)
 * 3. L'application mobile Android (Capacitor)
 * 4. L'environnement de développement local (http://localhost:5173)
 * 
 * Règle d'or : AUCUN domaine ne doit être codé en dur dans les composants métier.
 */

import { Capacitor } from '@capacitor/core';

/**
 * Domaine de secours si aucune variable d'environnement n'est fournie.
 * Utilisé principalement dans l'application mobile native lorsque VITE_SITE_URL n'a pas été injecté au build.
 */
const DEFAULT_FALLBACK_SITE_URL = 'https://imoflex.vercel.app';

/**
 * Nettoie une URL en supprimant le slash final pour éviter les doubles slashes "//".
 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Retourne l'URL racine canonique du site web ImoFlex.
 * 
 * Priorité :
 * 1. Variable d'environnement VITE_SITE_URL (ex: configurée dans Vercel ou .env)
 * 2. Origine du navigateur sur le web (window.location.origin) si ce n'est pas localhost natif
 * 3. Domaine par défaut de production (DEFAULT_FALLBACK_SITE_URL)
 */
export function getSiteUrl(): string {
  // En développement local sur navigateur web (non mobile), privilégier l'origine locale (ex: http://localhost:5173)
  if (import.meta.env.DEV && typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
    return stripTrailingSlash(window.location.origin);
  }

  const envUrl = import.meta.env.VITE_SITE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return stripTrailingSlash(envUrl.trim());
  }

  // Sur le web en production dans un navigateur classique
  if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
    const origin = window.location.origin;
    if (origin && !origin.includes('capacitor://') && !origin.includes('localhost')) {
      return stripTrailingSlash(origin);
    }
  }

  // Sur application mobile native (Capacitor Android) ou fallback
  return DEFAULT_FALLBACK_SITE_URL;
}

/**
 * Construit une URL absolue partageable (ex: partage d'annonce sur WhatsApp, SMS, réseaux sociaux).
 * 
 * Garantit qu'un lien partagé depuis l'application mobile Android pointe vers le site WEB public
 * et JAMAIS vers https://localhost.
 * 
 * @param path Chemin relatif (ex: '/annonces/mon-logement' ou '/web/annonces')
 */
export function getShareUrl(path: string = ''): string {
  const siteUrl = getSiteUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}

/**
 * Retourne l'URL de redirection pour les flux Supabase Auth (réinitialisation mot de passe, confirmation).
 * 
 * Doit impérativement être déclarée dans la liste des Redirect URLs autorisées du projet Supabase.
 * 
 * @param path Chemin de callback (ex: '/reset-password')
 */
export function getAuthRedirectUrl(path: string = '/reset-password'): string {
  return getShareUrl(path);
}

/**
 * Indique si un nom de domaine personnalisé officiel a été configuré via l'environnement.
 */
export function isCustomDomainActive(): boolean {
  const siteUrl = getSiteUrl();
  return !siteUrl.includes('vercel.app') && !siteUrl.includes('localhost');
}

/**
 * Informations de configuration pour le diagnostic et le monitoring.
 */
export const DOMAIN_CONFIG = {
  get currentSiteUrl() {
    return getSiteUrl();
  },
  isNative: Capacitor.isNativePlatform(),
  isCustomDomain: isCustomDomainActive(),
};
