import React, { useState, useEffect } from 'react';
import { Home, X, Plus } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface PromoCarouselProps {
  onDismiss: () => void;
  onPublishClick: () => void;
}

const customStyles = `
  @keyframes subtleZoom {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
  .animate-subtle-zoom {
    animation: subtleZoom 8s ease-in-out infinite;
  }
`;

const CAROUSEL_DATA = [
  {
    id: 'publish',
    image: '/images/house.jpg',
    title: 'Vous avez un bien immobilier ?',
    desc: 'Publiez votre annonce et trouvez rapidement des acheteurs ou locataires.',
    actionLabel: 'Publier une annonce',
    actionIcon: <Plus size={14} className="text-[#17132B]" />,
    themeColor: '#7B3FE4'
  },
  {
    id: 'relax',
    image: '/images/relax.jpg',
    title: 'Mettez-vous à l\'aise !',
    desc: 'Explorez les meilleures offres de votre région en toute simplicité.',
    actionLabel: 'Rechercher',
    actionIcon: <Home size={14} className="text-[#17132B]" />,
    themeColor: '#10B981'
  },
  {
    id: 'support',
    image: '/images/support.jpg',
    title: 'Besoin d\'un accompagnement ?',
    desc: 'Notre équipe est là pour sécuriser vos démarches.',
    actionLabel: 'Contacter le support',
    actionIcon: <span className="font-bold text-[#17132B] text-[12px]">?</span>,
    themeColor: '#F59E0B'
  }
];

export const PromoCarousel: React.FC<PromoCarouselProps> = ({ onDismiss, onPublishClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % CAROUSEL_DATA.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const handleAction = (id: string) => {
    haptics.medium();
    if (id === 'publish') onPublishClick();
  };

  const handleTouchStart = () => setIsPaused(true);
  const handleTouchEnd = () => setIsPaused(false);

  const currentItem = CAROUSEL_DATA[currentIndex];

  return (
    <div className="px-6 mb-8">
      <style>{customStyles}</style>
      <div 
        className="rounded-[28px] relative overflow-hidden shadow-2xl shadow-black/10 min-h-[220px]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <button 
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white z-20 active:scale-95 transition-transform"
        >
          <X size={16} />
        </button>

        {/* Carousel Content Container */}
        <div 
          className="flex transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] h-full absolute inset-0"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {CAROUSEL_DATA.map((item, index) => (
            <div key={item.id} className="w-full h-full flex-shrink-0 relative flex flex-col justify-end p-6">
              
              {/* Background Image full cover */}
              <div className="absolute inset-0 z-0">
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    className="w-full h-full object-cover object-top animate-subtle-zoom" 
                  />
                  {/* Premium Gradient Overlay from bottom to top */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#17132B]/95 via-[#17132B]/40 to-transparent"></div>
              </div>

              {/* Text Content */}
              <div className="relative z-10 w-full pt-16">
                <h3 className="font-nunito font-900 text-[18px] text-white mb-1.5 leading-tight tracking-tight drop-shadow-md">
                  {item.title}
                </h3>
                <p className="font-space-grotesk text-[12px] text-white/90 mb-4 font-medium leading-relaxed drop-shadow-md max-w-[90%]">
                  {item.desc}
                </p>
                <button 
                  onClick={() => handleAction(item.id)}
                  className="bg-white/20 backdrop-blur-md border border-white/20 text-white font-nunito font-900 rounded-full pl-5 pr-1.5 py-1.5 text-[12px] flex items-center gap-3 shadow-xl active:scale-95 transition-transform w-fit"
                >
                  <span className="drop-shadow-sm">{item.actionLabel}</span>
                  <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-inner">
                    {item.actionIcon}
                  </div>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Indicators */}
        <div className="absolute bottom-3 right-6 flex justify-end gap-1.5 z-20">
          {CAROUSEL_DATA.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCurrentIndex(idx);
                haptics.light();
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentIndex === idx ? 'w-5 bg-white shadow-sm' : 'w-1.5 bg-white/40'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
