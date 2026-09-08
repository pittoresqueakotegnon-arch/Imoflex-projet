import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { toast } from 'sonner';

/**
 * Hook global d'interception du bouton retour matériel Android (Hardware Back Button).
 * Permet un comportement 100% natif :
 * - Recule d'une page si dans un sous-écran
 * - Demande une confirmation (double tap) avant de quitter si sur l'écran racine
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressRef = useRef<number>(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const ROOT_ROUTES = ['/', '/dashboard', '/pro/dashboard', '/admin', '/onboarding', '/splash'];

    const handleBackButton = CapApp.addListener('backButton', ({ canGoBack }) => {
      // 1. Essayer de fermer une modale active d'abord
      const event = new CustomEvent('imx:android-back');
      document.dispatchEvent(event);
      
      // Si l'événement a été preventDefault() par une modale qui s'est fermée, on s'arrête là
      if (event.defaultPrevented) {
        return;
      }

      const isRoot = ROOT_ROUTES.includes(location.pathname);

      if (!isRoot && canGoBack) {
        navigate(-1);
      } else {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          CapApp.exitApp();
        } else {
          lastBackPressRef.current = now;
          toast.info('Appuyez à nouveau pour quitter ImoFlex', {
            duration: 2000,
            id: 'android-exit-toast',
          });
        }
      }
    });

    return () => {
      handleBackButton.then(listener => listener.remove());
    };
  }, [location.pathname, navigate]);
}
