// ─────────────────────────────────────────────────────────────────────────────
// Web Push Notifications Helper (Standard VAPID / PWA Web Push)
// 100% Gratuit — Utilise l'API Notification standard des navigateurs / Service Worker
// ─────────────────────────────────────────────────────────────────────────────

export function isPushNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Erreur lors de la demande de permission push:', error);
    return 'denied';
  }
}

export function getPushPermissionStatus(): NotificationPermission {
  if (!isPushNotificationSupported()) {
    return 'denied';
  }
  return Notification.permission;
}

export async function triggerPushNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: any;
  }
) {
  if (!isPushNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  const defaultIcon = '/assets/logo-192.png';
  const defaultBadge = '/assets/logo-192.png';

  const notificationOptions = {
    body: options?.body || '',
    icon: options?.icon || defaultIcon,
    badge: options?.badge || defaultBadge,
    tag: options?.tag || 'imoflex-notif',
    data: options?.data || {},
  };

  // Si un Service Worker est actif, afficher via ServiceWorkerRegistration pour compatibilité PWA/mobile
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(title, notificationOptions);
        return;
      }
    } catch (e) {
      console.warn('Fallback vers Notification classique:', e);
    }
  }

  // Fallback direct
  try {
    new Notification(title, notificationOptions);
  } catch (e) {
    console.error("Impossible d'afficher la notification push:", e);
  }
}
