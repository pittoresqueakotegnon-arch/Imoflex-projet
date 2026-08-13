import React, { useState, useEffect } from 'react';
import { ImageSkeleton } from './ImageSkeleton';
import { getOriginalUrlFromOptimized } from '../lib/utils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  skeletonClassName?: string;
  loading?: 'lazy' | 'eager';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  skeletonClassName = '',
  loading = 'lazy',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  const [optimizedSrc, setOptimizedSrc] = useState(src);

  useEffect(() => {
    setIsLoaded(false);
    setError(false);
    
    // Détection basique pour économiser les données mobiles
    const connection = (navigator as any).connection;
    const saveData = connection && connection.saveData === true;
    
    // Si c'est une URL Supabase Storage, on peut potentiellement demander une qualité inférieure
    // (Ajustement selon la config exacte du backend, ici on simule l'ajout d'un paramètre)
    if (saveData && src.includes('supabase.co/storage') && !src.includes('?')) {
      // setOptimizedSrc(`${src}?quality=50`); // Dépend de l'activation des transformations d'images Supabase
      setOptimizedSrc(src); 
    } else {
      setOptimizedSrc(src);
    }
  }, [src]);

  return (
    <div className={`relative ${className}`}>
      {!isLoaded && !error && (
        <ImageSkeleton className={`absolute inset-0 w-full h-full ${skeletonClassName}`} />
      )}
      
      <img
        src={optimizedSrc}
        alt={alt}
        decoding="async"
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          const originalSrc = getOriginalUrlFromOptimized(optimizedSrc);
          if (optimizedSrc !== originalSrc) {
            setOptimizedSrc(originalSrc);
          } else {
            setError(true);
            setIsLoaded(true); // Stop showing skeleton on error
          }
        }}
        loading={loading}
        {...props}
      />
      
      {error && (
        <div className="absolute inset-0 bg-[var(--imx-surface)] flex items-center justify-center text-[var(--imx-text-secondary)] text-xs font-grotesk">
          Image non disponible
        </div>
      )}
    </div>
  );
};
