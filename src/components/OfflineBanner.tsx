import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    let cancelled = false;

    // Les événements online/offline du navigateur sont peu fiables sur mobile
    // (notamment lors des bascules Wi-Fi <-> données mobiles, l'événement
    // "online" ne se déclenche pas toujours). On vérifie donc la vraie
    // connectivité avec une requête légère plutôt que de se fier uniquement
    // à navigator.onLine.
    const checkConnectivity = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setIsOffline(true);
        return;
      }
      try {
        await fetch('/manifest.webmanifest', { method: 'HEAD', cache: 'no-store' });
        if (!cancelled) setIsOffline(false);
      } catch {
        if (!cancelled) setIsOffline(true);
      }
    };

    const handleOnline = () => checkConnectivity();
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Vérification périodique de secours, car l'événement seul ne suffit pas
    // toujours à détecter le retour de connexion sur mobile.
    const interval = setInterval(checkConnectivity, 15000);
    checkConnectivity();

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-2.5 px-4"
      style={{ background: '#B45309', paddingTop: 'max(10px, env(safe-area-inset-top))' }}
    >
      <WifiOff size={14} color="#FFF7ED" />
      <span className="text-[12px] font-semibold text-[#FFF7ED]" style={{ fontFamily: 'Space Grotesk' }}>
        Hors-ligne. Navigation active via le cache. Vos actions seront synchronisées à la reconnexion.
      </span>
    </div>
  );
}
