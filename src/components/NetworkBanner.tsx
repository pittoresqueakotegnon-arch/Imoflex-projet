import React, { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { WifiOff, Wifi } from 'lucide-react';

export const NetworkBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    // Initial check
    Network.getStatus().then(status => {
      setIsOffline(!status.connected);
    });

    // Listeners
    const handler = Network.addListener('networkStatusChange', status => {
      if (!status.connected) {
        setIsOffline(true);
        setJustReconnected(false);
      } else {
        setIsOffline(false);
        setJustReconnected(true);
        // Hide the "reconnected" green banner after 3 seconds
        setTimeout(() => {
          setJustReconnected(false);
        }, 3000);
      }
    });

    return () => {
      handler.then(h => h.remove());
    };
  }, []);

  if (!isOffline && !justReconnected) return null;

  return (
    <div className={`w-full py-1.5 px-4 flex items-center justify-center gap-2 text-xs font-semibold text-white transition-all duration-300 animate-slide-down ${isOffline ? 'bg-red-500' : 'bg-emerald-500'}`}>
      {isOffline ? (
        <>
          <WifiOff size={14} />
          <span>Connexion réseau perdue. Mode hors-ligne actif.</span>
        </>
      ) : (
        <>
          <Wifi size={14} />
          <span>Connexion rétablie !</span>
        </>
      )}
    </div>
  );
};
