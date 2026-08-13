import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Précache l'app shell (JS/CSS/HTML) — comportement par défaut, inchangé.
        // Le reste ci-dessous gère le cache "runtime" au fil de la navigation.
        runtimeCaching: [
          {
            // Photos d'annonces (thumb/medium/hd) hébergées sur Supabase Storage.
            // Immuables par construction (nouveau nom de fichier à chaque nouvel
            // upload) → CacheFirst est totalement sûr, pas de risque de photo
            // périmée affichée à la place de la bonne.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*\.(webp|jpg|jpeg|png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'imoflex-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Polices Google Fonts (fichiers .woff2) — immuables, cache long.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'imoflex-google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Feuille de style Google Fonts (change rarement, mais pas figée).
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'imoflex-google-fonts-stylesheets',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Lectures API (GET uniquement). StaleWhileRevalidate : affiche le
            // cache instantanément tout en rafraîchissant en fond dès que le
            // réseau répond — plus rapide perçu que d'attendre le réseau, et
            // fonctionne aussi hors-ligne (sert le dernier cache connu).
            // Les paiements/retraits/publications (POST/PATCH) ne passent
            // jamais par cette règle : ils échouent normalement hors-ligne,
            // volontairement — pas de file d'attente sur des mouvements d'argent.
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'imoflex-api-data',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 6, // 6 heures
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        id: '/',
        start_url: '/splash',
        name: 'ImoFlex',
        short_name: 'ImoFlex',
        description: 'ImoFlex — Trouvez votre logement à Cotonou et payez votre loyer progressivement via Mobile Money.',
        theme_color: '#7B3FE4',
        background_color: '#120D2A',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/assets/logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/assets/logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/assets/logo-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});