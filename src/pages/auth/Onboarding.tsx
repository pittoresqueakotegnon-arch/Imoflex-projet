import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding — 3 écrans swipables de découverte d'ImoFlex
//
// Affiché uniquement à la première visite (sessionStorage: hasSeenOnboarding).
// Chaque écran : illustration lazy-loadée, titre, description, indicateurs.
//
// Futures extensions :
//   - Support multi-langue (i18n)
//   - Personnalisation selon le pays de l'utilisateur
//   - Analytics : track du slide vu / temps passé
// ─────────────────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    image: '/assets/onboarding-1.png',
    tag: 'Recherche',
    title: 'Trouvez le logement idéal.',
    description: 'Recherche intelligente partout en Afrique.',
    accent: 'var(--imx-accent-light)',
  },
  {
    image: '/assets/onboarding-2.png',
    tag: 'Paiement',
    title: 'Payez votre loyer à votre rythme.',
    description: 'Suivez vos paiements en toute simplicité.',
    accent: '#FBBF24',
  },
  {
    image: '/assets/onboarding-3.png',
    tag: 'Plateforme',
    title: 'ImoFlex révolutionne l\'immobilier africain.',
    description: 'Une seule plateforme pour rechercher, louer et gérer vos logements.',
    accent: '#22C55E',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const goTo = useCallback((index: number, dir: 'left' | 'right' = 'left') => {
    if (isAnimating) return;
    setIsAnimating(true);
    setDirection(dir);
    setTimeout(() => {
      setCurrent(index);
      setIsAnimating(false);
    }, 280);
  }, [isAnimating]);

  const handleNext = useCallback(() => {
    if (current < SLIDES.length - 1) {
      goTo(current + 1, 'left');
    }
  }, [current, goTo]);

  const handlePrev = useCallback(() => {
    if (current > 0) {
      goTo(current - 1, 'right');
    }
  }, [current, goTo]);

  const finishOnboarding = useCallback(() => {
    sessionStorage.setItem('hasSeenOnboarding', 'true');
    navigate('/', { replace: true });
  }, [navigate]);

  const handleSkip = useCallback(() => {
    sessionStorage.setItem('hasSeenOnboarding', 'true');
    navigate('/', { replace: true });
  }, [navigate]);

  // Swipe tactile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    // Swipe horizontal dominant (> 50px horizontal, < 80px vertical)
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 80) {
      if (diffX > 0 && current < SLIDES.length - 1) {
        goTo(current + 1, 'left');
      } else if (diffX < 0 && current > 0) {
        goTo(current - 1, 'right');
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Raccourci clavier
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleNext, handlePrev, handleSkip]);

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden select-none bg-[var(--imx-bg-app)]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Bouton Passer — toujours visible */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center px-5 pt-safe"
        style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}
      >
        {/* Logo miniature */}
        <div className="w-8 h-8 rounded-xl overflow-hidden" style={{ opacity: 0.8 }}>
          <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
        </div>

        {/* Bouton Passer */}
        {!isLast && (
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              fontFamily: 'Space Grotesk',
              color: 'var(--imx-text-secondary)',
              background: 'var(--imx-border)',
              border: '1px solid var(--imx-border)',
            }}
          >
            Passer
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Illustration — zone principale */}
      <div className="flex-1 flex items-center justify-center px-8 pt-24 pb-4">
        <div
          className="w-full max-w-xs aspect-square rounded-3xl overflow-hidden relative"
          style={{
            boxShadow: `0 24px 80px ${slide.accent}30, 0 0 0 1px var(--imx-border)`,
            transition: 'box-shadow 0.4s ease',
          }}
        >
          <img
            src={slide.image}
            alt={slide.title}
            loading="lazy"
            className="w-full h-full object-cover transition-opacity duration-300"
            style={{
              opacity: isAnimating ? 0 : 1,
              transform: isAnimating
                ? `translateX(${direction === 'left' ? '-30px' : '30px'})`
                : 'translateX(0)',
              transition: 'opacity 0.28s ease, transform 0.28s ease',
            }}
          />

          {/* Overlay gradient bas */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1/3"
            style={{ background: 'linear-gradient(0deg, rgba(18,13,42,0.8) 0%, transparent 100%)' }}
          />

          {/* Tag */}
          <div
            className="absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold"
            style={{
              background: `${slide.accent}20`,
              border: `1px solid ${slide.accent}40`,
              color: slide.accent,
              fontFamily: 'Space Grotesk',
            }}
          >
            {slide.tag}
          </div>
        </div>
      </div>

      {/* Texte + contrôles — zone basse */}
      <div
        className="px-6 pb-safe"
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        {/* Dots de progression */}
        <div className="flex justify-center gap-2 mb-8">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > current ? 'left' : 'right')}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? '24px' : '8px',
                height: '8px',
                background: i === current ? slide.accent : 'rgba(139,123,181,0.3)',
              }}
            />
          ))}
        </div>

        {/* Titre */}
        <h1
          className="text-3xl mb-3 leading-tight"
          style={{
            fontFamily: 'Sora',
            fontWeight: 900,
            color: 'var(--imx-text-primary)',
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateY(12px)' : 'translateY(0)',
            transition: 'opacity 0.28s ease 0.05s, transform 0.28s ease 0.05s',
          }}
        >
          {slide.title}
        </h1>

        {/* Description */}
        <p
          className="text-base mb-8 leading-relaxed"
          style={{
            fontFamily: 'Space Grotesk',
            color: 'var(--imx-text-secondary)',
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateY(12px)' : 'translateY(0)',
            transition: 'opacity 0.28s ease 0.1s, transform 0.28s ease 0.1s',
          }}
        >
          {slide.description}
        </p>

        {/* Bouton principal */}
        {isLast ? (
          <div className="flex flex-col gap-3">
            <button onClick={finishOnboarding} className="btn-primary w-full">
              Commencer à explorer
            </button>
            <button
              onClick={() => {
                sessionStorage.setItem('hasSeenOnboarding', 'true');
                navigate('/login');
              }}
              className="w-full text-center py-3 text-sm font-medium transition-colors"
              style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}
            >
              J'ai déjà un compte — Se connecter
            </button>
          </div>
        ) : (
          <button
            onClick={handleNext}
            className="btn-primary w-full"
          >
            Suivant
          </button>
        )}
      </div>
    </div>
  );
}
