import React, { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';
import { haptics } from '../lib/haptics';

export const AppRatingModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkLaunches = () => {
      const hasRated = localStorage.getItem('imx_has_rated');
      if (hasRated === 'true') return;

      const launches = parseInt(localStorage.getItem('imx_launch_count') || '0', 10);
      const newLaunches = launches + 1;
      localStorage.setItem('imx_launch_count', newLaunches.toString());

      // Afficher à la 3ème ouverture, puis toutes les 15 ouvertures si ignoré
      if (newLaunches === 3 || (newLaunches > 3 && newLaunches % 15 === 0)) {
        // Petit délai pour ne pas agresser l'utilisateur dès le chargement
        setTimeout(() => {
          setIsOpen(true);
        }, 5000);
      }
    };

    checkLaunches();
  }, []);

  const handleRate = () => {
    haptics.light();
    localStorage.setItem('imx_has_rated', 'true');
    setIsOpen(false);
    // TODO: Mettre le vrai lien du Play Store
    window.open('https://play.google.com/store/apps/details?id=com.imoflex.app', '_blank');
  };

  const handleDismiss = () => {
    haptics.light();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-[var(--imx-surface)] w-full max-w-sm rounded-[24px] p-6 shadow-2xl relative animate-slide-up">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 text-[var(--imx-text-secondary)] hover:bg-[var(--imx-surface-2)] rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center mt-2">
          <div className="flex justify-center gap-1 mb-4 text-amber-400">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} size={28} className="fill-amber-400 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
          
          <h2 className="font-nunito font-800 text-xl text-[var(--imx-text-primary)] mb-2">
            Vous aimez ImoFlex ?
          </h2>
          <p className="text-sm text-[var(--imx-text-secondary)] mb-6">
            Soutenez-nous en laissant 5 étoiles sur le Play Store ! Cela nous aide énormément à améliorer l'application.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleRate}
              className="btn-primary w-full shadow-lg shadow-violet-500/25"
            >
              Noter l'application
            </button>
            <button
              onClick={handleDismiss}
              className="font-medium text-sm text-[var(--imx-text-secondary)] py-2"
            >
              Peut-être plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
