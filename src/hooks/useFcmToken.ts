/**
 * useFcmToken.ts
 *
 * Hook qui gère l'enregistrement du token FCM Capacitor Push Notifications.
 * À appeler une seule fois depuis App.tsx après la connexion de l'utilisateur.
 *
 * Prérequis :
 *   - @capacitor/push-notifications installé
 *   - google-services.json dans android/app/
 *   - FIREBASE_PROJECT_ID et FIREBASE_SERVICE_ACCOUNT_KEY dans les secrets Supabase
 */

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';

// Import conditionnel pour éviter les erreurs sur web/iOS où le plugin n'est pas disponible
let PushNotifications: typeof import('@capacitor/push-notifications').PushNotifications | null = null;

async function loadPushPlugin() {
  if (Capacitor.isNativePlatform()) {
    try {
      const mod = await import('@capacitor/push-notifications');
      PushNotifications = mod.PushNotifications;
    } catch {
      console.warn('useFcmToken: @capacitor/push-notifications non disponible.');
    }
  }
}

export function useFcmToken(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    let cleanup: (() => void) | undefined;

    const register = async () => {
      await loadPushPlugin();
      if (!PushNotifications) return;

      // Demander la permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.info('useFcmToken: permission push refusée.');
        return;
      }

      // Enregistrer l'appareil
      await PushNotifications.register();

      // Écouter le token FCM
      const registrationListener = await PushNotifications.addListener('registration', async (token) => {
        console.info('useFcmToken: token FCM reçu:', token.value.substring(0, 20) + '...');
        
        // Sauvegarder le token en base (upsert silencieux)
        const { error } = await supabase
          .from('users')
          .update({ fcm_token: token.value })
          .eq('id', userId);

        if (error) {
          console.error('useFcmToken: erreur sauvegarde fcm_token:', error.message);
        }
      });

      // Écouter les erreurs d'enregistrement
      const errorListener = await PushNotifications.addListener('registrationError', (err) => {
        console.error('useFcmToken: erreur enregistrement push:', err);
      });

      cleanup = () => {
        registrationListener.remove();
        errorListener.remove();
      };
    };

    register().catch(console.error);

    return () => {
      cleanup?.();
    };
  }, [userId]);
}
