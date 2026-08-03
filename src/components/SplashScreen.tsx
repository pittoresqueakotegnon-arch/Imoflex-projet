import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // 2 secondes d'affichage fixe, puis 0.5s de fade out = ~2.5s total
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 2000);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 transition-opacity duration-500"
      style={{ 
        background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 45%, #120D2A 100%)',
        opacity: isFading ? 0 : 1,
        pointerEvents: isFading ? 'none' : 'auto',
      }}
    >
      <style>{`
        @keyframes splashLogoPulse {
          0% { transform: scale(0.9); opacity: 0; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes splashTextFade {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Grand Logo Animé */}
      <div
        className="w-40 h-40 rounded-full flex items-center justify-center mb-8 overflow-hidden"
        style={{
          boxShadow: '0 12px 48px rgba(123, 63, 228, 0.4), 0 0 0 1px rgba(123,63,228,0.2)',
          animation: 'splashLogoPulse 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        <img
          src="/assets/logo-icon-transparent-recadre.png"
          alt="ImoFlex Logo"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Slogan élégant */}
      <h1
        className="text-4xl mb-4"
        style={{
          fontFamily: 'Nunito',
          fontWeight: 900,
          opacity: 0,
          animation: 'splashTextFade 0.6s ease-out 0.5s forwards',
        }}
      >
        <span style={{ color: '#E8E0FF' }}>Imo</span>
        <span style={{ color: '#A855F7' }}>Flex</span>
      </h1>

      <p
        className="text-sm tracking-[0.15em] uppercase px-8 text-center"
        style={{
          color: '#8B7BB5',
          fontFamily: 'Space Grotesk',
          opacity: 0,
          animation: 'splashTextFade 0.6s ease-out 0.7s forwards',
        }}
      >
        Trouvez. Louez. Payez à votre rythme.
      </p>

      {/* Indicateur de chargement stylisé */}
      <div
        className="absolute bottom-16 flex gap-2 items-center"
        style={{ opacity: 0, animation: 'splashTextFade 0.6s ease-out 0.9s forwards' }}
      >
        <div className="w-8 h-1.5 rounded-full relative overflow-hidden" style={{ background: 'rgba(139,123,181,0.2)' }}>
          <div className="absolute top-0 left-0 h-full w-full rounded-full animate-pulse" style={{ background: '#A855F7' }} />
        </div>
      </div>
    </div>
  );
};
