import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import App from './App.tsx';
import './index.css';

import { registerSW } from 'virtual:pwa-register';
import { purgeLegacySharedCaches } from './lib/offlinePrivacy';
import { Capacitor } from '@capacitor/core';

// Démarre le service worker en mode autoUpdate UNIQUEMENT sur le Web (désactivé sur Android natif Capacitor)
if (!Capacitor.isNativePlatform()) {
  void registerSW({
    onNeedRefresh() {
      console.log("Nouvelle version disponible !");
    },
    onOfflineReady() {
      console.log("L'application est prête à être utilisée hors ligne.");
    },
  });
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1, // 10 % des transactions (100 % coûteux et inutile en production)
    tracePropagationTargets: ["localhost", /^https:\/\/.*\.supabase\.co/],
    replaysSessionSampleRate: 0, // pas de relecture de sessions normales (données financières et d'identité)
    replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  });
}

async function startApp() {
  await purgeLegacySharedCaches();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void startApp();
