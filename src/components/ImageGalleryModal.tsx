import React, { useState, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Grid } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface Photo {
  id: string;
  photo_url: string;
}

interface ImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: Photo[];
  initialIndex?: number;
}

const ImageGalleryModal: React.FC<ImageGalleryModalProps> = ({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'slideshow'>('grid');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Synchronize index when opening modal if we passed an initial index
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setViewMode('grid');
    }
  }, [isOpen, initialIndex]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = () => {
    haptics.light();
    onClose();
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return;
      const diff = touchStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentIndex < photos.length - 1) {
          setCurrentIndex(currentIndex + 1);
          haptics.light();
        } else if (diff < 0 && currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
          haptics.light();
        }
      }
      setTouchStart(null);
    },
    [touchStart, currentIndex, photos.length]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-[390px] h-full bg-[#120D2A] text-white overflow-hidden flex flex-col pointer-events-auto relative shadow-[0_0_80px_rgba(123,63,228,0.2)]">
        {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-4 bg-[#120D2A] shadow-md z-10 relative">
        <div className="flex items-center gap-3">
          {viewMode === 'slideshow' ? (
            <button
              onClick={() => {
                haptics.light();
                setViewMode('grid');
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all active:scale-95"
              aria-label="Retour à la grille"
            >
              <ChevronLeft size={24} />
            </button>
          ) : (
            <div className="w-10"></div> // Placeholder for alignment
          )}
        </div>
        <div className="flex flex-col items-center">
          <span className="font-nunito font-700 text-lg">
            {viewMode === 'grid' ? 'Toutes les photos' : `${currentIndex + 1} / ${photos.length}`}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all active:scale-95"
          aria-label="Fermer la galerie"
        >
          <X size={24} />
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto relative">
        {viewMode === 'grid' ? (
          <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((photo, idx) => (
              <button
                key={photo.id}
                onClick={() => {
                  haptics.light();
                  setCurrentIndex(idx);
                  setViewMode('slideshow');
                }}
                className="relative aspect-square w-full rounded-xl overflow-hidden active:scale-95 transition-transform"
              >
                <img
                  src={`${photo.photo_url}?width=400&format=webp`}
                  alt={`Photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center relative bg-black"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={`${photos[currentIndex].photo_url}?width=1200&format=webp`}
              alt={`Photo ${currentIndex + 1}`}
              className="w-full h-full object-contain"
            />

            {/* Navigation arrows for Desktop/Large screens */}
            {currentIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((prev) => prev - 1);
                  haptics.light();
                }}
                className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full items-center justify-center bg-black/50 text-white/80 hover:bg-black/80 hover:text-white transition-all backdrop-blur-sm"
              >
                <ChevronLeft size={32} />
              </button>
            )}
            {currentIndex < photos.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex((prev) => prev + 1);
                  haptics.light();
                }}
                className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full items-center justify-center bg-black/50 text-white/80 hover:bg-black/80 hover:text-white transition-all backdrop-blur-sm"
              >
                <ChevronRight size={32} />
              </button>
            )}

            {/* Thumbnails below the image */}
            <div className="absolute bottom-6 left-0 right-0 px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide items-center">
               <div className="mx-auto flex gap-2">
                {photos.map((photo, idx) => (
                  <button
                    key={photo.id}
                    onClick={() => {
                      haptics.light();
                      setCurrentIndex(idx);
                    }}
                    className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden transition-all ${
                      idx === currentIndex
                        ? 'ring-2 ring-[#A855F7] ring-offset-2 ring-offset-black opacity-100 scale-110'
                        : 'opacity-40 hover:opacity-100'
                    }`}
                  >
                    <img src={`${photo.photo_url}?width=100&format=webp`} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default ImageGalleryModal;
