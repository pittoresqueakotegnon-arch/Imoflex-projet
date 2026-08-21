import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

const SLIDES = [
  {
    title: "Trouvez votre logement idéal",
    desc: "Des annonces vérifiées, proches de vous",
    image: "/assets/onboarding/slide1.jpg",
  },
  {
    title: "Payez votre loyer en toute sécurité",
    desc: "Mobile Money, transactions traçables",
    image: "/assets/onboarding/slide2.jpg",
  },
  {
    title: "Propriétaire ? Gérez tout depuis l'app",
    desc: "Suivi des paiements et locataires en un coup d'œil",
    image: "/assets/onboarding/slide3.jpg",
  },
];

export const OnboardingSlides: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    // Vérifier si l'utilisateur a déjà vu l'onboarding
    const hasSeenOnboarding = localStorage.getItem('imoflex_onboarding_done');
    if (!hasSeenOnboarding) {
      setIsVisible(true);
    }
  }, []);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem('imoflex_onboarding_done', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-[var(--imx-bg-app)] flex flex-col transition-opacity duration-300">
      {/* Bouton passer */}
      <button
        onClick={handleComplete}
        className="absolute top-6 right-6 z-10 text-[13px] font-bold text-[var(--imx-text-secondary)] tracking-wide uppercase px-4 py-2"
        style={{ fontFamily: 'Space Grotesk' }}
      >
        Passer
      </button>

      {/* Slider content */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {SLIDES.map((slide, index) => {
          const isActive = index === currentSlide;
          const isPast = index < currentSlide;
          const isFuture = index > currentSlide;
          
          let transform = 'translateX(0)';
          let opacity = 1;
          
          if (isPast) {
            transform = 'translateX(-100%)';
            opacity = 0;
          } else if (isFuture) {
            transform = 'translateX(100%)';
            opacity = 0;
          }

          return (
            <div
              key={index}
              className="absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-500 ease-out"
              style={{ transform, opacity, pointerEvents: isActive ? 'auto' : 'none' }}
            >
              <div className="w-full max-w-[300px] aspect-square rounded-[32px] overflow-hidden mb-12 shadow-2xl relative"
                   style={{ border: '4px solid var(--imx-surface)' }}>
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--imx-bg-app)]/20 to-transparent z-10" />
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                />
              </div>
              
              <h2 className="font-nunito font-900 text-2xl text-[var(--imx-text-primary)] text-center mb-4 px-4 leading-tight">
                {slide.title}
              </h2>
              <p className="text-[var(--imx-text-secondary)] text-center text-[15px] px-6" style={{ fontFamily: 'Space Grotesk' }}>
                {slide.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer controls */}
      <div className="p-8 pb-12 flex flex-col items-center justify-center gap-10">
        {/* Pagination dots */}
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === currentSlide ? '24px' : '8px',
                background: i === currentSlide ? 'var(--imx-accent-light)' : 'var(--imx-border)'
              }}
            />
          ))}
        </div>

        {/* Action button */}
        <button
          onClick={handleNext}
          className="w-full max-w-[300px] flex items-center justify-center gap-2 py-4 rounded-[20px] text-white font-bold text-base transition-transform active:scale-95 shadow-xl shadow-purple-500/20"
          style={{ background: 'var(--imx-accent)', fontFamily: 'Sora' }}
        >
          {currentSlide === SLIDES.length - 1 ? 'Commencer' : 'Suivant'}
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};
